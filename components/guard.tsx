import Link from "next/link";
import { CircleCheck, CircleX, Lock, ShieldCheck } from "lucide-react";
import {
  approveNewPriceAction,
  keepAfterTrialAction,
  keepBlockingAction,
  pauseCardAction,
  resumeCardAction,
  simulateChargeAction,
} from "@/app/actions";
import type { Charge, Subscription } from "@/lib/db/schema";
import { formatCents, formatDateTime, formatShortDate } from "@/lib/format";
import type { SubscriptionView, TimelineItem } from "@/lib/guard";
import { MerchantLogo } from "./MerchantLogo";
import { ReturnTo, SubmitButton } from "./ui";
import { VirtualCard } from "./VirtualCard";

type Tone = "ok" | "info" | "warn" | "muted";

const TONES: Record<Tone, string> = {
  ok: "bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/30",
  info: "bg-blue-600/10 text-blue-700 dark:text-blue-300 border-blue-600/30",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40",
  muted: "bg-muted text-muted-foreground border-border",
};

export function subscriptionStatus(sub: Subscription): { label: string; tone: Tone } {
  if (sub.status === "cancelled") return { label: "Cancelled: card closed", tone: "muted" };
  if (sub.status === "trial_ended") return { label: "Trial ended: card locked", tone: "warn" };
  if (sub.status === "trial" && sub.trialEndsAt) {
    return { label: `Trial · ends ${formatShortDate(sub.trialEndsAt)}`, tone: "info" };
  }
  if (sub.cardStatus === "inactive") return { label: "Paused", tone: "warn" };
  return { label: "Protected", tone: "ok" };
}

export function StatusChip({ sub }: { sub: Subscription }) {
  const { label, tone } = subscriptionStatus(sub);
  return (
    <span
      data-testid="subscription-status"
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

export function DecisionBadge({ approved }: { approved: boolean }) {
  return approved ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-400">
      <CircleCheck size={13} aria-hidden="true" /> Approved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
      <CircleX size={13} aria-hidden="true" /> Declined
    </span>
  );
}

function enforcedBy(charge: Charge): string {
  if (charge.provider === "simulated") return "Simulated decision";
  return charge.providerReason ? `Stripe sandbox · ${charge.providerReason}` : "Stripe sandbox";
}

export function LastDecision({ charge }: { charge: Charge | null }) {
  if (!charge) {
    return <p className="text-sm text-muted-foreground">No charges yet. Use “Simulate charge” to send one.</p>;
  }
  return (
    <div data-testid="last-decision" className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Last charge</span>
        <DecisionBadge approved={charge.approved} />
        <span className="font-semibold tabular-nums">{formatCents(charge.amountCents)}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(charge.attemptedAt)}</span>
      </div>
      <p className="text-sm text-foreground">{charge.reasonText}</p>
      <p className="text-xs text-muted-foreground">
        {enforcedBy(charge)}
        {charge.resolution === "approved_new_price" ? " · you approved this new price" : ""}
        {charge.resolution === "kept_blocking" ? " · you kept blocking it" : ""}
      </p>
    </div>
  );
}

export function SimulateChargeForm({ sub }: { sub: Subscription }) {
  const inputId = `amount-${sub.id}`;
  return (
    <form action={simulateChargeAction} className="flex flex-wrap items-end gap-2">
      <ReturnTo />
      <input type="hidden" name="subscriptionId" value={sub.id} />
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Charge amount from {sub.merchant}
        </label>
        <div className="flex items-center rounded-full border border-input bg-background pl-3 focus-within:ring-2 focus-within:ring-primary/40">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            key={`${sub.amountCents}-${sub.limitCents}`}
            id={inputId}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={(sub.amountCents / 100).toFixed(2)}
            aria-label={`Charge amount for ${sub.merchant}`}
            className="w-24 bg-transparent px-2 py-2 text-sm tabular-nums outline-none"
          />
        </div>
      </div>
      <SubmitButton variant="dark" pendingText="Charging…" aria-label={`Simulate charge from ${sub.merchant}`}>
        Simulate charge
      </SubmitButton>
    </form>
  );
}

export function PendingPriceChange({ sub, charge }: { sub: Subscription; charge: Charge }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <p className="text-sm text-foreground">
        <strong>{sub.merchant}</strong> tried to charge <strong>{formatCents(charge.amountCents)}</strong>. Your limit is{" "}
        {formatCents(sub.limitCents)}. Approve the new price, or keep blocking it.
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={approveNewPriceAction}>
          <ReturnTo />
          <input type="hidden" name="chargeId" value={charge.id} />
          <SubmitButton pendingText="Approving…">Approve {formatCents(charge.amountCents)} going forward</SubmitButton>
        </form>
        <form action={keepBlockingAction}>
          <ReturnTo />
          <input type="hidden" name="chargeId" value={charge.id} />
          <SubmitButton variant="outline" pendingText="Saving…">
            Keep blocking
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function TrialEndedNotice({ sub }: { sub: Subscription }) {
  const cycle = sub.cycle === "monthly" ? "mo" : "yr";
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <p className="text-sm text-foreground flex gap-2">
        <Lock size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span>
          The free trial ended and the card is locked, so it can’t quietly convert to {formatCents(sub.amountCents)}/{cycle}.
          This doesn’t cancel your account with {sub.merchant}.
        </span>
      </p>
      <form action={keepAfterTrialAction}>
        <ReturnTo />
        <input type="hidden" name="subscriptionId" value={sub.id} />
        <SubmitButton variant="outline" pendingText="Unlocking…">
          Keep {sub.merchant} at {formatCents(sub.amountCents)}/{cycle}
        </SubmitButton>
      </form>
    </div>
  );
}

export function PauseResumeButton({ sub }: { sub: Subscription }) {
  if (sub.status === "cancelled" || sub.status === "trial_ended") return null;
  const paused = sub.cardStatus === "inactive";
  return (
    <form action={paused ? resumeCardAction : pauseCardAction}>
      <ReturnTo />
      <input type="hidden" name="subscriptionId" value={sub.id} />
      <SubmitButton variant="ghost" pendingText={paused ? "Resuming…" : "Pausing…"} aria-label={`${paused ? "Resume" : "Pause"} card for ${sub.merchant}`}>
        {paused ? "Resume card" : "Pause card"}
      </SubmitButton>
    </form>
  );
}

export function SubscriptionPanel({ sub }: { sub: SubscriptionView }) {
  const cycle = sub.cycle === "monthly" ? "mo" : "yr";
  const locked = sub.cardStatus !== "active";
  return (
    <section
      id={`sub-${sub.id}`}
      aria-label={sub.merchant}
      data-testid="subscription"
      data-merchant={sub.merchant}
      className="rounded-2xl border border-border bg-card p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <MerchantLogo name={sub.merchant} size={40} />
          <div>
            <h2 className="text-base font-semibold text-foreground">{sub.merchant}</h2>
            <p className="text-sm text-muted-foreground">
              {formatCents(sub.amountCents)}/{cycle} · limit {formatCents(sub.limitCents)} · card ••{sub.cardLast4}
            </p>
          </div>
        </div>
        <StatusChip sub={sub} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <VirtualCard
          merchant={sub.merchant}
          category={sub.category}
          last4={sub.cardLast4}
          limitCents={sub.limitCents}
          provider={sub.cardProvider}
          locked={locked}
          badge={sub.status === "trial_ended" ? "LOCKED" : sub.status === "cancelled" ? "CLOSED" : sub.cardStatus === "inactive" ? "PAUSED" : null}
        />
        <div className="space-y-4 min-w-0">
          <LastDecision charge={sub.lastCharge} />
          {sub.pendingPriceChange && <PendingPriceChange sub={sub} charge={sub.pendingPriceChange} />}
          {sub.status === "trial_ended" && <TrialEndedNotice sub={sub} />}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        {sub.status !== "cancelled" ? (
          <SimulateChargeForm sub={sub} />
        ) : (
          <p className="text-sm text-muted-foreground">Card closed. Any charge would be declined.</p>
        )}
        <div className="flex items-center gap-1">
          <PauseResumeButton sub={sub} />
          <Link
            href={`/app/subscriptions/${sub.id}`}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={`Details for ${sub.merchant}`}
          >
            Details
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Timeline({ items, merchantById }: { items: TimelineItem[]; merchantById?: Record<string, string> }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-3" data-testid="timeline">
      {items.map((item) =>
        item.kind === "charge" ? (
          <li key={item.charge.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <DecisionBadge approved={item.charge.approved} />
              <span className="font-semibold tabular-nums">{formatCents(item.charge.amountCents)}</span>
              <span className="text-foreground">charge from {item.charge.merchant}</span>
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(item.at)}</span>
            </div>
            <p className="mt-1 text-sm text-foreground">{item.charge.reasonText}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {enforcedBy(item.charge)}
              {item.charge.providerAuthorizationId ? ` · ${item.charge.providerAuthorizationId}` : ""}
              {item.charge.resolution === "approved_new_price" ? " · you approved this new price" : ""}
              {item.charge.resolution === "kept_blocking" ? " · you kept blocking it" : ""}
            </p>
          </li>
        ) : (
          <li key={item.event.id} className="flex gap-3 rounded-xl border border-dashed border-border p-4 text-sm">
            <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground">
                {merchantById ? <span className="font-semibold">{merchantById[item.event.subscriptionId]}: </span> : null}
                {item.event.detail}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.event.actor === "user" ? "You" : "VeraFund"} · {formatDateTime(item.at)}
              </p>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
