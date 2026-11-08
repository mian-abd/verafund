import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { markCancelledAction } from "@/app/actions";
import {
  ErrorBanner,
  LastDecision,
  PauseResumeButton,
  PendingPriceChange,
  SimulateChargeForm,
  StatusChip,
  Timeline,
  TrialEndedNotice,
} from "@/components/guard";
import { MerchantLogo } from "@/components/MerchantLogo";
import { ReturnTo, SubmitButton } from "@/components/ui";
import { VirtualCard } from "@/components/VirtualCard";
import { formatCents, formatDate } from "@/lib/format";
import { getSubscriptionDetail, GuardError } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground break-all">{value}</dd>
    </div>
  );
}

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const workspaceId = (await getWorkspaceId())!;
  const detail = await getSubscriptionDetail(workspaceId, id).catch((err) => {
    if (err instanceof GuardError) return null;
    throw err;
  });
  if (!detail) notFound();
  const { subscription: sub, timeline } = detail;
  const cycle = sub.cycle === "monthly" ? "Monthly" : "Yearly";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/app" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> All subscriptions
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MerchantLogo name={sub.merchant} size={44} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{sub.merchant}</h1>
            <p className="text-sm text-muted-foreground">{sub.category}</p>
          </div>
        </div>
        <StatusChip sub={sub} />
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <VirtualCard
            merchant={sub.merchant}
            category={sub.category}
            last4={sub.cardLast4}
            limitCents={sub.limitCents}
            provider={sub.cardProvider}
            locked={sub.cardStatus !== "active"}
            badge={sub.status === "trial_ended" ? "LOCKED" : sub.status === "cancelled" ? "CLOSED" : sub.cardStatus === "inactive" ? "PAUSED" : null}
          />
          <dl className="rounded-2xl border border-border bg-card px-4 divide-y divide-border">
            <Row label="Price" value={`${formatCents(sub.amountCents)} · ${cycle}`} />
            <Row label="Per-charge limit" value={formatCents(sub.limitCents)} />
            <Row label="Card status" value={sub.cardStatus} />
            {sub.trialEndsAt !== null && <Row label="Trial ends" value={formatDate(sub.trialEndsAt)} />}
            <Row label="Card network" value={sub.cardProvider === "stripe" ? "Stripe Issuing (sandbox)" : sub.cardProvider === "lithic" ? "Lithic virtual card (sandbox)" : "Simulated"} />
            <Row label="Card ID" value={sub.cardId} />
          </dl>
          <div className="flex flex-wrap gap-2">
            <PauseResumeButton sub={sub} />
            {sub.status !== "cancelled" && (
              <form action={markCancelledAction}>
                <ReturnTo />
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <SubmitButton variant="danger" pendingText="Closing…">
                  I cancelled with {sub.merchant}: close card
                </SubmitButton>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <LastDecision charge={sub.lastCharge} />
            {sub.pendingPriceChange && <PendingPriceChange sub={sub} charge={sub.pendingPriceChange} />}
            {sub.status === "trial_ended" && <TrialEndedNotice sub={sub} />}
            {sub.status !== "cancelled" && (
              <div className="border-t border-border pt-4">
                <SimulateChargeForm sub={sub} />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Evidence log</h2>
            <p className="text-sm text-muted-foreground">
              What you authorized, what {sub.merchant} attempted, and what the card network decided.
            </p>
            <Timeline items={timeline} />
          </section>
        </div>
      </div>
    </div>
  );
}
