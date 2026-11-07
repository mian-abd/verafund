// "Vera, remember that Sarah is my trusted contact." Facts live in agent_memories, scoped by
// workspace, and are injected into Vera's context on every answer. These run without a
// confirmation: they change nothing about the user's money.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { agentMemories } from "../db/schema";
import { norm } from "./text";
import type { WireMemory } from "./types";

export const MAX_MEMORIES = 30;
export const MAX_FACT_LENGTH = 200;

// Memories are shown back to the user and fed to the LLM, so keep them to one plain line.
export function cleanFact(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FACT_LENGTH);
}

export async function listMemories(workspaceId: string): Promise<WireMemory[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.workspaceId, workspaceId))
    .orderBy(desc(agentMemories.createdAt));
  return rows.map((m) => ({ id: m.id, fact: m.fact, createdAt: m.createdAt }));
}

// Oldest first, which reads best inside a prompt.
export async function listMemoryFacts(workspaceId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ fact: agentMemories.fact })
    .from(agentMemories)
    .where(eq(agentMemories.workspaceId, workspaceId))
    .orderBy(asc(agentMemories.createdAt));
  return rows.map((r) => r.fact);
}

export type AddMemoryResult = { added: true } | { added: false; reason: "duplicate" | "full" | "empty" };

export async function addMemory(workspaceId: string, rawFact: string, source: "user" | "vera" = "user"): Promise<AddMemoryResult> {
  const fact = cleanFact(rawFact);
  if (fact.length < 3) return { added: false, reason: "empty" };
  const db = await getDb();
  const existing = await db.select().from(agentMemories).where(eq(agentMemories.workspaceId, workspaceId));
  if (existing.some((m) => norm(m.fact) === norm(fact))) return { added: false, reason: "duplicate" };
  if (existing.length >= MAX_MEMORIES) return { added: false, reason: "full" };
  await db.insert(agentMemories).values({ id: randomUUID(), workspaceId, fact, source, createdAt: Date.now() });
  return { added: true };
}

// Removes every memory that contains the fragment. Returns the facts that were removed.
export async function forgetMemories(workspaceId: string, fragment: string): Promise<string[]> {
  const needle = norm(fragment);
  if (needle.length < 2) return [];
  const db = await getDb();
  const rows = await db.select().from(agentMemories).where(eq(agentMemories.workspaceId, workspaceId));
  // Whole words only, so "it" never wipes every memory that merely contains the letters.
  const hits = rows.filter((m) => ` ${norm(m.fact)} `.includes(` ${needle} `));
  if (hits.length === 0) return [];
  await db
    .delete(agentMemories)
    .where(and(eq(agentMemories.workspaceId, workspaceId), inArray(agentMemories.id, hits.map((h) => h.id))));
  return hits.map((h) => h.fact);
}

export async function forgetMemoryById(workspaceId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.delete(agentMemories).where(and(eq(agentMemories.id, id), eq(agentMemories.workspaceId, workspaceId)));
  return res.rowsAffected > 0;
}
