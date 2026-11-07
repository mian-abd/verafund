import { afterEach, describe, expect, it } from "vitest";
import { agentProvider, parseAnthropicToolUse, parseOllamaToolCall } from "./llm";

const KEYS = ["ANTHROPIC_API_KEY", "OLLAMA_URL", "LLM_PROVIDER", "AGENT_LLM_PROVIDER", "OLLAMA_MODEL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("agentProvider (delegates to lib/ai.ts)", () => {
  it("defaults to anthropic when a key is set, ollama when only OLLAMA_URL is, none otherwise", () => {
    setEnv({ ANTHROPIC_API_KEY: "k" });
    expect(agentProvider()).toBe("anthropic");
    setEnv({ OLLAMA_URL: "http://127.0.0.1:11434" });
    expect(agentProvider()).toBe("ollama");
    setEnv({});
    expect(agentProvider()).toBe("none");
  });

  it("AGENT_LLM_PROVIDER lets actions run on-device while conversation stays on Claude", () => {
    setEnv({ ANTHROPIC_API_KEY: "k", OLLAMA_URL: "http://127.0.0.1:11434", AGENT_LLM_PROVIDER: "ollama" });
    expect(agentProvider()).toBe("ollama");
  });

  it("falls back to LLM_PROVIDER when AGENT_LLM_PROVIDER isn't set", () => {
    setEnv({ ANTHROPIC_API_KEY: "k", OLLAMA_URL: "http://127.0.0.1:11434", LLM_PROVIDER: "ollama" });
    expect(agentProvider()).toBe("ollama");
  });
});

describe("tool-call parsing", () => {
  it("reads a Claude tool_use block", () => {
    const json = { content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t", name: "cancel_subscription", input: { merchant: "Netflix" } }] };
    expect(parseAnthropicToolUse(json)).toEqual({ name: "cancel_subscription", input: { merchant: "Netflix" } });
    expect(parseAnthropicToolUse({ content: [{ type: "text", text: "no tool" }] })).toBeNull();
    expect(parseAnthropicToolUse(null)).toBeNull();
  });

  it("reads an Ollama tool call with object or string arguments", () => {
    const obj = { message: { tool_calls: [{ function: { name: "pause_card", arguments: { merchant: "Spotify" } } }] } };
    expect(parseOllamaToolCall(obj)).toEqual({ name: "pause_card", input: { merchant: "Spotify" } });
    const str = { message: { tool_calls: [{ function: { name: "pause_card", arguments: '{"merchant":"Spotify"}' } }] } };
    expect(parseOllamaToolCall(str)).toEqual({ name: "pause_card", input: { merchant: "Spotify" } });
  });

  it("accepts a call printed as JSON text, but only for an offered tool", () => {
    const text = { message: { content: 'Sure: {"name": "set_budget", "arguments": {"category": "food", "monthly_limit_dollars": 300}}' } };
    expect(parseOllamaToolCall(text, ["set_budget"])).toEqual({ name: "set_budget", input: { category: "food", monthly_limit_dollars: 300 } });
    expect(parseOllamaToolCall(text, ["pause_card"])).toBeNull();
    expect(parseOllamaToolCall({ message: { content: "just chatting" } }, ["set_budget"])).toBeNull();
  });
});
