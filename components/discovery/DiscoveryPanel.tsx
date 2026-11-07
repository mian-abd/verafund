import Link from "next/link";
import { Suspense } from "react";
import { ScanSearch, X } from "lucide-react";
import { runDiscoveryAction } from "@/app/app/discovery-actions";
import { SubmitButton } from "@/components/ui";
import { discoverCandidates } from "@/lib/discovery";
import { getWorkspaceId } from "@/lib/session";
import { DiscoveryList, type DiscoveryRow } from "./DiscoveryList";

const SHELL = "rounded-2xl border border-border bg-card";

function Icon() {
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <ScanSearch size={18} aria-hidden="true" />
    </span>
  );
}

async function Results({ notice }: { notice?: string }) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return null;

  let rows: DiscoveryRow[] | null = null;
  try {
    const found = await discoverCandidates(workspaceId);
    rows = found.map((c) => ({
      key: c.key,
      merchant: c.merchant,
      category: c.category,
      amountCents: c.amountCents,
      cycle: c.cycle,
      occurrences: c.occurrences,
      nextExpectedAt: c.nextExpectedAt,
      confidence: c.confidence,
      reason: c.reason,
      source: c.source,
      alreadyGuarded: c.alreadyGuarded,
      priceChanged: c.priceChanged,
      previousAmountCents: c.previousAmountCents,
      group: c.group,
    }));
  } catch (err) {
    console.error("[discovery panel]", err);
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role="status"
          data-testid="discovery-notice"
          className="rounded-xl border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {notice}
        </div>
      )}
      {rows === null ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t scan your transactions right now. Hide this panel and try again.
        </p>
      ) : rows.length === 0 ? (
        <p data-testid="discovery-empty" className="text-sm text-muted-foreground">
          No recurring charges found yet. Link a bank on the{" "}
          <Link href="/app/banks" className="font-medium text-primary underline underline-offset-2">
            Banks page
          </Link>{" "}
          to scan more history.
        </p>
      ) : (
        <DiscoveryList
          // Remount (and reset the ticks) whenever the set of rows or their guarded state changes.
          key={rows.map((r) => `${r.key}:${r.alreadyGuarded ? 1 : 0}`).join("|")}
          rows={rows}
        />
      )}
    </div>
  );
}

function Scanning() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="text-sm text-muted-foreground">Scanning your transactions for recurring charges…</p>
      <div className="h-24 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
    </div>
  );
}

// Sits between "Add subscription" and the list of subscription panels. Collapsed by default,
// so nothing runs on page load; the open state lives in the URL (?discover=1) and survives a reload.
export async function DiscoveryPanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const open = params.discover === "1";
  const rawNotice = typeof params.notice === "string" ? params.notice : undefined;
  const notice = rawNotice ? rawNotice.slice(0, 300) : undefined;

  if (!open) {
    return (
      <section data-testid="discovery-panel" data-state="collapsed" aria-label="Find my subscriptions" className={SHELL}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Icon />
          <p id="discovery-intro" className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
            Scan your transactions for recurring charges, then guard each one with its own capped card.
          </p>
          <form action={runDiscoveryAction}>
            <SubmitButton pendingText="Scanning…" aria-describedby="discovery-intro">
              Find my subscriptions
            </SubmitButton>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="discovery-panel" data-state="open" aria-labelledby="discovery-title" className={`${SHELL} space-y-4 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon />
          <div className="min-w-0">
            <h2 id="discovery-title" className="text-base font-semibold text-foreground">
              Find my subscriptions
            </h2>
            <p className="text-sm text-muted-foreground">
              Recurring charges in your transaction history, including anything imported from your bank.
            </p>
          </div>
        </div>
        <Link
          href="/app"
          scroll={false}
          aria-label="Hide Find my subscriptions"
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={14} aria-hidden="true" /> Hide
        </Link>
      </div>
      <Suspense fallback={<Scanning />}>
        <Results notice={notice} />
      </Suspense>
    </section>
  );
}
