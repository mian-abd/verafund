import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Keep in sync with the DDL in ./client.ts.

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  clockOffsetDays: integer("clock_offset_days").notNull().default(0),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  merchant: text("merchant").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  cycle: text("cycle", { enum: ["monthly", "yearly"] }).notNull(),
  kind: text("kind", { enum: ["paid", "trial"] }).notNull(),
  status: text("status", { enum: ["active", "trial", "trial_ended", "cancelled"] }).notNull(),
  trialEndsAt: integer("trial_ends_at"),
  limitCents: integer("limit_cents").notNull(),
  cardProvider: text("card_provider", { enum: ["stripe", "lithic", "simulated"] }).notNull(),
  cardId: text("card_id").notNull(),
  cardLast4: text("card_last4").notNull(),
  cardStatus: text("card_status", { enum: ["active", "inactive", "canceled"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  position: integer("position").notNull(),
});

// Append-only, except `resolution`, which records how the user answered a decline.
export const charges = sqliteTable("charges", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  merchant: text("merchant").notNull(),
  amountCents: integer("amount_cents").notNull(),
  attemptedAt: integer("attempted_at").notNull(),
  approved: integer("approved", { mode: "boolean" }).notNull(),
  reason: text("reason"),
  reasonText: text("reason_text").notNull(),
  provider: text("provider", { enum: ["stripe", "lithic", "simulated"] }).notNull(),
  providerAuthorizationId: text("provider_authorization_id"),
  providerReason: text("provider_reason"),
  resolution: text("resolution", { enum: ["approved_new_price", "kept_blocking"] }),
  createdAt: integer("created_at").notNull(),
});

export const policyEvents = sqliteTable("policy_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  type: text("type").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor", { enum: ["user", "system"] }).notNull(),
  at: integer("at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type PolicyEvent = typeof policyEvents.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;

// ---------- personal finance (dashboard, transactions, goals, advisor) ----------

export const profiles = sqliteTable("profiles", {
  workspaceId: text("workspace_id").primaryKey(),
  displayName: text("display_name").notNull(),
  monthlyIncomeCents: integer("monthly_income_cents").notNull(),
  hourlyRateCents: integer("hourly_rate_cents").notNull(),
  taxRateBps: integer("tax_rate_bps").notNull(),
  employer: text("employer").notNull(),
  payFrequency: text("pay_frequency").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["checking", "savings", "credit"] }).notNull(),
  institution: text("institution").notNull(),
  balanceCents: integer("balance_cents").notNull(),
  color: text("color").notNull(),
});

// Signed amounts: income is positive, spending is negative.
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  accountId: text("account_id").notNull(),
  merchant: text("merchant").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  occurredAt: integer("occurred_at").notNull(),
  description: text("description"),
  status: text("status", { enum: ["posted", "pending", "flagged", "blocked"] }).notNull(),
  riskScore: integer("risk_score"),
  riskSignals: text("risk_signals"), // JSON array of { signal, points, detail }
  subscriptionId: text("subscription_id"),
  createdAt: integer("created_at").notNull(),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  category: text("category").notNull(),
  limitCents: integer("limit_cents").notNull(),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  targetCents: integer("target_cents").notNull(),
  savedCents: integer("saved_cents").notNull(),
  dueAt: integer("due_at"),
  createdAt: integer("created_at").notNull(),
});

export const debts = sqliteTable("debts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["credit_card", "student_loan", "auto_loan", "personal_loan", "mortgage"] }).notNull(),
  balanceCents: integer("balance_cents").notNull(),
  originalCents: integer("original_cents").notNull(),
  aprBps: integer("apr_bps").notNull(),
  minPaymentCents: integer("min_payment_cents").notNull(),
});

export const userCards = sqliteTable("user_cards", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  issuer: text("issuer").notNull(),
  type: text("type", { enum: ["credit", "debit"] }).notNull(),
  last4: text("last4").notNull(),
  baseRewardBps: integer("base_reward_bps").notNull(),
  categoryBonuses: text("category_bonuses").notNull(), // JSON { category: bps }
  annualFeeCents: integer("annual_fee_cents").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: integer("read", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
});

export const advisorMessages = sqliteTable("advisor_messages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const purchaseChecks = sqliteTable("purchase_checks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  item: text("item").notNull(),
  priceCents: integer("price_cents").notNull(),
  verdict: text("verdict", { enum: ["affordable", "caution", "not_recommended"] }).notNull(),
  analysis: text("analysis").notNull(), // JSON
  createdAt: integer("created_at").notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type UserCard = typeof userCards.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AdvisorMessage = typeof advisorMessages.$inferSelect;
export type PurchaseCheck = typeof purchaseChecks.$inferSelect;

// Bank connections made through Plaid (sandbox). The access token never leaves the server.
export const plaidItems = sqliteTable("plaid_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  itemId: text("item_id").notNull(),
  accessToken: text("access_token").notNull(),
  institutionName: text("institution_name").notNull(),
  cursor: text("cursor"),
  importedCount: integer("imported_count").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSyncedAt: integer("last_synced_at"),
});

export type PlaidItem = typeof plaidItems.$inferSelect;

// ---------- Vera agent + decision layer ----------

// Facts the user asked Vera to remember ("Sarah is my trusted contact").
export const agentMemories = sqliteTable("agent_memories", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  fact: text("fact").notNull(),
  source: text("source", { enum: ["user", "vera"] }).notNull(),
  createdAt: integer("created_at").notNull(),
});

// Every action Vera proposes. Nothing runs until the user confirms it.
export const agentActions = sqliteTable("agent_actions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  tool: text("tool").notNull(),
  params: text("params").notNull(), // JSON
  summary: text("summary").notNull(), // the read-back the user confirms
  status: text("status", { enum: ["pending", "executed", "cancelled", "failed", "expired"] }).notNull(),
  result: text("result"),
  channel: text("channel", { enum: ["voice", "chat"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

// Audit trail for the decision layer: which engine decided what, how fast.
export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  purpose: text("purpose").notNull(), // e.g. "agent_intent", "fraud_triage", "subscription_detect"
  engine: text("engine", { enum: ["jev", "rules", "llm"] }).notNull(),
  input: text("input").notNull(), // short human-readable summary
  output: text("output").notNull(), // JSON
  latencyMs: integer("latency_ms").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type AgentMemory = typeof agentMemories.$inferSelect;
export type AgentAction = typeof agentActions.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
