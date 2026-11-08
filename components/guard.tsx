import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, CircleX, Lock, ShieldCheck, TrendingUp } from "lucide-react";
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
import { Chip, type ChipTone } from "./Page";
import { ReturnTo, SubmitButton } from "./ui";
import { VirtualCard } from "./VirtualCard";

type Tone = "ok" | "info" | "warn" | "muted";

const CHIP_TONE: Record<Tone, ChipTone> = { ok: "success", info: "info", warn: "warning", muted: "muted" };

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
    <Chip
      tone={CHIP_TONE[tone]}
      testId="subscription-status"
      icon={<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
    >
      {label}
    </Chip>
  );
}

export function DecisionBadge({ approved }: { approved: boolean }) {
  return approved ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-bold text-success">
      <CircleCheck size={13} aria-hidden="true" /> Approved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
      <CircleX size={13} aria-hidden="true" /> Declined
    </span>
  );
}

function enforcedBy(charge: Charge): string {
  if (charge.provider === "simulated") return "VeraFund rules";
  const network = charge.provider === "lithic" ? "Lithic sandbox" : "Stripe sandbox";
  return charge.providerReason ? `${network} · ${charge.providerReason}` : network;
}

export function LastDecision({ charge }: { charge: Charge | null }) {
  if (!charge) {
    return (
      <div className="well flex items-start gap-3 p-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldCheck size={16} aria-hidden="true" />
        </span>
        <p className="pt-1 text-sm text-muted-foreground">No charges yet. Use “Charge card” to send one.</p>
      </div>
    );
  }
  return (
    <div data-testid="last-decision" className="well space-y-1.5 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Last charge</span>
        <DecisionBadge approved={charge.approved} />
        <span className="text-base font-semibold tabular-nums text-foreground">{formatCents(charge.amountCents)}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(charge.attemptedAt)}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{charge.reasonText}</p>
      <p className="text-xs text-muted-foreground">
        {enforcedBy(charge)}
        {charge.resolution === "approved_new_price" ? " · you approved this new price" : ""}
        {charge.resolution === "kept_blocking" ? " · you kept blocking it" : ""}
      </p>
    </div>
  );
}

// The "Charge card" control: sends a charge through this subscription's card. Exported under its
// old name too, so existing imports keep working.
export function ChargeCardForm({ sub }: { sub: Subscription }) {
  const inputId = `amount-${sub.id}`;
  return (
    <div className="space-y-2">
    <form action={simulateChargeAction} className="flex flex-wrap items-end gap-2">
      <ReturnTo />
      <input type="hidden" name="subscriptionId" value={sub.id} />
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Charge amount from {sub.merchant}
        </label>
        <div className="field flex items-center rounded-full py-0 pl-3.5 pr-1">
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
      <SubmitButton variant="dark" pendingText="Charging…" aria-label={`Charge card from ${sub.merchant}`} className="py-[9px]">
        Charge card
      </SubmitButton>
    </form>
      <p className="max-w-sm text-xs leading-snug text-muted-foreground">
        {sub.cardProvider === "stripe"
          ? "Sends a charge through this Stripe card. Your limit and trial rules decide the outcome."
          : "Sends a charge through this card. Your limit and trial rules decide the outcome."}
      </p>
    </div>
  );
}
export const SimulateChargeForm = ChargeCardForm;

export function PendingPriceChange({ sub, charge }: { sub: Subscription; charge: Charge }) {
  return (
    <div className="space-y-3 rounded-xl border border-warning/35 bg-warning/10 p-4">
      <p className="flex gap-2.5 text-sm text-foreground">
        <TrendingUp size={16} className="mt-0.5 flex-shrink-0 text-warning" aria-hidden="true" />
        <span>
          <strong>{sub.merchant}</strong> tried to charge <strong>{formatCents(charge.amountCents)}</strong>. Your limit is{" "}
          {formatCents(sub.limitCents)}. Approve the new price, or keep blocking it.
        </span>
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
    <div className="space-y-3 rounded-xl border border-warning/35 bg-warning/10 p-4">
      <p className="flex gap-2.5 text-sm text-foreground">
        <Lock size={16} className="mt-0.5 flex-shrink-0 text-warning" aria-hidden="true" />
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
      className="surface overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <MerchantLogo name={sub.merchant} size={44} />
          <div>
            <h2 className="text-base font-semibold leading-tight text-foreground">{sub.merchant}</h2>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
              {formatCents(sub.amountCents)}/{cycle} · limit {formatCents(sub.limitCents)} · card ••{sub.cardLast4}
            </p>
          </div>
        </div>
        <StatusChip sub={sub} />
      </div>

      <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <VirtualCard
          merchant={sub.merchant}
          category={sub.category}
          last4={sub.cardLast4}
          limitCents={sub.limitCents}
          provider={sub.cardProvider}
          locked={locked}
          subscriptionId={sub.id}
          badge={sub.status === "trial_ended" ? "LOCKED" : sub.status === "cancelled" ? "CLOSED" : sub.cardStatus === "inactive" ? "PAUSED" : null}
        />
        <div className="min-w-0 space-y-4">
          <LastDecision charge={sub.lastCharge} />
          {sub.pendingPriceChange && <PendingPriceChange sub={sub} charge={sub.pendingPriceChange} />}
          {sub.status === "trial_ended" && <TrialEndedNotice sub={sub} />}
          <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd className="mt-0.5 truncate font-medium capitalize text-foreground">{sub.category}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Billing</dt>
              <dd className="mt-0.5 font-medium text-foreground">{sub.cycle === "monthly" ? "Monthly" : "Yearly"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Card</dt>
              <dd className="mt-0.5 font-medium text-foreground">{sub.status === "cancelled" ? "Closed" : sub.status === "trial_ended" ? "Locked" : locked ? (sub.cardStatus === "inactive" ? "Paused" : "Locked") : "Active"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border bg-muted/40 px-5 py-4">
        {sub.status !== "cancelled" ? (
          <ChargeCardForm sub={sub} />
        ) : (
          <p className="text-sm text-muted-foreground">Card closed. Any charge would be declined.</p>
        )}
        <div className="flex items-center gap-1">
          <PauseResumeButton sub={sub} />
          <Link
            href={`/app/subscriptions/${sub.id}`}
            className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Details for ${sub.merchant}`}
          >
            Details
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Timeline({ items, merchantById }: { items: TimelineItem[]; merchantById?: Record<string, string> }) {
  if (items.length === 0) {
    return (
      <p className="well px-4 py-6 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>
    );
  }
  return (
    <ol className="space-y-2.5" data-testid="timeline">
      {items.map((item) =>
        item.kind === "charge" ? (
          <li key={item.charge.id} className="surface flex gap-3 p-4">
            <span
              className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                item.charge.approved ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              }`}
              aria-hidden="true"
            >
              {item.charge.approved ? <CircleCheck size={16} /> : <CircleX size={16} />}
            </span>
            <div className="min-w-0 flex-1">
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
            </div>
          </li>
        ) : (
          <li key={item.event.id} className="flex gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-4 text-sm">
            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <ShieldCheck size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground">
                {merchantById ? <span className="font-semibold">{merchantById[item.event.subscriptionId]}: </span> : null}
                {item.event.detail}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
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
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <CircleAlert size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
