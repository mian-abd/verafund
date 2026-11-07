// agent_actions: every action Vera proposes. A row starts "pending", and nothing runs until the
// user confirms that exact id. Every query is scoped by workspaceId. Pending rows expire after
// five minutes.

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { agentActions, notifications, type AgentAction } from "../db/schema";
import type { ActionResult, ToolName, WireAction } from "./types";

export const ACTION_TTL_MS = 5 * 60_000;

// Written to `result` the instant a confirmation is claimed. A second click on the same
// button finds the claim already taken, so one confirmation can only ever run once.
const RUNNING = "__running__";

export function isExpired(createdAt: number, now = Date.now()): boolean {
  return now - createdAt >= ACTION_TTL_MS;
}

export function encodeResult(r: ActionResult): string {
  return JSON.stringify(r);
}

export function decodeResult(raw: string | null): ActionResult | null {
  if (!raw || raw === RUNNING) return null;
  try {
    const v = JSON.parse(raw) as Partial<ActionResult>;
    if (typeof v.text !== "string") return null;
    return { ok: v.ok !== false, text: v.text, ...(typeof v.draft === "string" ? { draft: v.draft } : {}) };
  } catch {
    return { ok: true, text: raw };
  }
}

export function toWire(row: AgentAction): WireAction {
  const result = decodeResult(row.result);
  return {
    id: row.id,
    tool: row.tool,
    summary: row.summary,
    status: row.status,
    text: result?.text ?? null,
    draft: result?.draft ?? null,
    channel: row.channel,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

// Anything still pending past its five minutes becomes "expired". Cheap enough to run on every read.
export async function expireStaleActions(workspaceId: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db
    .update(agentActions)
    .set({
      status: "expired",
      resolvedAt: now,
      result: encodeResult({ ok: false, text: "Nothing happened: this request timed out before it was confirmed." }),
    })
    .where(and(eq(agentActions.workspaceId, workspaceId), eq(agentActions.status, "pending"), lt(agentActions.createdAt, now - ACTION_TTL_MS)));
}

// Only one request waits for an answer at a time: a newer proposal withdraws the older one.
async function withdrawPending(workspaceId: string, reason: string): Promise<void> {
  const db = await getDb();
  await db
    .update(agentActions)
    .set({ status: "cancelled", resolvedAt: Date.now(), result: encodeResult({ ok: false, text: reason }) })
    .where(and(eq(agentActions.workspaceId, workspaceId), eq(agentActions.status, "pending"), isNull(agentActions.result)));
}

export async function createPendingAction(
  workspaceId: string,
  a: { tool: ToolName; params: Record<string, unknown>; summary: string; channel: "voice" | "chat" },
): Promise<string> {
  const db = await getDb();
  await withdrawPending(workspaceId, "Nothing happened: you asked for something else before confirming this.");
  const id = randomUUID();
  await db.insert(agentActions).values({
    id,
    workspaceId,
    tool: a.tool,
    params: JSON.stringify(a.params),
    summary: a.summary,
    status: "pending",
    result: null,
    channel: a.channel,
    createdAt: Date.now(),
    resolvedAt: null,
  });
  return id;
}

// For tools that run immediately (remember, forget, find): recorded as already executed.
export async function recordExecutedAction(
  workspaceId: string,
  a: { tool: ToolName; params: Record<string, unknown>; summary: string; channel: "voice" | "chat"; result: ActionResult },
): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  await db.insert(agentActions).values({
    id,
    workspaceId,
    tool: a.tool,
    params: JSON.stringify(a.params),
    summary: a.summary,
    status: a.result.ok ? "executed" : "failed",
    result: encodeResult(a.result),
    channel: a.channel,
    createdAt: now,
    resolvedAt: now,
  });
  return id;
}

export async function getAction(workspaceId: string, id: string): Promise<AgentAction | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.id, id), eq(agentActions.workspaceId, workspaceId)));
  return row ?? null;
}

export async function latestPendingAction(workspaceId: string): Promise<AgentAction | null> {
  await expireStaleActions(workspaceId);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.workspaceId, workspaceId),
        eq(agentActions.status, "pending"),
        isNull(agentActions.result),
        gte(agentActions.createdAt, Date.now() - ACTION_TTL_MS),
      ),
    )
    .orderBy(desc(agentActions.createdAt))
    .limit(1);
  return row ?? null;
}

// Takes the one-time right to execute a pending, unexpired action. False if someone else got it
// first, it was already answered, or it timed out.
export async function claimAction(workspaceId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const claimed = await db
    .update(agentActions)
    .set({ result: RUNNING })
    .where(
      and(
        eq(agentActions.id, id),
        eq(agentActions.workspaceId, workspaceId),
        eq(agentActions.status, "pending"),
        isNull(agentActions.result),
        gte(agentActions.createdAt, Date.now() - ACTION_TTL_MS),
      ),
    )
    .returning({ id: agentActions.id });
  return claimed.length > 0;
}

export async function finishAction(workspaceId: string, id: string, status: "executed" | "failed", result: ActionResult): Promise<void> {
  const db = await getDb();
  await db
    .update(agentActions)
    .set({ status, result: encodeResult(result), resolvedAt: Date.now() })
    .where(and(eq(agentActions.id, id), eq(agentActions.workspaceId, workspaceId)));
}

// The user said no. Only a pending action nobody is executing can be cancelled.
export async function cancelPendingAction(workspaceId: string, id: string, text: string): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .update(agentActions)
    .set({ status: "cancelled", resolvedAt: Date.now(), result: encodeResult({ ok: false, text }) })
    .where(
      and(eq(agentActions.id, id), eq(agentActions.workspaceId, workspaceId), eq(agentActions.status, "pending"), isNull(agentActions.result)),
    )
    .returning({ id: agentActions.id });
  return done.length > 0;
}

export async function listRecentActions(workspaceId: string, limit = 20): Promise<WireAction[]> {
  await expireStaleActions(workspaceId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.workspaceId, workspaceId))
    .orderBy(desc(agentActions.createdAt))
    .limit(limit);
  return rows.map(toWire);
}

export async function insertNotification(workspaceId: string, kind: string, title: string, body: string): Promise<void> {
  const db = await getDb();
  await db.insert(notifications).values({
    id: randomUUID(),
    workspaceId,
    kind,
    title,
    body,
    read: false,
    createdAt: Date.now(),
  });
}
