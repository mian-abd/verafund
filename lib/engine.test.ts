import { describe, expect, it } from "vitest";
import { decide, merchantMatches, reconcile, type Policy } from "./engine";
import { parseDollarsToCents } from "./format";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 20, 0, 0);

const netflix: Policy = {
  merchant: "Netflix",
  limitCents: 1599,
  cardStatus: "active",
  status: "active",
  kind: "paid",
  trialEndsAt: null,
};

const trial: Policy = {
  merchant: "Calm",
  limitCents: 1299,
  cardStatus: "active",
  status: "trial",
  kind: "trial",
  trialEndsAt: NOW + 7 * DAY,
};

describe("decide", () => {
  it("approves a charge within the limit", () => {
    const d = decide(netflix, { merchant: "Netflix", amountCents: 1599, at: NOW });
    expect(d.approved).toBe(true);
  });

  it("declines a price hike above the limit with the amounts in the reason", () => {
    const d = decide(netflix, { merchant: "Netflix", amountCents: 1899, at: NOW });
    expect(d).toMatchObject({ approved: false, reason: "above_limit" });
    expect(d.text).toBe("$18.99 is above your $15.99 limit");
  });

  it("approves during a trial and declines once the trial has ended", () => {
    expect(decide(trial, { merchant: "Calm", amountCents: 1299, at: NOW + DAY }).approved).toBe(true);
    const after = decide(trial, { merchant: "Calm", amountCents: 1299, at: NOW + 8 * DAY });
    expect(after).toMatchObject({ approved: false, reason: "trial_ended" });
    expect(after.text.toLowerCase()).toContain("trial ended");
  });

  it("stops treating it as a trial after the user keeps the subscription", () => {
    const kept: Policy = { ...trial, kind: "paid", status: "active" };
    expect(decide(kept, { merchant: "Calm", amountCents: 1299, at: NOW + 8 * DAY }).approved).toBe(true);
  });

  it("declines on a paused card", () => {
    const d = decide({ ...netflix, cardStatus: "inactive" }, { merchant: "Netflix", amountCents: 100, at: NOW });
    expect(d.reason).toBe("card_paused");
  });

  it("puts a closed card ahead of trial and pause reasons", () => {
    const d = decide(
      { ...trial, status: "cancelled", cardStatus: "canceled" },
      { merchant: "Calm", amountCents: 100, at: NOW + 8 * DAY },
    );
    expect(d.reason).toBe("card_closed");
  });

  it("declines a different merchant", () => {
    const d = decide(netflix, { merchant: "Hulu", amountCents: 100, at: NOW });
    expect(d.reason).toBe("merchant_mismatch");
  });
});

describe("merchantMatches", () => {
  it("tolerates punctuation and descriptor suffixes", () => {
    expect(merchantMatches("Netflix", "NETFLIX.COM")).toBe(true);
    expect(merchantMatches("Planet Fitness", "planet-fitness")).toBe(true);
    expect(merchantMatches("Netflix", "Spotify")).toBe(false);
  });
});

describe("reconcile", () => {
  const above = decide(netflix, { merchant: "Netflix", amountCents: 1899, at: NOW });
  const ok = decide(netflix, { merchant: "Netflix", amountCents: 1599, at: NOW });

  it("keeps the specific local reason when Stripe's spending controls decline", () => {
    expect(reconcile(above, { approved: false, reason: "spending_controls" })).toEqual(above);
  });

  it("follows Stripe when it approves something the policy would decline, and says so", () => {
    const d = reconcile(above, { approved: true, reason: "webhook_approved" });
    expect(d.approved).toBe(true);
    expect(d.text).toContain("expected a decline");
  });

  it("surfaces an empty sandbox balance", () => {
    expect(reconcile(ok, { approved: false, reason: "insufficient_funds" }).reason).toBe("insufficient_funds");
  });
});

describe("parseDollarsToCents", () => {
  it("parses dollars into integer cents without float drift", () => {
    expect(parseDollarsToCents("18.99")).toBe(1899);
    expect(parseDollarsToCents("$1,234.5")).toBe(123450);
    expect(parseDollarsToCents("15.99")).toBe(1599);
  });

  it("rejects junk, zero, sub-cent precision and amounts over $10,000", () => {
    for (const bad of ["", "abc", "0", "15.999", "-5", "10000.01", undefined]) {
      expect(parseDollarsToCents(bad)).toBeNull();
    }
  });
});
