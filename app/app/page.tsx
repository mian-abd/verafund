import { CreditCard, PiggyBank, ShieldAlert, Wallet } from "lucide-react";
import { addSubscriptionAction } from "../actions";
import { Disclosure } from "@/components/Disclosure";
import { DiscoveryPanel } from "@/components/discovery/DiscoveryPanel";
import { ErrorBanner, SubscriptionPanel } from "@/components/guard";
import { PageHeader, SectionHeading, StatTile } from "@/components/Page";
import { ReturnTo, SubmitButton } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { getDashboard } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { pickVeraAlert } from "@/lib/vera";
import { VeraAlert } from "@/components/VeraAlert";

const inputClass = "field";
const labelClass = "text-sm font-medium text-foreground";

function AddSubscriptionForm() {
  return (
    // The wrapper only adds the shared card depth; the toggle itself is the shared Disclosure.
    <div className="rounded-2xl [box-shadow:var(--shadow-card)]">
      <Disclosure label="Add subscription">
        <form action={addSubscriptionAction} className="grid gap-4 p-5 sm:grid-cols-2">
          <ReturnTo />
          <div className="space-y-1.5">
            <label htmlFor="merchant" className={labelClass}>Merchant</label>
            <input id="merchant" name="merchant" required maxLength={40} placeholder="e.g. Calm" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="price" className={labelClass}>Price ($)</label>
            <input id="price" name="price" required inputMode="decimal" placeholder="12.99" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cycle" className={labelClass}>Billing cycle</label>
            <select id="cycle" name="cycle" defaultValue="monthly" className={inputClass}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="category" className={labelClass}>Category (optional)</label>
            <input id="category" name="category" maxLength={30} placeholder="Wellness" className={inputClass} />
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <input id="trial" name="trial" type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
            <label htmlFor="trial" className={labelClass}>Free trial</label>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="trialDays" className={labelClass}>Trial length (days)</label>
            <input id="trialDays" name="trialDays" type="number" min={1} max={90} step={1} defaultValue={7} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Issuing card…">Save subscription</SubmitButton>
          </div>
        </form>
      </Disclosure>
    </div>
  );
}

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const { subscriptions, stats } = await getDashboard(workspaceId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Guarded subscriptions"
        description="Each subscription has its own card. Charges above the limit, or after a free trial ends, are declined until you say otherwise."
      />

      <ErrorBanner message={error} />

      <VeraAlert alert={pickVeraAlert(subscriptions)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Monthly spend guarded" value={formatCents(stats.monthlyCents)} icon={<Wallet size={16} aria-hidden="true" />} />
        <StatTile label="Subscriptions" value={String(subscriptions.length)} icon={<CreditCard size={16} aria-hidden="true" />} />
        <StatTile
          label="Charges declined"
          value={String(stats.declinedCount)}
          icon={<ShieldAlert size={16} aria-hidden="true" />}
          tone={stats.declinedCount > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Declined amount"
          value={formatCents(stats.declinedCents)}
          icon={<PiggyBank size={16} aria-hidden="true" />}
          tone={stats.declinedCents > 0 ? "success" : "default"}
        />
      </div>

      {/* Remounts closed and empty after each successful add */}
      <AddSubscriptionForm key={subscriptions.length} />

      <DiscoveryPanel searchParams={searchParams} />

      <div className="space-y-4 pt-2">
        <SectionHeading
          title="Your cards"
          description={
            subscriptions.length === 0
              ? "Nothing here yet."
              : `${subscriptions.length} card${subscriptions.length === 1 ? "" : "s"}, each capped at its own price.`
          }
        />
        {subscriptions.length === 0 && (
          <div className="surface flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CreditCard size={20} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">No subscriptions guarded yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add one above, or scan your transactions and VeraFund will find the recurring charges for you.
            </p>
          </div>
        )}
        {subscriptions.map((sub) => (
          <SubscriptionPanel key={sub.id} sub={sub} />
        ))}
      </div>
    </div>
  );
}
