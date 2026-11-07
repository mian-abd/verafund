import { randomInt, randomUUID } from "node:crypto";
import type { PaymentsAdapter } from "./types";

// No payment network: cards exist only in our database and the decision engine's
// verdict is final. The UI shows a "Simulated" badge whenever this adapter is active.
export const simulatedPayments: PaymentsAdapter = {
  mode: "simulated",
  async createCard() {
    return { cardId: `sim_${randomUUID()}`, last4: String(randomInt(1000, 10000)) };
  },
  async setLimit() {},
  async setStatus() {},
  async authorize() {
    throw new Error("Simulated cards are decided locally; authorize() should not be called");
  },
};
