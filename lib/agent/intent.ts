// Decision layer for the agent, built on TypeSafe Jev (lib/decision.ts):
//   1. Intent routing: a Jev "choice" over the action menu plus "question".
//   2. Confirmation understanding in voice mode: a Jev "noul" ("did the user clearly agree?").
// Jev is fast but advisory. If it is unavailable or under 0.55 confident, the LLM's own tool
// choice decides, then keyword rules. Deterministic rules keep the last word on safety: a plain
// "no" always wins, and an information question is never turned into an action.

import { jevDecide, logDecision } from "../decision";
import type { ChatTurn } from "../ai";
import { agentProvider, llmToolCall } from "./llm";
import { allLlmTools, chooseSystemPrompt, intentFromLlmName, jevCriteria, jevState } from "./tools";
import { hasActionCue, hasNegation, isInformationQuestion, keywordIntent, parseConfirmation, type Confirmation } from "./text";
import { isIntent, type AgentContext, type Intent, type RawParams } from "./types";

export const JEV_MIN_CONFIDENCE = 0.55;

export type RouteSource = "jev" | "llm" | "rules";

export interface RouteInputs {
  jev: { choice: Intent; confidence: number } | null;
  llm: Intent | null;
  rules: Intent;
  informational: boolean;
}

// Combines the three routers and the safety rails. Pure.
export function settleRoute(i: RouteInputs): { intent: Intent; source: RouteSource } {
  let intent: Intent;
  let source: RouteSource;
  if (i.jev && i.jev.confidence >= JEV_MIN_CONFIDENCE) {
    intent = i.jev.choice;
    source = "jev";
  } else if (i.llm) {
    intent = i.llm;
    source = "llm";
  } else {
    intent = i.rules;
    source = "rules";
  }
  // "How do I cancel Netflix?" asks for information, not for an action.
  if (intent !== "question" && i.informational) {
    intent = "question";
    source = "rules";
  }
  // An unmistakable command ("cancel Netflix") that a router read as a question still gets proposed.
  // It is only a proposal: nothing runs until the user confirms.
  if (intent === "question" && i.rules !== "question" && !i.informational) {
    intent = i.rules;
    source = "rules";
  }
  return { intent, source };
}

// Jev: which one thing does the user want? Null when Jev is off, slow or unsure what to say.
async function jevIntent(utterance: string, ctx: AgentContext): Promise<{ choice: Intent; confidence: number; latencyMs: number } | null> {
  const res = await jevDecide(jevState(utterance, ctx), {
    intent: {
      type: "choice",
      instructions:
        "Which single thing does the user want their finance assistant to do right now? Choose question unless they are clearly asking for one of the actions to be carried out.",
      criteria: jevCriteria(),
    },
  });
  const a = res?.answers.intent;
  if (!res || !a) return null;
  let choice: unknown = a.choice;
  let confidence = typeof a.confidence === "number" ? a.confidence : undefined;
  if (!isIntent(choice) && a.probabilities) {
    const best = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1])[0];
    if (best) {
      choice = best[0];
      confidence ??= best[1];
    }
  }
  if (!isIntent(choice)) return null;
  return { choice, confidence: confidence ?? 0, latencyMs: res.latencyMs };
}

// The LLM picks a tool itself when Jev is out. Returns null with no LLM or no clear tool call.
async function llmIntent(utterance: string, ctx: AgentContext, turns: ChatTurn[]): Promise<{ intent: Intent; params: RawParams } | null> {
  if (agentProvider() === "none") return null;
  const call = await llmToolCall({
    system: chooseSystemPrompt(ctx),
    turns: [...turns, { role: "user", content: utterance }],
    tools: allLlmTools(),
    choice: "any",
  });
  if (!call) return null;
  const intent = intentFromLlmName(call.name);
  return intent ? { intent, params: call.input } : null;
}

export interface Route {
  intent: Intent;
  source: RouteSource;
  // The sentence contains an action verb: a failed parameter check deserves a clarifying question.
  // Without one (a paraphrase Jev read as an action), a failed check just means "chat instead".
  explicit: boolean;
  llmParams?: RawParams;
}

export async function routeIntent(workspaceId: string, utterance: string, ctx: AgentContext, turns: ChatTurn[]): Promise<Route> {
  const started = Date.now();
  const rules = keywordIntent(utterance, ctx);
  const informational = isInformationQuestion(utterance);
  const cue = hasActionCue(utterance);

  // Plain questions ("how much do I spend on food?") are conversation: no router can turn them into
  // an action, so skip the Jev and LLM calls and go straight to the answer.
  if (informational) {
    await logDecision({
      workspaceId,
      purpose: "agent_intent",
      engine: "rules",
      input: utterance,
      output: { intent: "question", source: "rules", reason: "information question" },
      latencyMs: Date.now() - started,
    });
    return { intent: "question", source: "rules", explicit: false };
  }

  const jev = await jevIntent(utterance, ctx);
  // The LLM only gets asked when Jev can't decide: it costs more and is slower.
  let llm: { intent: Intent; params: RawParams } | null = null;
  if (!jev || jev.confidence < JEV_MIN_CONFIDENCE) llm = await llmIntent(utterance, ctx, turns);

  const settled = settleRoute({
    jev: jev ? { choice: jev.choice, confidence: jev.confidence } : null,
    llm: llm?.intent ?? null,
    rules,
    informational,
  });

  await logDecision({
    workspaceId,
    purpose: "agent_intent",
    engine: settled.source === "jev" ? "jev" : settled.source === "llm" ? "llm" : "rules",
    input: utterance,
    output: {
      intent: settled.intent,
      source: settled.source,
      jev: jev ? { choice: jev.choice, confidence: jev.confidence } : null,
      llm: llm?.intent ?? null,
      rules,
    },
    latencyMs: Date.now() - started,
  });

  return {
    intent: settled.intent,
    source: settled.source,
    explicit: cue,
    // Parameters the LLM already extracted while choosing the tool, if it chose the same one.
    ...(settled.source === "llm" && llm && llm.intent === settled.intent ? { llmParams: llm.params } : {}),
  };
}

// ---------- spoken confirmation ----------

// Combines the regex reading of "yeah do it" with Jev's probability that the user clearly agreed.
// Pure. A plain no always wins. Jev can confirm a yes or catch a doubtful one, but it can't
// turn something with an objection in it into a yes.
export function combineConfirmation(transcript: string, jevProbability: number | null): Confirmation {
  const regex = parseConfirmation(transcript);
  if (regex === "no") return "no";
  if (jevProbability === null) return regex;
  if (regex === "yes") return jevProbability >= 0.6 ? "yes" : "unclear";
  // The regex found no clear answer: Jev may read "I guess that's fine" as a yes, never past an objection.
  if (hasNegation(transcript)) return "unclear";
  if (jevProbability >= 0.9) return "yes";
  if (jevProbability <= 0.1) return "no";
  return "unclear";
}

export async function decideConfirmation(
  workspaceId: string,
  summary: string,
  transcript: string,
): Promise<{ decision: Confirmation; engine: "jev" | "rules" }> {
  const started = Date.now();
  const regex = parseConfirmation(transcript);
  // A plain no needs no model.
  const res =
    regex === "no"
      ? null
      : await jevDecide(
          { vera_asked: summary, user_replied: transcript },
          { agreed: { type: "noul", instructions: "Did the user clearly agree to go ahead?" } },
        );
  const p = typeof res?.answers.agreed?.noul === "number" ? res.answers.agreed.noul : null;
  const decision = combineConfirmation(transcript, p);
  await logDecision({
    workspaceId,
    purpose: "agent_confirm",
    engine: p === null ? "rules" : "jev",
    input: transcript,
    output: { decision, regex, jev: p },
    latencyMs: Date.now() - started,
  });
  return { decision, engine: p === null ? "rules" : "jev" };
}
