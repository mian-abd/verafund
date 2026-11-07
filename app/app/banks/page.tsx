import { Landmark, RefreshCw } from "lucide-react";
import { quickConnectAction, syncBankAction } from "./actions";
import { PlaidConnect } from "@/components/banks/PlaidConnect";
import { ErrorBanner } from "@/components/guard";
import { SubmitButton } from "@/components/ui";
import { getFinance } from "@/lib/finance";
import { formatCents, formatDateTime } from "@/lib/format";
import { listBanks, plaidConfigured } from "@/lib/plaid";
import { getWorkspaceId } from "@/lib/session";

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const [banks, finance] = await Promise.all([listBanks(workspaceId), getFinance(workspaceId)]);
  const configured = plaidConfigured();

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="banks-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Bank connections</h1>
        <p className="text-sm text-muted-foreground">
          Link a bank through Plaid to import its accounts and transactions. Your bank login goes to Plaid, never to
          VeraFund.
        </p>
      </div>

      <ErrorBanner message={error} />
      {notice && (
        <div role="status" className="rounded-xl border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {notice}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4" data-testid="connect-bank">
        {configured ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <PlaidConnect />
              <form action={quickConnectAction}>
                <SubmitButton variant="outline" pendingText="Connecting…">
                  Connect a test bank instantly
                </SubmitButton>
              </form>
            </div>
            <p className="text-xs text-muted-foreground">
              Plaid sandbox: in the Plaid window pick any bank and sign in with <code>user_good</code> /{" "}
              <code>pass_good</code>. The instant option links Plaid&apos;s First Platypus Bank without the window.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Bank connections aren&apos;t configured on this server yet.</p>
        )}
      </section>

      <section className="space-y-3" data-testid="linked-banks">
        <h2 className="text-lg font-semibold text-foreground">Linked banks</h2>
        {banks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No banks linked yet.</p>
        ) : (
          banks.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Landmark size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{b.institutionName}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.importedCount} transactions imported
                    {b.lastSyncedAt ? ` · synced ${formatDateTime(b.lastSyncedAt)}` : ""}
                  </p>
                </div>
              </div>
              <form action={syncBankAction}>
                <input type="hidden" name="itemId" value={b.id} />
                <SubmitButton variant="ghost" pendingText="Syncing…" aria-label={`Sync ${b.institutionName}`}>
                  <RefreshCw size={14} aria-hidden="true" /> Sync now
                </SubmitButton>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">All accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {finance.accounts.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-4" data-testid="account-card">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{a.name}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.institution} · {a.type}
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{formatCents(a.balanceCents)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
