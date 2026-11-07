// Shared types for Vera's action agent. Pure: no DB or network imports, so the parsing,
// validation and routing logic that uses them can be unit tested on its own.

// The fixed menu. The AI can only ever propose one of these; it never runs code of its own.
export const TOOL_NAMES = [
  "cancel_subscription",
  "pause_card",
  "resume_card",
  "create_card",
  "approve_new_price",
  "keep_blocking",
  "keep_after_trial",
  "set_budget",
  "add_to_goal",
  "pay_debt",
  "answer_fraud_alert",
  "find_subscriptions",
  "guard_subscriptions",
  "remember",
  "forget",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export type Intent = ToolName | "question";

// These run the moment they are understood. Everything else waits for an explicit yes.
export const NO_CONFIRM_TOOLS: readonly ToolName[] = ["find_subscriptions", "remember", "forget"];

export function needsConfirmation(tool: ToolName): boolean {
  return !NO_CONFIRM_TOOLS.includes(tool);
}

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

export function isIntent(value: unknown): value is Intent {
  return value === "question" || isToolName(value);
}

// ---------- a snapshot of the workspace, used to validate every proposed action ----------

export interface CtxSub {
  id: string;
  merchant: string;
  category: string;
  amountCents: number;
  cycle: "monthly" | "yearly";
  kind: "paid" | "trial";
  status: "active" | "trial" | "trial_ended" | "cancelled";
  cardStatus: "active" | "inactive" | "canceled";
  cardLast4: string;
  limitCents: number;
  // A decline for being above the limit that the user hasn't answered yet.
  pendingCharge: { id: string; amountCents: number } | null;
}

export interface CtxBudget {
  id: string;
  category: string;
  limitCents: number;
}

export interface CtxGoal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
}

export interface CtxDebt {
  id: string;
  name: string;
  kind: string;
  balanceCents: number;
}

export interface CtxFlagged {
  id: string;
  merchant: string;
  amountCents: number; // positive
  riskScore: number | null;
}

export interface AgentContext {
  userName: string;
  subs: CtxSub[];
  budgets: CtxBudget[];
  // Every category the user has a budget for or has spent in.
  categories: string[];
  goals: CtxGoal[];
  debts: CtxDebt[];
  flagged: CtxFlagged | null;
  memories: string[];
}

// ---------- what a tool call looks like on the wire ----------

export type RawParams = Record<string, unknown>;

export type Validation =
  | { ok: true; params: Record<string, unknown>; summary: string }
  | { ok: false; clarify: string };

// Stored in agent_actions.result as JSON.
export interface ActionResult {
  ok: boolean;
  text: string;
  draft?: string;
}

// ---------- API replies (shared with the UI) ----------

export type AgentReply =
  | { kind: "answer"; text: string; ai?: boolean }
  | { kind: "confirm"; actionId: string; tool: ToolName; summary: string }
  | { kind: "done"; text: string; ok: boolean; actionId?: string; draft?: string; refresh: boolean }
  | { kind: "clarify"; text: string; actionId?: string }
  | { kind: "cancelled"; text: string; actionId?: string; status: "cancelled" | "expired" };

export type WireActionStatus = "pending" | "executed" | "cancelled" | "failed" | "expired";

export interface WireAction {
  id: string;
  tool: string;
  summary: string;
  status: WireActionStatus;
  text: string | null;
  draft: string | null;
  channel: "voice" | "chat";
  createdAt: number;
  resolvedAt: number | null;
}

export interface WireMemory {
  id: string;
  fact: string;
  createdAt: number;
}

export interface AgentOverview {
  actions: WireAction[];
  memories: WireMemory[];
  pending: { actionId: string; tool: string; summary: string; createdAt: number } | null;
  // "Try saying" examples built from this workspace's real merchants, goals, debts and categories.
  hints: string[];
}
