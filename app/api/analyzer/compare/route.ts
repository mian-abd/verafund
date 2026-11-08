// GET /api/analyzer/compare?check=<purchase check id>[&refresh=1]
// Looks for the same product cheaper elsewhere (Claude + live web search) and saves the offers into
// the purchase check's `analysis` JSON, so reopening a past check shows them without searching again.
// The analysis page never waits on this: a client component calls it after the result is on screen.
//
// Responses: { status: "ok", offers, checkedAt, cached } | { status: "disabled", message } |
// { status: "rate_limited" | "timeout" | "error" | "not_found" } with a matching HTTP status.

import { and, eq } from "drizzle-orm";
import { cleanStoreName, visionEnabled } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { purchaseChecks } from "@/lib/db/schema";
import { findCheaperOffers, parseSavedCompare, PriceCompareError, type SavedCompare } from "@/lib/price-compare";
import { getWorkspaceId } from "@/lib/session";
import { sharedLimiter } from "../_lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CHECK_ID = /^[0-9a-f-]{36}$/;
const LIMIT_PER_HOUR = 10; // web search costs money
const HOUR_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * HOUR_MS;
const CACHE_MAX_ENTRIES = 200;

const DISABLED_MESSAGE =
  "Price comparison is off. It needs Claude's live web search, and private mode keeps your data on this device.";

interface Shared {
  cache: Map<string, { at: number; data: SavedCompare }>;
  inflight: Map<string, Promise<SavedCompare>>;
}

// Per process, and kept across dev-server module reloads.
function shared(): Shared {
  const g = globalThis as typeof globalThis & { __analyzerCompare?: Shared };
  return (g.__analyzerCompare ??= { cache: new Map(), inflight: new Map() });
}

function reply(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return reply({ status: "error", error: "Your session expired. Log in again." }, 401);

  const params = new URL(request.url).searchParams;
  const checkId = params.get("check") ?? "";
  if (!CHECK_ID.test(checkId)) return reply({ status: "error", error: "Missing purchase check." }, 400);
  const refresh = params.get("refresh") === "1";

  // Private mode keeps data on the device: no web search at all.
  if (!visionEnabled()) return reply({ status: "disabled", message: DISABLED_MESSAGE });

  let row: typeof purchaseChecks.$inferSelect | undefined;
  const db = await getDb().catch(() => null);
  if (!db) return reply({ status: "error" }, 500);
  try {
    [row] = await db
      .select()
      .from(purchaseChecks)
      .where(and(eq(purchaseChecks.id, checkId), eq(purchaseChecks.workspaceId, workspaceId)));
  } catch (err) {
    console.error("[analyzer compare] could not load the check:", err instanceof Error ? err.message : "unknown error");
    return reply({ status: "error" }, 500);
  }
  const analysis = row ? parseObject(row.analysis) : null;
  if (!row || !analysis) return reply({ status: "not_found" }, 404);

  const key = `${workspaceId}:${checkId}`;
  const { cache, inflight } = shared();

  if (!refresh) {
    // Already searched for this check: saved in its analysis, so no search and no rate-limit slot.
    const saved = parseSavedCompare(analysis.compare);
    if (saved) return reply({ status: "ok", ...saved, cached: true });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return reply({ status: "ok", ...hit.data, cached: true });
  }

  // Two tabs, or a dev-mode double render, share one search instead of paying for two.
  let pending = inflight.get(key);
  if (!pending) {
    const taken = sharedLimiter("compare", LIMIT_PER_HOUR, HOUR_MS).take(workspaceId);
    if (!taken.ok) {
      return reply({ status: "rate_limited" }, 429, { "retry-after": String(taken.retryAfterSec) });
    }
    const item = row.item;
    const priceCents = row.priceCents;
    const store = cleanStoreName(analysis.store);
    pending = (async () => {
      const { offers } = await findCheaperOffers({ item, priceCents, store });
      const data: SavedCompare = { offers, checkedAt: Date.now() };
      cache.set(key, { at: Date.now(), data });
      if (cache.size > CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      try {
        // Merge into the raw JSON so nothing else in `analysis` is touched.
        await db
          .update(purchaseChecks)
          .set({ analysis: JSON.stringify({ ...analysis, compare: data }) })
          .where(and(eq(purchaseChecks.id, checkId), eq(purchaseChecks.workspaceId, workspaceId)));
      } catch (err) {
        console.error("[analyzer compare] could not save offers:", err instanceof Error ? err.message : "unknown error");
      }
      return data;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    return reply({ status: "ok", ...(await pending), cached: false });
  } catch (err) {
    // Code and message only: never the response body or any key.
    const code = err instanceof PriceCompareError ? err.code : "unknown";
    console.error("[analyzer compare] search failed:", code, err instanceof Error ? err.message : "");
    return code === "timeout" ? reply({ status: "timeout" }, 504) : reply({ status: "error" }, 502);
  }
}
