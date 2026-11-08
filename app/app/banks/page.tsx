import { Landmark, RefreshCw } from "lucide-react";
import { quickConnectAction, syncBankAction } from "./actions";
import { PlaidConnect } from "@/components/banks/PlaidConnect";
import { ErrorBanner } from "@/components/guard";
import { Chip, IconBadge, PageHeader, SectionHeading } from "@/components/Page";
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
    <div className="mx-auto max-w-4xl space-y-6" data-testid="banks-page">
      <PageHeader
        title="Bank connections"
        description="Link a bank through Plaid to import its accounts and transactions. Your bank login goes to Plaid, never to VeraFund."
      />

      <ErrorBanner message={error} />
      {notice && (
        <div role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {notice}
        </div>
      )}

      <section className="surface space-y-4 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent p-5 sm:p-6" data-testid="connect-bank">
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
        <SectionHeading title="Linked banks" />
        {banks.length === 0 ? (
          <p className="well px-4 py-6 text-center text-sm text-muted-foreground">No banks linked yet.</p>
        ) : (
          banks.map((b) => (
            <div key={b.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <IconBadge>
                  <Landmark size={18} aria-hidden="true" />
                </IconBadge>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    {b.institutionName}
                    <Chip tone="success" className="!text-[11px]">Connected</Chip>
                  </p>
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
        <SectionHeading title="All accounts" />
        <div className="grid gap-3 sm:grid-cols-2">
          {finance.accounts.map((a) => (
            <div key={a.id} className="surface p-4" data-testid="account-card">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full ring-4 ring-muted" style={{ background: a.color }} aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{a.name}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="capitalize">{a.institution} · {a.type}</span>
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{formatCents(a.balanceCents)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
