// The fixed action menu, described three ways: as LLM tool schemas (parameter extraction),
// as Jev choice criteria (intent routing), and as prompt text. Pure.

import { formatCents } from "../format";
import type { LlmTool } from "./llm";
import type { AgentContext, Intent, ToolName } from "./types";
import { TOOL_NAMES } from "./types";

interface ToolDef {
  // One line for Jev and the LLM: when does this tool apply?
  description: string;
  properties: Record<string, { type: string; description: string; items?: { type: string } }>;
  required: string[];
}

const MERCHANT = { type: "string", description: "The subscription's merchant, exactly as in the user's list." };

export const TOOL_DEFS: Record<ToolName, ToolDef> = {
  cancel_subscription: {
    description: "The user wants to cancel, end or stop paying for one of their subscriptions. Closes its virtual card and drafts a cancellation message.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  pause_card: {
    description: "The user wants to pause, freeze or temporarily turn off a subscription's card without cancelling it.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  resume_card: {
    description: "The user wants to resume, unpause or turn back on a subscription's paused card.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  create_card: {
    description: "The user wants a new guarded virtual card for a company or subscription, with a monthly spending limit.",
    properties: {
      merchant: { type: "string", description: "The company the new card is for, e.g. Hulu." },
      monthly_limit_dollars: { type: "number", description: "The most the card may be charged, in dollars." },
      trial_days: { type: "integer", description: "Length of the free trial in days, only if the user mentions one." },
    },
    required: ["merchant", "monthly_limit_dollars"],
  },
  approve_new_price: {
    description: "A subscription raised its price and was declined for being above the limit; the user approves the new price and wants the limit raised.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  keep_blocking: {
    description: "A subscription tried a higher price and was declined; the user refuses the new price and wants it kept blocked.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  keep_after_trial: {
    description: "The user wants to keep a subscription after its free trial, turning it into a paid plan and unlocking the card.",
    properties: { merchant: MERCHANT },
    required: ["merchant"],
  },
  set_budget: {
    description: "The user wants to set or change the monthly budget limit for a spending category.",
    properties: {
      category: { type: "string", description: "The budget category, e.g. food or entertainment." },
      monthly_limit_dollars: { type: "number", description: "The new monthly limit in dollars." },
    },
    required: ["category", "monthly_limit_dollars"],
  },
  add_to_goal: {
    description: "The user wants to put money toward one of their savings goals.",
    properties: {
      goal_name: { type: "string", description: "The goal's name, exactly as in the user's list." },
      dollars: { type: "number", description: "How many dollars to add." },
    },
    required: ["goal_name", "dollars"],
  },
  pay_debt: {
    description: "The user wants to record a payment toward a debt such as a credit card or loan.",
    properties: {
      debt_name: { type: "string", description: "The debt's name, exactly as in the user's list." },
      dollars: { type: "number", description: "The payment in dollars." },
    },
    required: ["debt_name", "dollars"],
  },
  answer_fraud_alert: {
    description: "Vera flagged a suspicious charge and the user is saying whether that purchase was theirs (it was me) or not (it wasn't me).",
    properties: { was_me: { type: "boolean", description: "true if the user made the purchase, false if they did not." } },
    required: ["was_me"],
  },
  find_subscriptions: {
    description: "The user wants Vera to scan their transactions and find recurring subscription charges.",
    properties: {},
    required: [],
  },
  guard_subscriptions: {
    description: "The user wants to put guarded cards on the subscriptions Vera discovered (guard them, protect them).",
    properties: {
      merchants: { type: "array", items: { type: "string" }, description: "Only these merchants, if the user named some. Omit to guard all of them." },
    },
    required: [],
  },
  remember: {
    description: "The user tells Vera a fact to remember for later, such as who a trusted contact is.",
    properties: { fact: { type: "string", description: "The fact, as a short sentence in the user's words." } },
    required: ["fact"],
  },
  forget: {
    description: "The user asks Vera to forget something she was told to remember.",
    properties: { fact_substring: { type: "string", description: "A few words from the fact to forget." } },
    required: ["fact_substring"],
  },
};

export const QUESTION_DESCRIPTION =
  "Anything else: a question, advice, an explanation, a comparison, small talk, or a how-to. No action is taken and nothing changes.";

export const QUESTION_TOOL = "answer_question";

export function llmToolFor(name: ToolName): LlmTool {
  const d = TOOL_DEFS[name];
  return { name, description: d.description, parameters: { type: "object", properties: d.properties, required: d.required } };
}

// Every action, plus a no-argument "answer_question" for when none applies.
export function allLlmTools(): LlmTool[] {
  return [
    ...TOOL_NAMES.map(llmToolFor),
    { name: QUESTION_TOOL, description: QUESTION_DESCRIPTION, parameters: { type: "object", properties: {}, required: [] } },
  ];
}

// Jev "choice" criteria: label -> what it means.
export function jevCriteria(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of TOOL_NAMES) out[name] = TOOL_DEFS[name].description;
  out.question = QUESTION_DESCRIPTION;
  return out;
}

export function intentFromLlmName(name: string): Intent | null {
  if (name === QUESTION_TOOL) return "question";
  return (TOOL_NAMES as readonly string[]).includes(name) ? (name as ToolName) : null;
}

// ---------- prompt text ----------

export function describeContext(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push(
    `Subscription cards: ${
      ctx.subs
        .map(
          (s) =>
            `${s.merchant} (${formatCents(s.amountCents)}/${s.cycle === "monthly" ? "mo" : "yr"}, ${
              s.status === "cancelled" ? "closed" : s.cardStatus === "inactive" ? "paused" : s.status
            }${s.pendingCharge ? `, declined a ${formatCents(s.pendingCharge.amountCents)} charge above its limit` : ""})`,
        )
        .join("; ") || "none"
    }.`,
  );
  lines.push(`Budget categories: ${ctx.categories.join(", ") || "none"}.`);
  lines.push(`Goals: ${ctx.goals.map((g) => `${g.name} (${formatCents(g.savedCents)} of ${formatCents(g.targetCents)})`).join("; ") || "none"}.`);
  lines.push(`Debts: ${ctx.debts.map((d) => `${d.name} (${formatCents(d.balanceCents)} owed)`).join("; ") || "none"}.`);
  lines.push(
    ctx.flagged
      ? `Flagged charge waiting for the user: ${formatCents(ctx.flagged.amountCents)} at ${ctx.flagged.merchant}.`
      : "No flagged charge is waiting.",
  );
  if (ctx.memories.length) lines.push(`Things the user asked Vera to remember: ${ctx.memories.join("; ")}.`);
  return lines.join("\n");
}

export function extractSystemPrompt(ctx: AgentContext): string {
  return [
    "You turn a request to Vera, a personal-finance assistant, into a function call.",
    "Use the exact merchant, goal, debt or category names from USER DATA when the user refers to one.",
    "Never invent a value the user did not say: leave that parameter out instead. Dollar amounts are plain numbers.",
    "You only fill in the call. You never confirm or run anything.",
    "",
    "USER DATA",
    describeContext(ctx),
  ].join("\n");
}

export function chooseSystemPrompt(ctx: AgentContext): string {
  return [
    "You are Vera's request router. Decide what the user wants and call exactly one function.",
    `Call ${QUESTION_TOOL} for questions, advice, explanations and small talk: only call an action when the user is clearly asking for it to be done.`,
    "Use the exact merchant, goal, debt or category names from USER DATA. Never invent a value the user did not say.",
    "",
    "USER DATA",
    describeContext(ctx),
  ].join("\n");
}

// What Jev sees about the user: just names, no balances or personal details.
export function jevState(utterance: string, ctx: AgentContext) {
  return {
    utterance,
    subscriptions: ctx.subs.filter((s) => s.status !== "cancelled").map((s) => s.merchant),
    budget_categories: ctx.categories,
    goal_names: ctx.goals.map((g) => g.name),
    debt_names: ctx.debts.map((d) => d.name),
    fraud_alert_pending: ctx.flagged !== null,
  };
}
