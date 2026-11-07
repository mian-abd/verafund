import { addSubscriptionAction } from "../actions";
import { Disclosure } from "@/components/Disclosure";
import { ErrorBanner, SubscriptionPanel } from "@/components/guard";
import { ReturnTo, SubmitButton } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { getDashboard } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { pickVeraAlert } from "@/lib/vera";
import { VeraAlert } from "@/components/VeraAlert";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40";

function AddSubscriptionForm() {
  return (
    <Disclosure label="Add subscription">
      <form action={addSubscriptionAction} className="grid gap-4 p-5 sm:grid-cols-2">
        <ReturnTo />
        <div className="space-y-1">
          <label htmlFor="merchant" className="text-sm font-medium">Merchant</label>
          <input id="merchant" name="merchant" required maxLength={40} placeholder="e.g. Calm" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="price" className="text-sm font-medium">Price ($)</label>
          <input id="price" name="price" required inputMode="decimal" placeholder="12.99" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cycle" className="text-sm font-medium">Billing cycle</label>
          <select id="cycle" name="cycle" defaultValue="monthly" className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="category" className="text-sm font-medium">Category (optional)</label>
          <input id="category" name="category" maxLength={30} placeholder="Wellness" className={inputClass} />
        </div>
        <div className="flex items-center gap-2">
          <input id="trial" name="trial" type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
          <label htmlFor="trial" className="text-sm font-medium">Free trial</label>
        </div>
        <div className="space-y-1">
          <label htmlFor="trialDays" className="text-sm font-medium">Trial length (days)</label>
          <input id="trialDays" name="trialDays" type="number" min={1} max={90} step={1} defaultValue={7} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Issuing card…">Save subscription</SubmitButton>
        </div>
      </form>
    </Disclosure>
  );
}

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const { subscriptions, stats } = await getDashboard(workspaceId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Guarded subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Each subscription has its own card. Charges above the limit, or after a free trial ends, are declined until you
          say otherwise.
        </p>
      </div>

      <ErrorBanner message={error} />

      <VeraAlert alert={pickVeraAlert(subscriptions)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly spend guarded" value={formatCents(stats.monthlyCents)} />
        <Stat label="Subscriptions" value={String(subscriptions.length)} />
        <Stat label="Charges declined" value={String(stats.declinedCount)} />
        <Stat label="Declined amount" value={formatCents(stats.declinedCents)} />
      </div>

      {/* Remounts closed and empty after each successful add */}
      <AddSubscriptionForm key={subscriptions.length} />

      <div className="space-y-4">
        {subscriptions.map((sub) => (
          <SubscriptionPanel key={sub.id} sub={sub} />
        ))}
      </div>
    </div>
  );
}
