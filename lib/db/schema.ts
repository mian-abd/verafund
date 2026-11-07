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
  cardProvider: text("card_provider", { enum: ["stripe", "simulated"] }).notNull(),
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
  provider: text("provider", { enum: ["stripe", "simulated"] }).notNull(),
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
