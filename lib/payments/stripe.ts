import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { appSettings } from "../db/schema";
import type { PaymentsAdapter } from "./types";

// Stripe Issuing in a sandbox. Price caps are enforced natively with a
// per_authorization spending limit (spending controls run before any webhook), and
// trial locks / pauses by setting the card inactive. Charges are simulated with
// the Issuing test-helpers authorization endpoint.

const CARDHOLDER_SETTING = "stripe_cardholder_id";

let client: Stripe | null = null;

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("Only Stripe sandbox (test mode) keys are allowed");
  }
  client ??= new Stripe(key, { maxNetworkRetries: 1, timeout: 15_000 });
  return client;
}

let cardholderPromise: Promise<string> | null = null;

async function cardholderId(): Promise<string> {
  const fromEnv = process.env.STRIPE_CARDHOLDER_ID?.trim();
  if (fromEnv) return fromEnv;
  cardholderPromise ??= (async () => {
    const db = await getDb();
    const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, CARDHOLDER_SETTING));
    if (saved) return saved.value;
    const holder = await stripe().issuing.cardholders.create({
      name: "VeraFund Demo",
      email: "demo@verafund.example",
      phone_number: "+18888675309", // required for card creation (3DS); Stripe's documented example number
      type: "individual",
      status: "active",
      individual: {
        first_name: "Vera",
        last_name: "Demo",
        card_issuing: { user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" } },
      },
      billing: {
        address: { line1: "123 Main Street", city: "San Francisco", state: "CA", postal_code: "94111", country: "US" },
      },
    });
    await db
      .insert(appSettings)
      .values({ key: CARDHOLDER_SETTING, value: holder.id })
      .onConflictDoNothing();
    return holder.id;
  })().catch((err) => {
    cardholderPromise = null;
    throw err;
  });
  return cardholderPromise;
}

export const stripePayments: PaymentsAdapter = {
  mode: "stripe",

  async createCard({ merchant, limitCents, workspaceId, subscriptionId }) {
    // Newer sandboxes fund Issuing from a v2 financial account that must be passed explicitly.
    const financialAccount = process.env.STRIPE_FINANCIAL_ACCOUNT?.trim();
    const params: Stripe.Issuing.CardCreateParams & { financial_account_v2?: string } = {
      cardholder: await cardholderId(),
      currency: "usd",
      type: "virtual",
      status: "active",
      spending_controls: { spending_limits: [{ amount: limitCents, interval: "per_authorization" }] },
      metadata: { workspace_id: workspaceId, subscription_id: subscriptionId, merchant },
      ...(financialAccount ? { financial_account_v2: financialAccount } : {}),
    };
    const card = await stripe().issuing.cards.create(params);
    return { cardId: card.id, last4: card.last4 };
  },

  async setLimit(cardId, limitCents) {
    await stripe().issuing.cards.update(cardId, {
      spending_controls: { spending_limits: [{ amount: limitCents, interval: "per_authorization" }] },
    });
  },

  async setStatus(cardId, status) {
    await stripe().issuing.cards.update(cardId, { status });
  },

  async authorize({ cardId, amountCents, merchant }) {
    const auth = await stripe().testHelpers.issuing.authorizations.create({
      card: cardId,
      amount: amountCents,
      merchant_data: { name: merchant },
    });
    const last = auth.request_history.at(-1);
    return { approved: auth.approved, reason: last?.reason ?? null, authorizationId: auth.id };
  },
};

// The full test card number, expiry and CVC of a sandbox card, for the "Show card details"
// view. Only sandbox keys are accepted (see stripe()), so these are never real card numbers.
export async function stripeCardDetails(
  cardId: string,
): Promise<{ number: string; cvc: string; expMonth: number; expYear: number; brand: string; last4: string }> {
  const card = await stripe().issuing.cards.retrieve(cardId, { expand: ["number", "cvc"] });
  return {
    number: card.number ?? "",
    cvc: card.cvc ?? "",
    expMonth: card.exp_month,
    expYear: card.exp_year,
    brand: card.brand,
    last4: card.last4,
  };
}
