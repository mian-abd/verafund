// The decision engine: given a card's policy and a charge attempt, approve or
// decline with a reason. Pure functions only, so it is unit-tested and shared by
// the simulated adapter and the Stripe reconciliation step.

import { formatCents, formatShortDate } from "./format";

export type CardStatus = "active" | "inactive" | "canceled";
export type SubscriptionStatus = "active" | "trial" | "trial_ended" | "cancelled";
export type SubscriptionKind = "paid" | "trial";
export type DeclineReason =
  | "above_limit"
  | "trial_ended"
  | "card_paused"
  | "card_closed"
  | "merchant_mismatch"
  | "insufficient_funds"
  | "provider_declined";

export interface Policy {
  merchant: string;
  limitCents: number;
  cardStatus: CardStatus;
  status: SubscriptionStatus;
  kind: SubscriptionKind;
  trialEndsAt: number | null;
}

export interface Attempt {
  merchant: string;
  amountCents: number;
  at: number;
}

export type Decision =
  | { approved: true; reason: null; text: string }
  | { approved: false; reason: DeclineReason; text: string };

export interface ProviderResult {
  approved: boolean;
  reason: string | null;
}

function decline(reason: DeclineReason, text: string): Decision {
  return { approved: false, reason, text };
}

export function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function merchantMatches(cardMerchant: string, attemptedMerchant: string): boolean {
  const a = normalizeMerchant(cardMerchant);
  const b = normalizeMerchant(attemptedMerchant);
  if (a.length < 3 || b.length < 3) return a === b && a.length > 0;
  return a === b || a.includes(b) || b.includes(a);
}

export function trialHasEnded(policy: Pick<Policy, "kind" | "trialEndsAt">, now: number): boolean {
  return policy.kind === "trial" && policy.trialEndsAt !== null && now >= policy.trialEndsAt;
}

export function decide(policy: Policy, attempt: Attempt): Decision {
  if (policy.status === "cancelled" || policy.cardStatus === "canceled") {
    return decline("card_closed", `Card closed after you cancelled ${policy.merchant}`);
  }
  if (trialHasEnded(policy, attempt.at)) {
    return decline(
      "trial_ended",
      `Free trial ended ${formatShortDate(policy.trialEndsAt!)}; card locked so the trial can't convert to paid`,
    );
  }
  if (policy.cardStatus === "inactive") {
    return decline("card_paused", "Card is paused");
  }
  if (!merchantMatches(policy.merchant, attempt.merchant)) {
    return decline(
      "merchant_mismatch",
      `This card only works for ${policy.merchant}; ${attempt.merchant} tried to charge it`,
    );
  }
  if (attempt.amountCents > policy.limitCents) {
    return decline(
      "above_limit",
      `${formatCents(attempt.amountCents)} is above your ${formatCents(policy.limitCents)} limit`,
    );
  }
  return { approved: true, reason: null, text: `Within your ${formatCents(policy.limitCents)} limit` };
}

// Stripe is the source of truth for the outcome; the local decision supplies the
// human-readable reason. When they disagree we say so instead of hiding it.
export function reconcile(local: Decision, provider: ProviderResult, network = "Stripe"): Decision {
  if (provider.approved) {
    if (local.approved) return local;
    return {
      approved: true,
      reason: null,
      text: `Approved by ${network}, but your policy expected a decline (${local.text})`,
    };
  }
  switch (provider.reason) {
    case "insufficient_funds":
      return decline(
        "insufficient_funds",
        network === "Stripe"
          ? "Stripe sandbox Issuing balance is too low; add funds in the Stripe dashboard"
          : `${network} sandbox balance is too low`,
      );
    case "card_canceled":
      return local.approved ? decline("card_closed", `Card is closed at ${network}`) : local;
    case "card_inactive":
      return local.approved ? decline("card_paused", `Card is inactive at ${network}`) : local;
    case "spending_controls":
    case "authorization_controls":
      return local.approved ? decline("provider_declined", `Declined by ${network} spending controls`) : local;
    default:
      return local.approved
        ? decline("provider_declined", `Declined by ${network} (${provider.reason ?? "no reason given"})`)
        : local;
  }
}
