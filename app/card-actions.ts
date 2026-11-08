"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";
import { stripeCardDetails } from "@/lib/payments/stripe";
import { getWorkspaceId } from "@/lib/session";
import { testCardFor } from "@/lib/test-card";

export type CardDetails =
  | { ok: true; number: string; cvc: string; expMonth: number; expYear: number; brand: string; last4: string; issuer: "stripe" | "verafund" }
  | { ok: false; message: string };

// "Show card details" on a subscription's virtual card. Workspace-scoped; only cards
// issued on Stripe have a network card number to show.
export async function revealCardAction(subscriptionId: string): Promise<CardDetails> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { ok: false, message: "Your session expired. Sign in again." };
  const db = await getDb();
  const [sub] = await db
    .select({ cardId: subscriptions.cardId, provider: subscriptions.cardProvider, last4: subscriptions.cardLast4 })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) return { ok: false, message: "That card isn't in your account." };
  if (sub.provider !== "stripe") return { ok: true, issuer: "verafund", ...testCardFor(sub.cardId, sub.last4) };
  try {
    return { ok: true, issuer: "stripe", ...(await stripeCardDetails(sub.cardId)) };
  } catch (err) {
    console.error("[reveal card]", err instanceof Error ? err.message : err);
    return { ok: false, message: "Couldn't reach Stripe just now. Try again." };
  }
}
