// Vera: the voice that tells you about a blocked charge and asks what to do.
// The script is plain text so it can be spoken by ElevenLabs or by the browser.

import type { Charge, Subscription } from "./db/schema";
import { formatCents } from "./format";

export type VeraAlertKind = "price_hike" | "trial_ended";

export interface VeraAlert {
  kind: VeraAlertKind;
  chargeId: string;
  subscriptionId: string;
  merchant: string;
  amountCents: number;
  limitCents: number;
  cycle: Subscription["cycle"];
  script: string;
}

export function veraScript(kind: VeraAlertKind, merchant: string, amountCents: number, limitCents: number): string {
  if (kind === "price_hike") {
    return (
      `Hi, it's Vera. ${merchant} just tried to charge you ${formatCents(amountCents)}, ` +
      `but your limit is ${formatCents(limitCents)}, so I blocked it. ` +
      `Should I approve the new price, or keep blocking it?`
    );
  }
  return (
    `Hi, it's Vera. Your ${merchant} free trial has ended, and they just tried to charge you ${formatCents(amountCents)}. ` +
    `I blocked it so the trial couldn't quietly turn into a paid plan. Do you want to keep ${merchant}?`
  );
}

// The most recent decline that still needs an answer, if any.
export function pickVeraAlert(
  subs: Array<Subscription & { lastCharge: Charge | null; pendingPriceChange: Charge | null }>,
): VeraAlert | null {
  const candidates: VeraAlert[] = [];
  for (const sub of subs) {
    if (sub.pendingPriceChange) {
      const c = sub.pendingPriceChange;
      candidates.push({
        kind: "price_hike",
        chargeId: c.id,
        subscriptionId: sub.id,
        merchant: sub.merchant,
        amountCents: c.amountCents,
        limitCents: sub.limitCents,
        cycle: sub.cycle,
        script: veraScript("price_hike", sub.merchant, c.amountCents, sub.limitCents),
      });
    } else if (sub.status === "trial_ended" && sub.lastCharge && !sub.lastCharge.approved && sub.lastCharge.reason === "trial_ended") {
      const c = sub.lastCharge;
      candidates.push({
        kind: "trial_ended",
        chargeId: c.id,
        subscriptionId: sub.id,
        merchant: sub.merchant,
        amountCents: c.amountCents,
        limitCents: sub.limitCents,
        cycle: sub.cycle,
        script: veraScript("trial_ended", sub.merchant, c.amountCents, sub.limitCents),
      });
    }
  }
  const createdAt = (alert: VeraAlert) =>
    subs.flatMap((s) => [s.pendingPriceChange, s.lastCharge]).find((c) => c?.id === alert.chargeId)?.createdAt ?? 0;
  return candidates.sort((a, b) => createdAt(b) - createdAt(a))[0] ?? null;
}
