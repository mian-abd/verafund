// Vera's action agent, end to end.
//
//   message -> route (Jev, then LLM, then keywords) -> extract parameters -> validate against
//   real workspace data -> store a PENDING agent_actions row with a plain-English read-back ->
//   wait. Nothing executes until the user confirms that exact action id (a button click, or a
//   spoken yes in call mode). Pending actions expire after five minutes.
//
// The AI only ever proposes. remember, forget and find_subscriptions are the only tools that run
// without a confirmation, because they change nothing about the user's money.

import type { ChatTurn } from "../ai";
import { logDecision } from "../decision";
import { discoverSubscriptions } from "../discovery";
import { formatCents } from "../format";
import { GuardError } from "../guard";
import { askVera } from "../vera-chat";
import { assertUnderHourlyLimit, MAX_QUESTION, persistTurns, recentTurns } from "./chatlog";
import { loadAgentContext } from "./context";
import { buildHints } from "./hints";
import { executeAction, type Via } from "./execute";
import { decideConfirmation, routeIntent } from "./intent";
import { agentProvider, llmToolCall } from "./llm";
import { addMemory, forgetMemories, listMemories } from "./memory";
import { matchPreset } from "./presets";
import {
  cancelPendingAction,
  claimAction,
  createPendingAction,
  decodeResult,
  expireStaleActions,
  finishAction,
  getAction,
  isExpired,
  latestPendingAction,
  listRecentActions,
  recordExecutedAction,
} from "./store";
import { extractParamsDeterministic, hasActionCue, hasConfirmationWords, parseConfirmation, wordCount } from "./text";
import { extractSystemPrompt, llmToolFor, TOOL_DEFS } from "./tools";
import { isToolName, needsConfirmation, type ActionResult, type AgentContext, type AgentOverview, type AgentReply, type RawParams, type ToolName } from "./types";
import { planGuard, validateAction } from "./validate";
import type { AgentAction } from "../db/schema";

export interface AgentOpts {
  // The page the user is on, as a readable name, so answers can refer to it.
  page?: string;
  // Spoken: replies are short and a spoken yes can confirm.
  voice?: boolean;
  // Where the confirm buttons are. The Advisor page keeps them under "Vera's actions".
  surface?: "dock" | "advisor";
}

const FREE_TEXT_KEYS: Record<string, ToolName[]> = {
  merchant: ["create_card"],
  fact: ["remember"],
  fact_substring: ["forget"],
};

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

// Literal text beats an LLM guess for amounts and for names that already exist; the LLM is
// better at free text such as a new merchant name or a fact to remember.
export function mergeParams(tool: ToolName, llm: RawParams, det: RawParams): RawParams {
  const out: RawParams = { ...llm };
  for (const [k, v] of Object.entries(det)) {
    if (!present(v)) continue;
    if (FREE_TEXT_KEYS[k]?.includes(tool) && present(out[k])) continue;
    out[k] = v;
  }
  return out;
}

async function buildParams(tool: ToolName, utterance: string, ctx: AgentContext, turns: ChatTurn[], fromRouter?: RawParams): Promise<RawParams> {
  const det = extractParamsDeterministic(tool, utterance, ctx);
  const complete = TOOL_DEFS[tool].required.every((k) => present(det[k]));
  let llm: RawParams = fromRouter ?? {};
  if (!complete && !fromRouter && agentProvider() !== "none") {
    // tool_choice forces this one tool, so the parameters come back structured.
    const call = await llmToolCall({
      system: extractSystemPrompt(ctx),
      turns: [...turns, { role: "user", content: utterance }],
      tools: [llmToolFor(tool)],
      choice: { force: tool },
    });
    if (call && call.name === tool) llm = call.input;
  }
  return mergeParams(tool, llm, det);
}

function proposalText(summary: string, surface: AgentOpts["surface"]): string {
  return surface === "advisor" ? `${summary} Tap “Yes, do it” under Vera's actions below to confirm, or “No” to cancel.` : summary;
}

function replyText(r: AgentReply): string {
  return r.kind === "confirm" ? r.summary : r.text;
}

// ---------- tools that run without a confirmation ----------

async function runFind(workspaceId: string): Promise<ActionResult> {
  let found;
  try {
    found = await discoverSubscriptions(workspaceId);
  } catch (err) {
    console.error("[agent find_subscriptions]", err instanceof Error ? err.message : err);
    return { ok: false, text: "I couldn't scan your transactions just now. Try again in a moment." };
  }
  if (found.length === 0) return { ok: true, text: "I looked through your transactions and didn't find any recurring charges." };
  const open = found.filter((f) => !f.alreadyGuarded);
  const shown = (open.length ? open : found).slice(0, 4);
  const list = shown.map((f) => `${f.merchant} ${formatCents(f.amountCents)} a ${f.cycle === "monthly" ? "month" : "year"}`).join(", ");
  const more = (open.length ? open.length : found.length) - shown.length;
  return {
    ok: true,
    text:
      open.length > 0
        ? `I found ${found.length} recurring charge${found.length === 1 ? "" : "s"}, and ${open.length} ${open.length === 1 ? "isn't" : "aren't"} guarded by a card yet: ${list}${more > 0 ? `, and ${more} more` : ""}. Want me to guard ${open.length === 1 ? "it" : "them"}?`
        : `I found ${found.length} recurring charge${found.length === 1 ? "" : "s"} (${list}), and they all already have a guarded card.`,
  };
}

async function runRemember(workspaceId: string, fact: string): Promise<ActionResult> {
  const r = await addMemory(workspaceId, fact, "user");
  if (r.added) return { ok: true, text: `Got it. I'll remember: ${fact.replace(/\s+/g, " ").trim().slice(0, 200)}` };
  if (r.reason === "duplicate") return { ok: true, text: "I already know that." };
  if (r.reason === "full") return { ok: false, text: "I'm already remembering as much as I can. Ask me to forget something first." };
  return { ok: false, text: "What would you like me to remember?" };
}

async function runForget(workspaceId: string, fragment: string): Promise<ActionResult> {
  const removed = await forgetMemories(workspaceId, fragment);
  if (removed.length === 0) return { ok: false, text: "I don't have anything remembered about that." };
  return { ok: true, text: `Okay, I've forgotten ${removed.length === 1 ? `that ${removed[0]}` : `${removed.length} things about that`}.` };
}

// ---------- confirming ----------

function describeResolved(row: AgentAction): AgentReply {
  const r = decodeResult(row.result);
  switch (row.status) {
    case "executed":
      return { kind: "done", ok: true, text: r?.text ?? "That was already done.", actionId: row.id, ...(r?.draft ? { draft: r.draft } : {}), refresh: false };
    case "failed":
      return { kind: "done", ok: false, text: r?.text ?? "That didn't go through.", actionId: row.id, refresh: false };
    case "cancelled":
      return { kind: "cancelled", text: r?.text ?? "That request was already cancelled.", actionId: row.id, status: "cancelled" };
    case "expired":
      return { kind: "cancelled", text: "That request timed out, so nothing was done. Ask me again if you still want it.", actionId: row.id, status: "expired" };
    default:
      return { kind: "clarify", text: "I'm still working on that one. Give me a second.", actionId: row.id };
  }
}

// Answers one pending action. `fresh` is false when it had already been answered (a double click).
export async function confirmAction(
  workspaceId: string,
  actionId: string,
  decision: "yes" | "no",
  via: Via,
): Promise<{ reply: AgentReply; fresh: boolean }> {
  await expireStaleActions(workspaceId);
  const action = await getAction(workspaceId, actionId);
  if (!action) throw new GuardError("That request doesn't exist anymore.");
  if (action.status !== "pending") return { reply: describeResolved(action), fresh: false };
  if (isExpired(action.createdAt)) {
    await expireStaleActions(workspaceId);
    return { reply: { kind: "cancelled", text: "That request timed out, so nothing was done. Ask me again if you still want it.", actionId, status: "expired" }, fresh: false };
  }

  if (decision === "no") {
    const cancelled = await cancelPendingAction(workspaceId, actionId, "You said no, so nothing was changed.");
    if (!cancelled) {
      const fresh = await getAction(workspaceId, actionId);
      return { reply: fresh ? describeResolved(fresh) : { kind: "clarify", text: "I couldn't cancel that one." }, fresh: false };
    }
    return { reply: { kind: "cancelled", text: "Okay, I won't do that. Nothing was changed.", actionId, status: "cancelled" }, fresh: true };
  }

  if (!isToolName(action.tool) || !needsConfirmation(action.tool)) {
    await finishAction(workspaceId, actionId, "failed", { ok: false, text: "Vera can't run that kind of request." });
    return { reply: { kind: "done", ok: false, text: "Vera can't run that kind of request.", actionId, refresh: false }, fresh: true };
  }

  // One confirmation, one execution: whoever claims the row first runs it.
  const claimed = await claimAction(workspaceId, actionId);
  if (!claimed) {
    const current = await getAction(workspaceId, actionId);
    return { reply: current ? describeResolved(current) : { kind: "clarify", text: "I couldn't find that request." }, fresh: false };
  }

  let outcome: ActionResult;
  try {
    const params = JSON.parse(action.params) as Record<string, unknown>;
    outcome = await executeAction(workspaceId, action.tool, params, via);
  } catch (err) {
    const text = err instanceof GuardError ? err.message : "Something went wrong, so I couldn't finish that. Please try again.";
    if (!(err instanceof GuardError)) console.error("[agent execute]", err);
    await finishAction(workspaceId, actionId, "failed", { ok: false, text });
    return { reply: { kind: "done", ok: false, text, actionId, refresh: true }, fresh: true };
  }
  await finishAction(workspaceId, actionId, outcome.ok ? "executed" : "failed", outcome);
  return {
    reply: { kind: "done", ok: outcome.ok, text: outcome.text, actionId, ...(outcome.draft ? { draft: outcome.draft } : {}), refresh: true },
    fresh: true,
  };
}

// A tap on "Yes, do it" / "No". Recorded in the shared conversation like any other turn.
export async function confirmFromButton(workspaceId: string, actionId: string, decision: "yes" | "no"): Promise<AgentReply> {
  const { reply, fresh } = await confirmAction(workspaceId, actionId, decision, "tap");
  if (fresh) await persistTurns(workspaceId, decision === "yes" ? "Yes, do it." : "No, don't do that.", replyText(reply));
  return reply;
}

// ---------- spoken yes / no ----------

async function resolveVoice(workspaceId: string, action: AgentAction, transcript: string, opts: AgentOpts): Promise<AgentReply> {
  const { decision } = await decideConfirmation(workspaceId, action.summary, transcript);
  if (decision === "yes" || decision === "no") {
    const { reply } = await confirmAction(workspaceId, action.id, decision, "voice");
    await persistTurns(workspaceId, transcript, replyText(reply));
    return reply;
  }
  // Not a clear answer. If it sounds like a different request, handle that instead.
  if (!hasConfirmationWords(transcript) && wordCount(transcript) >= 3 && hasActionCue(transcript)) {
    await assertUnderHourlyLimit(workspaceId);
    return runAgent(workspaceId, transcript, { ...opts, voice: true }, true);
  }
  const text = "Sorry, I didn't catch a clear yes or no. Should I go ahead? Please say yes or no.";
  await persistTurns(workspaceId, transcript, text);
  return { kind: "clarify", text, actionId: action.id };
}

// The caller's spoken answer to a read-back, for the action it names.
export async function handleVoiceTranscript(
  workspaceId: string,
  rawTranscript: string,
  pendingActionId: string,
  opts: AgentOpts = {},
): Promise<AgentReply> {
  const transcript = rawTranscript.trim().slice(0, MAX_QUESTION);
  if (!transcript) return { kind: "clarify", text: "I didn't hear anything. Should I go ahead? Say yes or no.", actionId: pendingActionId };
  await expireStaleActions(workspaceId);
  const action = await getAction(workspaceId, pendingActionId);
  if (!action) return { kind: "clarify", text: "I don't have anything waiting for your answer. What would you like me to do?" };
  if (action.status !== "pending" || action.result !== null) return describeResolved(action);
  if (isExpired(action.createdAt)) {
    await expireStaleActions(workspaceId);
    return { kind: "cancelled", text: "That request timed out, so nothing was done. Tell me again if you still want it.", actionId: action.id, status: "expired" };
  }
  return resolveVoice(workspaceId, action, transcript, { ...opts, voice: true });
}

// ---------- a new request ----------

async function answerAsQuestion(workspaceId: string, message: string, opts: AgentOpts): Promise<AgentReply> {
  const answer = await askVera(workspaceId, message, { page: opts.page, voice: opts.voice });
  return { kind: "answer", text: answer.text, ai: answer.ai };
}

async function runAgent(workspaceId: string, message: string, opts: AgentOpts, skipPending = false): Promise<AgentReply> {
  const channel = opts.voice ? "voice" : "chat";
  await expireStaleActions(workspaceId);
  const [ctx, pending, turns] = await Promise.all([loadAgentContext(workspaceId), skipPending ? Promise.resolve(null) : latestPendingAction(workspaceId), recentTurns(workspaceId, 6)]);

  // A short reply to a request that is waiting on an answer.
  if (pending && wordCount(message) <= 6) {
    const verdict = parseConfirmation(message);
    if (verdict === "no") {
      const { reply } = await confirmAction(workspaceId, pending.id, "no", opts.voice ? "voice" : "tap");
      await persistTurns(workspaceId, message, replyText(reply));
      return reply;
    }
    if (verdict === "yes") {
      if (opts.voice) return resolveVoice(workspaceId, pending, message, opts);
      // Typed "yes" never executes anything: the person taps the button on the card.
      const text =
        opts.surface === "advisor"
          ? "To keep you in control, please tap “Yes, do it” under Vera's actions below. Or tell me no and I'll cancel it."
          : "To keep you in control, please tap “Yes, do it” on the card above. Or tell me no and I'll cancel it.";
      await persistTurns(workspaceId, message, text);
      return { kind: "clarify", text, actionId: pending.id };
    }
  }

  // Preset commands come first: plain pattern matching, no network call, so they are instant.
  const presetStarted = Date.now();
  const preset = matchPreset(message, ctx);
  if (preset) {
    await logDecision({
      workspaceId,
      purpose: "agent_intent",
      engine: "rules",
      input: message,
      output: { intent: preset.kind === "recall" ? "recall" : preset.tool, source: "preset", label: preset.label },
      latencyMs: Date.now() - presetStarted,
    });
  }

  if (preset?.kind === "recall") {
    const facts = ctx.memories;
    const text = facts.length
      ? `Here's what I remember: ${facts.join("; ")}.`
      : "I'm not remembering anything yet. Say \"remember that\" and tell me what, and I'll keep it.";
    await persistTurns(workspaceId, message, text);
    return { kind: "answer", text };
  }

  // No preset: Jev routes it, then the LLM's own tool choice, then keyword rules.
  const route = preset
    ? ({ intent: preset.tool, source: "rules", explicit: true } as const)
    : await routeIntent(workspaceId, message, ctx, turns);

  if (route.intent === "question") return answerAsQuestion(workspaceId, message, opts);

  const tool = route.intent;
  const raw = preset ? preset.raw : await buildParams(tool, message, ctx, turns, "llmParams" in route ? route.llmParams : undefined);

  let validation;
  if (tool === "guard_subscriptions") {
    let discovered;
    try {
      discovered = await discoverSubscriptions(workspaceId);
    } catch (err) {
      console.error("[agent guard_subscriptions]", err instanceof Error ? err.message : err);
      if (!route.explicit) return answerAsQuestion(workspaceId, message, opts);
      const text = "I couldn't scan your transactions just now, so I can't guard anything yet. Try again in a moment.";
      await persistTurns(workspaceId, message, text);
      return { kind: "clarify", text };
    }
    validation = planGuard(discovered, { text: message, merchants: raw.merchants });
  } else {
    validation = validateAction(tool, raw, ctx);
  }

  if (!validation.ok) {
    // A router guessed an action from a sentence with no action verb and the details don't check out:
    // it was probably just conversation.
    if (!route.explicit) return answerAsQuestion(workspaceId, message, opts);
    await persistTurns(workspaceId, message, validation.clarify);
    return { kind: "clarify", text: validation.clarify };
  }

  if (!needsConfirmation(tool)) {
    let result: ActionResult;
    if (tool === "find_subscriptions") result = await runFind(workspaceId);
    else if (tool === "remember") result = await runRemember(workspaceId, String(validation.params.fact));
    else result = await runForget(workspaceId, String(validation.params.fragment));
    const actionId = await recordExecutedAction(workspaceId, { tool, params: validation.params, summary: validation.summary, channel, result });
    await persistTurns(workspaceId, message, result.text);
    return { kind: "done", ok: result.ok, text: result.text, actionId, refresh: false };
  }

  const actionId = await createPendingAction(workspaceId, { tool, params: validation.params, summary: validation.summary, channel });
  await persistTurns(workspaceId, message, proposalText(validation.summary, opts.surface));
  return { kind: "confirm", actionId, tool, summary: validation.summary };
}

export async function handleAgentMessage(workspaceId: string, rawMessage: string, opts: AgentOpts = {}): Promise<AgentReply> {
  const message = rawMessage.trim();
  if (!message) throw new GuardError("Type a question for Vera first.");
  if (message.length > MAX_QUESTION) throw new GuardError(`Keep questions under ${MAX_QUESTION} characters.`);
  await assertUnderHourlyLimit(workspaceId);
  try {
    return await runAgent(workspaceId, message, opts);
  } catch (err) {
    // A user-facing problem (expired session, a limit) goes straight back. Anything unexpected
    // degrades to a plain answer, so the chat never goes dead because of the agent layer.
    if (err instanceof GuardError) throw err;
    console.error("[agent]", err);
    const answer = await askVera(workspaceId, message, { page: opts.page, voice: opts.voice });
    return { kind: "answer", text: answer.text, ai: answer.ai };
  }
}

// ---------- for the UI ----------

export async function getAgentOverview(workspaceId: string): Promise<AgentOverview> {
  const [actions, memories, pending, ctx] = await Promise.all([
    listRecentActions(workspaceId, 20),
    listMemories(workspaceId),
    latestPendingAction(workspaceId),
    loadAgentContext(workspaceId),
  ]);
  return {
    hints: buildHints(ctx),
    actions,
    memories,
    pending: pending ? { actionId: pending.id, tool: pending.tool, summary: pending.summary, createdAt: pending.createdAt } : null,
  };
}
