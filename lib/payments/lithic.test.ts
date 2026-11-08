import { describe, expect, it } from "vitest";
import { decide, reconcile } from "../engine";
import { lithicReason } from "./lithic";

describe("lithicReason", () => {
  it("maps Lithic declines onto the engine's reasons", () => {
    expect(lithicReason("Transaction exceeds user-set transaction limit")).toBe("spending_controls");
    expect(lithicReason("USER_TRANSACTION_LIMIT")).toBe("spending_controls");
    expect(lithicReason("CARD_PAUSED")).toBe("card_inactive");
    expect(lithicReason("CARD_CLOSED")).toBe("card_canceled");
    expect(lithicReason("INSUFFICIENT_FUNDS")).toBe("insufficient_funds");
    expect(lithicReason(null)).toBeNull();
  });
});

describe("reconcile names the card network", () => {
  it("keeps the policy's own wording when the network agrees", () => {
    const local = { approved: false, reason: "above_limit" as const, text: "$18.99 is above your $15.99 limit" };
    expect(reconcile(local, { approved: false, reason: "spending_controls" }, "Lithic")).toEqual(local);
  });

  it("says which network approved or declined", () => {
    const declined = { approved: false, reason: "above_limit" as const, text: "x" };
    expect(reconcile(declined, { approved: true, reason: null }, "Lithic").text).toMatch(/^Approved by Lithic/);
    const ok = { approved: true, reason: null, text: "Within your limit" };
    expect(reconcile(ok, { approved: false, reason: "card_inactive" }, "Lithic").text).toBe("Card is inactive at Lithic");
    expect(typeof decide).toBe("function");
  });
});
