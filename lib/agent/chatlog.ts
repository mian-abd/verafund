// The one conversation with Vera per workspace (advisor_messages), shared by the Advisor page,
// the floating dock and the agent. Also the per-workspace hourly limit: the site is public and
// AI calls cost money.

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import type { ChatTurn } from "../ai";
import { getDb } from "../db/client";
import { advisorMessages } from "../db/schema";
import { GuardError } from "../guard";

export const MAX_QUESTION = 500;
export const HOURLY_LIMIT = 40;

export async function assertUnderHourlyLimit(workspaceId: string): Promise<void> {
  const db = await getDb();
  const recent = await db
    .select({ id: advisorMessages.id })
    .from(advisorMessages)
    .where(
      and(
        eq(advisorMessages.workspaceId, workspaceId),
        eq(advisorMessages.role, "user"),
        gte(advisorMessages.createdAt, Date.now() - 3_600_000),
      ),
    );
  if (recent.length >= HOURLY_LIMIT) throw new GuardError("Vera needs a short break. Try again in a few minutes.");
}

// Wall-clock timestamps keep the shared history in order across every surface.
export async function persistTurns(workspaceId: string, userText: string, assistantText: string): Promise<void> {
  const db = await getDb();
  const at = Date.now();
  await db.insert(advisorMessages).values([
    { id: randomUUID(), workspaceId, role: "user", content: userText.slice(0, 2000), createdAt: at },
    { id: randomUUID(), workspaceId, role: "assistant", content: assistantText.slice(0, 4000), createdAt: at + 1 },
  ]);
}

export async function recentTurns(workspaceId: string, limit = 6): Promise<ChatTurn[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(advisorMessages)
    .where(eq(advisorMessages.workspaceId, workspaceId))
    .orderBy(desc(advisorMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((m) => ({ role: m.role, content: m.content }));
}
