// Subscription discovery: find recurring charges in a workspace's transaction history
// (seeded or imported from Plaid) and turn the ones the user picks into guarded cards.
// The exported types and function signatures are depended on by other modules (the Vera
// agent); keep them as they are. Detection itself is pure and lives in ./discovery-core.

import { jevDecide, logDecision } from "./decision";
import {
  applyJevAnswers,
  buildJevRequest,
  detectRecurring,
  isBorderline,
  normalizeMerchant,
  toDiscovered,
  type DiscoveryCandidate,
  type JevAnswerLike,
} from "./discovery-core";
import { getFinance } from "./finance";
import { addSubscription, getDashboard } from "./guard";

export interface DiscoveredSubscription {
  merchant: string; // normalized display name, e.g. "Netflix"
  category: string; // our category, e.g. "Streaming" or "subscriptions"
  amountCents: number; // most recent charge, positive cents
  cycle: "monthly" | "yearly";
  occurrences: number; // how many matching charges were found
  lastChargedAt: number; // ms
  nextExpectedAt: number; // ms, estimated
  confidence: number; // 0..1, how sure we are it is a subscription
  reason: string; // plain English, e.g. "3 charges of $15.99 about 30 days apart"
  source: "rules" | "rules+jev";
  alreadyGuarded: boolean; // a guarded subscription with this merchant already exists
  priceChanged: boolean; // the latest charge differs from the earlier ones
}

// ---------- Jev, with a short memory ----------
// The page re-runs discovery on every render while the panel is open, and the "Find"
// action warms it first. Remembering Jev's answers for the same candidates keeps reloads
// instant, keeps the audit trail to one row per real question, and (briefly) remembers a
// failure so a slow or down Jev isn't retried on every reload.

type JevAnswers = Record<string, JevAnswerLike | undefined>;
const JEV_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const CACHE_MAX = 50;
const jevCache = new Map<string, { at: number; ttl: number; answers: JevAnswers | null }>();

function cacheGet(key: string): { answers: JevAnswers | null } | null {
  const hit = jevCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    jevCache.delete(key);
    return null;
  }
  return { answers: hit.answers };
}

function cacheSet(key: string, answers: JevAnswers | null) {
  if (jevCache.size >= CACHE_MAX) jevCache.delete(jevCache.keys().next().value as string);
  jevCache.set(key, { at: Date.now(), ttl: answers ? CACHE_TTL_MS : FAILURE_TTL_MS, answers });
}

function summarize(before: DiscoveryCandidate[], after: DiscoveryCandidate[], keys: string[]) {
  return keys.map((key) => {
    const b = before.find((c) => c.key === key);
    const a = after.find((c) => c.key === key);
    return {
      merchant: b?.merchant ?? key,
      kind: a ? `${b?.kind} -> ${a.kind}` : `${b?.kind} -> dropped`,
      confidence: a ? `${b?.confidence} -> ${a.confidence}` : `${b?.confidence} -> below floor`,
    };
  });
}

// Asks Jev about the borderline candidates in one batched call. Rules already found every
// candidate; Jev only re-labels them or adjusts their confidence. Without Jev, rules stand.
async function refineWithJev(workspaceId: string, candidates: DiscoveryCandidate[]): Promise<DiscoveryCandidate[]> {
  const borderline = candidates.filter(isBorderline);
  if (borderline.length === 0) return candidates;

  const request = buildJevRequest(borderline);
  const cacheKey = JSON.stringify([request.state, request.keys]);
  const cached = cacheGet(cacheKey);
  let answers: JevAnswers | null;
  let latencyMs = 0;
  let asked = false;

  if (cached) {
    answers = cached.answers;
  } else {
    asked = true;
    const started = Date.now();
    const result = await jevDecide(request.state, request.questions, JEV_TIMEOUT_MS);
    latencyMs = result?.latencyMs ?? Date.now() - started;
    answers = (result?.answers as JevAnswers | undefined) ?? null;
    cacheSet(cacheKey, answers);
  }

  const refined = answers ? applyJevAnswers(candidates, request.keys, answers) : candidates;
  if (asked) {
    await logDecision({
      workspaceId,
      purpose: "subscription_detect",
      engine: answers ? "jev" : "rules",
      input: `${borderline.length} borderline recurring charge(s): ${borderline.map((c) => c.merchant).join(", ")}`,
      output: answers
        ? { results: summarize(candidates, refined, request.keys) }
        : { note: "Jev unavailable; rules decided", kept: borderline.map((c) => c.merchant) },
      latencyMs,
    });
  }
  return refined;
}

// ---------- public API ----------

// Everything the UI needs: the public fields plus kind, group and the previous price.
export async function discoverCandidates(workspaceId: string): Promise<DiscoveryCandidate[]> {
  const [finance, dashboard] = await Promise.all([getFinance(workspaceId), getDashboard(workspaceId)]);
  const guardedMerchants = dashboard.subscriptions.filter((s) => s.status !== "cancelled").map((s) => s.merchant);
  const found = detectRecurring(finance.transactions, { now: finance.now, guardedMerchants });
  return refineWithJev(workspaceId, found);
}

export async function discoverSubscriptions(workspaceId: string): Promise<DiscoveredSubscription[]> {
  return (await discoverCandidates(workspaceId)).map(toDiscovered);
}

// Creates a guarded card for each chosen merchant (limit = its latest price).
// Returns how many were created. Skips merchants that are already guarded.
export async function guardDiscovered(workspaceId: string, merchants: string[]): Promise<number> {
  const wanted = new Set(merchants.map((m) => normalizeMerchant(m)).filter(Boolean));
  if (wanted.size === 0) return 0;
  let created = 0;
  // One at a time: each card's position is the next free slot.
  for (const c of await discoverCandidates(workspaceId)) {
    if (!wanted.has(c.key) || c.alreadyGuarded) continue;
    await addSubscription(workspaceId, {
      merchant: c.merchant,
      category: c.category,
      amountCents: c.amountCents,
      cycle: c.cycle,
      trialDays: null,
    });
    created += 1;
  }
  return created;
}
