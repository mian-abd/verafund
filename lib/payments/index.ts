import { simulatedPayments } from "./simulated";
import { stripePayments } from "./stripe";
import type { PaymentsAdapter, PaymentsMode } from "./types";

export type { PaymentsAdapter, PaymentsMode } from "./types";

export function paymentsMode(): PaymentsMode {
  return process.env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "simulated";
}

export function getPayments(): PaymentsAdapter {
  return paymentsMode() === "stripe" ? stripePayments : simulatedPayments;
}

export function adapterFor(provider: PaymentsMode): PaymentsAdapter {
  return provider === "stripe" ? stripePayments : simulatedPayments;
}
