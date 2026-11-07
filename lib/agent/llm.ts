// The LLM behind Vera's agent (parameter extraction and tool choice). The provider comes from
// lib/ai.ts: agentLlmProvider() reads AGENT_LLM_PROVIDER, then LLM_PROVIDER, then whichever of
// ANTHROPIC_API_KEY / OLLAMA_URL is set.
//   anthropic: Claude through the Messages API (plain fetch, `tools` + `tool_choice`).
//   ollama:    a local model through POST ${OLLAMA_URL}/api/chat. This is the on-device mode for
//              the Jetson (default qwen2.5:3b): no cloud call leaves the box for actions.
//   none:      no LLM; callers fall back to deterministic extraction.
// Conversation (askVera) is separate and goes through askClaude in lib/ai.ts. Keys are read per
// call and never logged.

import { agentLlmProvider, AI_MODEL, normalizeTurns, ollamaModel, type ChatTurn } from "../ai";

export type AgentProvider = "anthropic" | "ollama" | "none";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_TIMEOUT_MS = 12_000;
const OLLAMA_TIMEOUT_MS = 30_000;

export function agentProvider(): AgentProvider {
  return agentLlmProvider() ?? "none";
}

function ollamaUrl(): string {
  let url = process.env.OLLAMA_URL?.trim() || "";
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, "");
}

export interface LlmTool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface LlmToolCall {
  name: string;
  input: Record<string, unknown>;
}

// force: the model must call exactly this tool. any: it must call one of them. auto: it may answer in text.
export type ToolChoice = { force: string } | "any" | "auto";

// ---------- response parsing (pure, unit tested) ----------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseAnthropicToolUse(json: unknown): LlmToolCall | null {
  const content = asRecord(json).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    const b = asRecord(block);
    if (b.type === "tool_use" && typeof b.name === "string") return { name: b.name, input: asRecord(b.input) };
  }
  return null;
}

function parseArguments(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return asRecord(JSON.parse(args));
    } catch {
      return {};
    }
  }
  return asRecord(args);
}

// Ollama puts calls in message.tool_calls. Small models sometimes print the call as JSON text
// instead, so that is accepted too, but only for a tool that was actually offered.
export function parseOllamaToolCall(json: unknown, allowed: string[] = []): LlmToolCall | null {
  const message = asRecord(asRecord(json).message);
  const calls = message.tool_calls;
  if (Array.isArray(calls)) {
    for (const call of calls) {
      const fn = asRecord(asRecord(call).function);
      if (typeof fn.name === "string") return { name: fn.name, input: parseArguments(fn.arguments) };
    }
  }
  const content = typeof message.content === "string" ? message.content : "";
  const match = content.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = asRecord(JSON.parse(match[0]));
      const name = typeof obj.name === "string" ? obj.name : null;
      if (name && allowed.includes(name)) return { name, input: parseArguments(obj.arguments ?? obj.parameters) };
    } catch {
      // not JSON: no tool call
    }
  }
  return null;
}

// ---------- calls ----------

async function anthropicToolCall(args: {
  system: string;
  turns: ChatTurn[];
  tools: LlmTool[];
  choice: ToolChoice;
  maxTokens: number;
}): Promise<LlmToolCall | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const messages = normalizeTurns(args.turns);
  if (!messages.length) return null;
  const tool_choice =
    args.choice === "auto" ? { type: "auto" } : args.choice === "any" ? { type: "any" } : { type: "tool", name: args.choice.force };
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      messages,
      tools: args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice,
    }),
    signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[agent llm] Claude API returned ${res.status}`);
    return null;
  }
  return parseAnthropicToolUse(await res.json().catch(() => null));
}

async function ollamaToolCall(args: {
  system: string;
  turns: ChatTurn[];
  tools: LlmTool[];
  choice: ToolChoice;
}): Promise<LlmToolCall | null> {
  const url = ollamaUrl();
  if (!url) return null;
  // Ollama has no tool_choice, so forcing a tool means offering only that one and saying so.
  const forced = typeof args.choice === "object" ? args.choice.force : null;
  const offered = forced ? args.tools.filter((t) => t.name === forced) : args.tools;
  if (!offered.length) return null;
  const system = forced ? `${args.system}\nYou must respond by calling the function ${forced}.` : args.system;
  const messages = [{ role: "system", content: system }, ...normalizeTurns(args.turns)];
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      messages,
      tools: offered.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      stream: false,
      keep_alive: -1, // stay loaded: a cold load takes ~15 s on the Jetson
      options: { temperature: 0, num_ctx: 4096 },
    }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[agent llm] Ollama returned ${res.status}`);
    return null;
  }
  return parseOllamaToolCall(await res.json().catch(() => null), offered.map((t) => t.name));
}

// Asks the model to call one of `tools`. Returns null when there is no LLM, it errors, times out
// or doesn't call a tool: the caller then uses its deterministic fallback.
export async function llmToolCall(args: {
  system: string;
  turns: ChatTurn[];
  tools: LlmTool[];
  choice: ToolChoice;
  maxTokens?: number;
}): Promise<LlmToolCall | null> {
  const provider = agentProvider();
  if (provider === "none") return null;
  try {
    const call =
      provider === "anthropic"
        ? await anthropicToolCall({ ...args, maxTokens: args.maxTokens ?? 400 })
        : await ollamaToolCall(args);
    if (!call) return null;
    // Only a tool we offered counts; anything else is treated as no answer.
    return args.tools.some((t) => t.name === call.name) ? call : null;
  } catch (err) {
    console.error("[agent llm]", err instanceof Error ? err.name : "unknown error");
    return null;
  }
}
