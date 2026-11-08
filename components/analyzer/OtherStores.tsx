"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Store } from "lucide-react";
import { formatCents } from "@/lib/format";
import { formatSavings, hostOf, sanitizeStoredOffers, savingsFor, type Offer, type SavedCompare } from "@/lib/price-compare";

// The server gives up on the search after 30 s; this waits a little longer for its answer.
const CLIENT_TIMEOUT_MS = 35_000;
const NOT_FOUND = "Couldn't find it cheaper right now";
const DISABLED =
  "Price comparison is off. It needs Claude's live web search, and private mode keeps your data on this device.";

type View = { kind: "loading" } | { kind: "offers"; offers: Offer[] } | { kind: "none" } | { kind: "disabled" };

function initialView(enabled: boolean, initial: SavedCompare | null): View {
  if (!enabled) return { kind: "disabled" };
  if (!initial) return { kind: "loading" };
  return initial.offers.length > 0 ? { kind: "offers", offers: initial.offers } : { kind: "none" };
}

// Loads cheaper offers after the analysis is already on screen, so the analysis never waits for
// a web search. A saved result (reopening a past check) is shown straight away with no search.
export function OtherStores({
  checkId,
  priceCents,
  afterTaxHourlyCents,
  enabled,
  initial,
}: {
  checkId: string;
  priceCents: number;
  afterTaxHourlyCents: number;
  enabled: boolean;
  initial: SavedCompare | null;
}) {
  const [view, setView] = useState<View>(() => initialView(enabled, initial));
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        mine.abort();
      }, CLIENT_TIMEOUT_MS);
      try {
        const url = `/api/analyzer/compare?check=${encodeURIComponent(checkId)}${refresh ? "&refresh=1" : ""}`;
        const res = await fetch(url, { signal: mine.signal, cache: "no-store" });
        const data: unknown = await res.json().catch(() => null);
        if (mine.signal.aborted) return;
        const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
        if (body.status === "disabled") return setView({ kind: "disabled" });
        const offers = res.ok && body.status === "ok" ? sanitizeStoredOffers(body.offers) : [];
        setView(offers.length > 0 ? { kind: "offers", offers } : { kind: "none" });
      } catch {
        // Unmounted or superseded: stay quiet. A timeout or network error is a plain "not found".
        if (mine.signal.aborted && !timedOut) return;
        setView({ kind: "none" });
      } finally {
        clearTimeout(timer);
      }
    },
    [checkId],
  );

  useEffect(() => {
    if (enabled && !initial) void load(false);
    return () => controller.current?.abort();
    // `initial` is only the first render's saved result; the effect should not re-run when it is reused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, checkId, load]);

  function retry() {
    setView({ kind: "loading" });
    void load(true);
  }

  return (
    <section
      data-testid="other-stores"
      aria-label="Cheaper elsewhere"
      className="rounded-xl border border-border bg-background p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Store size={15} aria-hidden="true" />
        Cheaper elsewhere
      </h3>

      {view.kind === "loading" && (
        <p role="status" data-testid="other-stores-loading" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Checking other stores…
        </p>
      )}

      {view.kind === "disabled" && (
        <p data-testid="other-stores-disabled" className="mt-2 text-sm text-muted-foreground">
          {DISABLED}
        </p>
      )}

      {view.kind === "none" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p data-testid="other-stores-none" className="text-sm text-muted-foreground">
            {NOT_FOUND}
          </p>
          <button
            type="button"
            onClick={retry}
            data-testid="other-stores-retry"
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Try again
          </button>
        </div>
      )}

      {view.kind === "offers" && (
        <>
          <ul className="mt-1 divide-y divide-border" data-testid="offer-list">
            {view.offers.map((o) => (
              <li key={o.url} data-testid="offer" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-foreground" data-testid="offer-store">
                    {o.store}
                    <span className="font-normal text-muted-foreground"> · {hostOf(o.url)}</span>
                  </p>
                  <p className="text-lg font-bold tracking-tight text-foreground" data-testid="offer-price">
                    {formatCents(o.priceCents)}
                  </p>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400" data-testid="offer-savings">
                    {formatSavings(savingsFor(priceCents, o.priceCents, afterTaxHourlyCents))}
                  </p>
                  {o.note && <p className="break-words text-xs text-muted-foreground">{o.note}</p>}
                </div>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="offer-link"
                  aria-label={`View at ${o.store} (opens in a new tab)`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  View at {o.store}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="offer-disclaimer">
            Prices from a live web search. Check the store before buying.
          </p>
        </>
      )}
    </section>
  );
}
