// The decision layer. TypeSafe Jev answers bounded, typed questions in a few hundred
// milliseconds; deterministic rules always make the final call and are the fallback
// whenever Jev is unavailable. Every decision can be written to the `decisions` table.
//
// Jev API: POST https://api.typesafe.ai/v1/systemone with "Authorization: Bearer <key>",
// body { model, state, questions }. Question types: noul (yes/no probability), choice
// (one of fixed labels), score (a position on an ordered scale).

import { randomUUID } from "node:crypto";
import { getDb } from "./db/client";
import { decisions } from "./db/schema";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

export type JevQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export interface JevAnswer {
  type?: string;
  noul?: number; // probability 0..1 for noul questions
  choice?: string; // chosen label for choice questions
  confidence?: number; // 0..1
  score?: number | string;
  probabilities?: Record<string, number>;
}

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

// Asks Jev a set of typed questions about `state`. Returns null on a missing key,
// timeout or any error, so callers fall back to rules.
export async function jevDecide<Q extends Record<string, JevQuestion>>(
  state: unknown,
  questions: Q,
  timeoutMs = 2_500,
): Promise<{ answers: Partial<Record<keyof Q, JevAnswer>>; latencyMs: number } | null> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return null;
  const started = Date.now();
  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { answers?: Partial<Record<keyof Q, JevAnswer>> };
    if (!body.answers) return null;
    return { answers: body.answers, latencyMs: Date.now() - started };
  } catch {
    return null;
  }
}

// Records a decision for the audit trail. Never throws: logging must not break the action.
export async function logDecision(entry: {
  workspaceId: string;
  purpose: string;
  engine: "jev" | "rules" | "llm";
  input: string;
  output: unknown;
  latencyMs: number;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(decisions).values({
      id: randomUUID(),
      workspaceId: entry.workspaceId,
      purpose: entry.purpose,
      engine: entry.engine,
      input: entry.input.slice(0, 500),
      output: JSON.stringify(entry.output).slice(0, 2000),
      latencyMs: Math.max(0, Math.round(entry.latencyMs)),
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("[decision log]", err instanceof Error ? err.message : err);
  }
}
