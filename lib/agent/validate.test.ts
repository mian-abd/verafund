import { describe, expect, it } from "vitest";
import { testCtx, testSub } from "./testctx";
import { coerceDollars, planGuard, validateAction } from "./validate";

const ctx = testCtx();

describe("validateAction: cards", () => {
  it("cancel reads back the real price and is honest about what happens", () => {
    const v = validateAction("cancel_subscription", { merchant: "netflix" }, ctx);
    expect(v).toMatchObject({ ok: true, params: { subscriptionId: "sub-netflix", merchant: "Netflix" } });
    if (v.ok) {
      expect(v.summary).toBe(
        "Netflix is $15.99 a month. I'll close its card so they can't charge you again and draft a cancellation message. Should I go ahead?",
      );
      expect(v.summary).not.toMatch(/cancelled your (?:subscription|contract)/i);
    }
  });

  it("asks a clarifying question for an unknown merchant instead of proposing", () => {
    const v = validateAction("cancel_subscription", { merchant: "Hulu" }, ctx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.clarify).toMatch(/couldn't find .*Hulu.*Netflix, Spotify/);
  });

  it("asks which one when the merchant is missing or ambiguous", () => {
    expect(validateAction("pause_card", {}, ctx).ok).toBe(false);
    const v = validateAction("pause_card", { merchant: "netflix and spotify" }, ctx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.clarify).toMatch(/Netflix or Spotify/);
  });

  it("does not offer to act on a closed card", () => {
    const closed = testCtx({ subs: [testSub("Netflix", { status: "cancelled", cardStatus: "canceled" })] });
    const v = validateAction("pause_card", { merchant: "Netflix" }, closed);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.clarify).toMatch(/already closed/);
  });

  it("won't pause a paused card or resume a running one", () => {
    const paused = testCtx({ subs: [testSub("Spotify", { cardStatus: "inactive" })] });
    expect(validateAction("pause_card", { merchant: "Spotify" }, paused).ok).toBe(false);
    expect(validateAction("resume_card", { merchant: "Spotify" }, paused).ok).toBe(true);
    expect(validateAction("resume_card", { merchant: "Netflix" }, ctx).ok).toBe(false);
  });

  it("won't resume a trial whose card the trial end locked", () => {
    const ended = testCtx({ subs: [testSub("Adobe", { kind: "trial", status: "trial_ended", cardStatus: "inactive" })] });
    const v = validateAction("resume_card", { merchant: "Adobe" }, ended);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.clarify).toMatch(/keep Adobe/);
  });

  it("keep_after_trial only applies to trials", () => {
    expect(validateAction("keep_after_trial", { merchant: "Adobe" }, ctx).ok).toBe(true);
    expect(validateAction("keep_after_trial", { merchant: "Netflix" }, ctx).ok).toBe(false);
    expect(validateAction("keep_after_trial", {}, ctx)).toMatchObject({ ok: true, params: { merchant: "Adobe Creative Cloud" } });
  });
});

describe("validateAction: create_card", () => {
  it("accepts a new merchant with a limit and optional trial", () => {
    const v = validateAction("create_card", { merchant: "hulu", monthly_limit_dollars: 12, trial_days: 7 }, ctx);
    expect(v).toMatchObject({ ok: true, params: { merchant: "Hulu", amountCents: 1200, trialDays: 7 } });
    if (v.ok) expect(v.summary).toMatch(/\$12\.00.*7-day free trial/);
  });

  it("rejects a duplicate, a missing limit, an absurd limit and a bad trial", () => {
    expect(validateAction("create_card", { merchant: "Netflix", monthly_limit_dollars: 12 }, ctx).ok).toBe(false);
    expect(validateAction("create_card", { merchant: "Hulu" }, ctx).ok).toBe(false);
    expect(validateAction("create_card", { merchant: "Hulu", monthly_limit_dollars: 50_000 }, ctx).ok).toBe(false);
    expect(validateAction("create_card", { merchant: "Hulu", monthly_limit_dollars: 12, trial_days: 400 }, ctx).ok).toBe(false);
    expect(validateAction("create_card", { monthly_limit_dollars: 12 }, ctx).ok).toBe(false);
  });
});

describe("validateAction: price changes", () => {
  const pending = testCtx({ subs: [testSub("Netflix", { pendingCharge: { id: "ch-9", amountCents: 1899 } }), testSub("Spotify")] });

  it("uses the charge id from the real pending decline", () => {
    expect(validateAction("approve_new_price", { merchant: "Netflix" }, pending)).toMatchObject({ ok: true, params: { chargeId: "ch-9" } });
    expect(validateAction("keep_blocking", { merchant: "Netflix" }, pending)).toMatchObject({ ok: true, params: { chargeId: "ch-9" } });
  });

  it("refuses when that merchant has no charge waiting", () => {
    expect(validateAction("approve_new_price", { merchant: "Spotify" }, pending).ok).toBe(false);
    expect(validateAction("approve_new_price", { merchant: "Netflix" }, ctx).ok).toBe(false);
  });
});

describe("validateAction: money", () => {
  it("set_budget needs a real category and a sane amount", () => {
    expect(validateAction("set_budget", { category: "food", monthly_limit_dollars: 300 }, ctx)).toMatchObject({
      ok: true,
      params: { category: "food", limitCents: 30000, budgetId: "b1" },
    });
    expect(validateAction("set_budget", { category: "groceries", monthly_limit_dollars: "$300" }, ctx).ok).toBe(true);
    expect(validateAction("set_budget", { category: "pottery", monthly_limit_dollars: 300 }, ctx).ok).toBe(false);
    expect(validateAction("set_budget", { category: "food" }, ctx).ok).toBe(false);
    expect(validateAction("set_budget", { category: "food", monthly_limit_dollars: -5 }, ctx).ok).toBe(false);
  });

  it("add_to_goal can't exceed the target", () => {
    expect(validateAction("add_to_goal", { goal_name: "Emergency Fund", dollars: 200 }, ctx)).toMatchObject({
      ok: true,
      params: { goalId: "g1", cents: 20000 },
    });
    const over = validateAction("add_to_goal", { goal_name: "Emergency Fund", dollars: 1501 }, ctx);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.clarify).toMatch(/up to \$1,500\.00/);
    const full = testCtx({ goals: [{ id: "g", name: "Done", targetCents: 1000, savedCents: 1000 }] });
    expect(validateAction("add_to_goal", { goal_name: "Done", dollars: 5 }, full).ok).toBe(false);
  });

  it("pay_debt can't exceed the balance", () => {
    expect(validateAction("pay_debt", { debt_name: "Discover it Student", dollars: 100 }, ctx)).toMatchObject({
      ok: true,
      params: { debtId: "d1", cents: 10000 },
    });
    const over = validateAction("pay_debt", { debt_name: "Discover it Student", dollars: 681 }, ctx);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.clarify).toMatch(/more than you owe/);
    expect(validateAction("pay_debt", { debt_name: "Mortgage", dollars: 5 }, ctx).ok).toBe(false);
    const v = validateAction("pay_debt", { debt_name: "Discover it Student", dollars: 100 }, ctx);
    if (v.ok) expect(v.summary).toMatch(/I don't move money from your bank/);
  });
});

describe("validateAction: fraud alert, memory", () => {
  const flagged = testCtx({ flagged: { id: "tx-1", merchant: "Binance", amountCents: 45000, riskScore: 82 } });

  it("needs a flagged charge, and reads back what each answer does", () => {
    expect(validateAction("answer_fraud_alert", { was_me: true }, ctx).ok).toBe(false);
    const no = validateAction("answer_fraud_alert", { was_me: false }, flagged);
    expect(no).toMatchObject({ ok: true, params: { transactionId: "tx-1", wasMe: false } });
    if (no.ok) expect(no.summary).toMatch(/\$450\.00 charge at Binance.*block it/);
    const yes = validateAction("answer_fraud_alert", { was_me: true }, flagged);
    if (yes.ok) expect(yes.summary).toMatch(/let it go through/);
    expect(validateAction("answer_fraud_alert", {}, flagged).ok).toBe(false);
  });

  it("remember and forget need real text", () => {
    expect(validateAction("remember", { fact: "Sarah is my trusted contact" }, ctx)).toMatchObject({ ok: true });
    expect(validateAction("remember", { fact: "  " }, ctx).ok).toBe(false);
    expect(validateAction("forget", { fact_substring: "Sarah" }, ctx)).toMatchObject({ ok: true, params: { fragment: "Sarah" } });
    expect(validateAction("forget", {}, ctx).ok).toBe(false);
  });
});

describe("planGuard", () => {
  const found = [
    { merchant: "Hulu", amountCents: 799, cycle: "monthly" as const, alreadyGuarded: false },
    { merchant: "Disney Plus", amountCents: 1399, cycle: "monthly" as const, alreadyGuarded: false },
    { merchant: "Netflix", amountCents: 1599, cycle: "monthly" as const, alreadyGuarded: true },
  ];

  it("guards every unguarded find by default", () => {
    const v = planGuard(found, {});
    expect(v).toMatchObject({ ok: true, params: { merchants: ["Hulu", "Disney Plus"] } });
  });
  it("narrows to a named merchant and refuses an unknown one", () => {
    expect(planGuard(found, { merchants: ["hulu"] })).toMatchObject({ ok: true, params: { merchants: ["Hulu"] } });
    expect(planGuard(found, { text: "guard disney" })).toMatchObject({ ok: true, params: { merchants: ["Disney Plus"] } });
    expect(planGuard(found, { merchants: ["Peacock"] }).ok).toBe(false);
  });
  it("says so when there is nothing to guard", () => {
    expect(planGuard([], {}).ok).toBe(false);
    expect(planGuard([found[2]], {}).ok).toBe(false);
  });
});

describe("coerceDollars", () => {
  it("accepts numbers and money-looking strings only", () => {
    expect(coerceDollars(12.5)).toBe(12.5);
    expect(coerceDollars("$1,200")).toBe(1200);
    expect(coerceDollars("fifty dollars")).toBe(50);
    expect(coerceDollars(-1)).toBeNull();
    expect(coerceDollars(NaN)).toBeNull();
    expect(coerceDollars(undefined)).toBeNull();
    expect(coerceDollars("lots")).toBeNull();
  });
});
