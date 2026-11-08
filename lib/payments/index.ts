import { lithicPayments } from "./lithic";
import { simulatedPayments } from "./simulated";
import { stripePayments } from "./stripe";
import type { PaymentsAdapter, PaymentsMode } from "./types";

export type { PaymentsAdapter, PaymentsMode } from "./types";

// New cards go to the first configured network. Existing cards keep the network they
// were issued on (see adapterFor), so switching never strands a card.
export function paymentsMode(): PaymentsMode {
  if (process.env.LITHIC_API_KEY?.trim()) return "lithic";
  if (process.env.STRIPE_SECRET_KEY?.trim()) return "stripe";
  return "simulated";
}

export function getPayments(): PaymentsAdapter {
  return adapterFor(paymentsMode());
}

export function adapterFor(provider: PaymentsMode): PaymentsAdapter {
  if (provider === "stripe") return stripePayments;
  if (provider === "lithic") return lithicPayments;
  return simulatedPayments;
}

export const NETWORK_NAME: Record<PaymentsMode, string> = {
  stripe: "Stripe",
  lithic: "Lithic",
  simulated: "VeraFund",
};
