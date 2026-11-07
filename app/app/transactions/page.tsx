import Link from "next/link";
import { Search } from "lucide-react";
import { ErrorBanner } from "@/components/guard";
import { FraudAlert } from "@/components/transactions/FraudAlert";
import { STATUSES } from "@/components/transactions/options";
import { SimulateForm } from "@/components/transactions/SimulateForm";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { parseRiskSignals, veraFraudScript } from "@/lib/fraud";
import { getFinance } from "@/lib/finance";
import { formatCents } from "@/lib/format";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const FIELD =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = one(params.q);
  const category = one(params.category);
  const accountId = one(params.account);
  const status = one(params.status);
  const showAll = one(params.all) === "1";
  const error = one(params.error);

  const workspaceId = (await getWorkspaceId())!;
  const { transactions: all, accounts } = await getFinance(workspaceId);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categories = [...new Set(all.map((t) => t.category))].sort();

  const needle = q.toLowerCase();
  const filtered = all.filter((t) => {
    if (category && t.category !== category) return false;
    if (accountId && t.accountId !== accountId) return false;
    if (status && t.status !== status) return false;
    if (needle && !`${t.merchant} ${t.category} ${t.description ?? ""}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const filtering = Boolean(q || category || accountId || status);

  // The newest flagged transaction is the one Vera asks about.
  const open = all.find((t) => t.status === "flagged");
  const alert = open
    ? {
        transactionId: open.id,
        script: veraFraudScript(open.merchant, Math.abs(open.amountCents)),
        amountLabel: formatCents(Math.abs(open.amountCents)),
        merchant: open.merchant,
        riskScore: open.riskScore ?? 0,
        topSignals: parseRiskSignals(open.riskSignals)
          .filter((s) => s.points > 0)
          .slice(0, 3)
          .map((s) => s.detail),
      }
    : null;

  const flaggedCount = all.filter((t) => t.status === "flagged").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="transactions-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Every charge, newest first. Vera scores each new purchase for fraud and asks you about the risky ones.
        </p>
      </div>

      <ErrorBanner message={error || undefined} />
      {alert && <FraudAlert alert={alert} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 space-y-4 lg:order-1">
          <form method="get" action="/app/transactions" className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="tx-filters">
            <div className="space-y-1">
              <label htmlFor="f-q" className="text-xs font-medium text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input id="f-q" name="q" defaultValue={q} placeholder="Merchant, category or note" className={`${FIELD} pl-9`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="f-category" className="text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <select id="f-category" name="category" defaultValue={category} className={FIELD}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="f-account" className="text-xs font-medium text-muted-foreground">
                  Account
                </label>
                <select id="f-account" name="account" defaultValue={accountId} className={FIELD}>
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="f-status" className="text-xs font-medium text-muted-foreground">
                  Status
                </label>
                <select id="f-status" name="status" defaultValue={status} className={FIELD}>
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Apply filters
              </button>
              {filtering && (
                <Link href="/app/transactions" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  Clear
                </Link>
              )}
            </div>
          </form>

          <p className="text-sm text-muted-foreground" data-testid="tx-count" aria-live="polite">
            Showing {visible.length} of {all.length} transaction{all.length === 1 ? "" : "s"}
            {filtering && ` (${filtered.length} match${filtered.length === 1 ? "es" : ""})`}
            {flaggedCount > 0 && ` · ${flaggedCount} flagged`}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="tx-empty">
              {all.length === 0 ? "No transactions yet." : "No transactions match these filters."}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card" data-testid="transaction-list">
              {visible.map((t) => (
                <TransactionRow key={t.id} tx={t} accountName={accountName.get(t.accountId) ?? "Guard card"} />
              ))}
            </ul>
          )}

          {!showAll && filtered.length > PAGE_SIZE && (
            <div className="text-center">
              <Link
                href={`/app/transactions?${new URLSearchParams({
                  ...(q && { q }),
                  ...(category && { category }),
                  ...(accountId && { account: accountId }),
                  ...(status && { status }),
                  all: "1",
                }).toString()}`}
                className="inline-flex rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Show all {filtered.length}
              </Link>
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-6">
          <SimulateForm />
        </div>
      </div>
    </div>
  );
}
