import { describe, expect, it } from "vitest";
import {
  extractDollars,
  extractParamsDeterministic,
  extractTrialDays,
  findCategoryInText,
  findDebtInText,
  findNameInText,
  hasActionCue,
  hasConfirmationWords,
  isInformationQuestion,
  keywordIntent,
  parseConfirmation,
  wordsToNumber,
} from "./text";
import type { AgentContext } from "./types";

const sub = (merchant: string, extra: Partial<AgentContext["subs"][number]> = {}): AgentContext["subs"][number] => ({
  id: `id-${merchant}`,
  merchant,
  category: "Streaming",
  amountCents: 1599,
  cycle: "monthly",
  kind: "paid",
  status: "active",
  cardStatus: "active",
  cardLast4: "4242",
  limitCents: 1599,
  pendingCharge: null,
  ...extra,
});

const ctx: Pick<AgentContext, "subs" | "goals" | "debts" | "categories" | "flagged" | "budgets"> = {
  subs: [
    sub("Netflix"),
    sub("Spotify", { amountCents: 1199, limitCents: 1199 }),
    sub("Planet Fitness", { amountCents: 2499, limitCents: 2499 }),
    sub("Adobe Creative Cloud", { kind: "trial", status: "trial" }),
  ],
  goals: [
    { id: "g1", name: "Emergency Fund", targetCents: 300000, savedCents: 150000 },
    { id: "g2", name: "Spring Break Trip", targetCents: 80000, savedCents: 34000 },
    { id: "g3", name: "New Laptop Fund", targetCents: 120000, savedCents: 45000 },
  ],
  debts: [
    { id: "d1", name: "Discover it Student", kind: "credit_card", balanceCents: 68000 },
    { id: "d2", name: "Federal Student Loan", kind: "student_loan", balanceCents: 1240000 },
  ],
  categories: ["housing", "food", "transport", "entertainment", "shopping", "utilities", "subscriptions"],
  budgets: [],
  flagged: { id: "t1", merchant: "Binance", amountCents: 45000, riskScore: 82 },
};

describe("parseConfirmation", () => {
  it.each([
    ["yes", "yes"],
    ["Yeah, do it", "yes"],
    ["yep go ahead", "yes"],
    ["Sure.", "yes"],
    ["okay", "yes"],
    ["yes please", "yes"],
    ["yes, no problem", "yes"],
    ["that's right, go ahead", "yes"],
    ["no", "no"],
    ["No wait", "no"],
    ["nope", "no"],
    ["don't do that", "no"],
    ["stop", "no"],
    ["hold on", "no"],
    ["never mind", "no"],
    ["not now", "no"],
  ])("reads %j as %s", (said, expected) => {
    expect(parseConfirmation(said)).toBe(expected);
  });

  it("never treats a sentence that both agrees and objects as a yes", () => {
    expect(parseConfirmation("yes, no wait")).toBe("unclear");
    expect(parseConfirmation("yeah actually don't")).toBe("unclear");
  });

  it("treats unsure or off-topic replies as unclear", () => {
    expect(parseConfirmation("I'm not sure")).toBe("unclear");
    expect(parseConfirmation("maybe")).toBe("unclear");
    expect(parseConfirmation("hmm")).toBe("unclear");
    expect(parseConfirmation("what is the weather")).toBe("unclear");
    expect(parseConfirmation("")).toBe("unclear");
  });

  it("does not accept a long rambling sentence as a yes", () => {
    expect(parseConfirmation("yes and while you're at it please also pause my spotify card for next month")).toBe("unclear");
  });

  it("spots whether any yes/no word is present", () => {
    expect(hasConfirmationWords("pause spotify instead")).toBe(false);
    expect(hasConfirmationWords("no thanks")).toBe(true);
  });
});

describe("extractDollars", () => {
  it.each([
    ["set it to $50", 50],
    ["add $1,250.50 to it", 1250.5],
    ["12.99 dollars", 12.99],
    ["fifty bucks", 50],
    ["twenty five dollars", 25],
    ["two hundred fifty dollars", 250],
    ["a hundred dollars", 100],
    ["one thousand five hundred dollars", 1500],
    ["25 USD", 25],
  ])("reads %j as %d", (said, expected) => {
    expect(extractDollars(said)).toBe(expected);
  });

  it("only reads a bare number when asked to", () => {
    expect(extractDollars("set food to 500")).toBeNull();
    expect(extractDollars("set food to 500", { allowBare: true })).toBe(500);
  });

  it("does not mistake days, months or card digits for dollars", () => {
    expect(extractDollars("a 7 day trial", { allowBare: true })).toBeNull();
    expect(extractDollars("card ending in 4829", { allowBare: true })).toBeNull();
    expect(extractDollars("for 3 months", { allowBare: true })).toBeNull();
  });

  it("rejects zero, negatives and nonsense", () => {
    expect(extractDollars("$0")).toBeNull();
    expect(extractDollars("nothing at all", { allowBare: true })).toBeNull();
  });

  it("converts number words", () => {
    expect(wordsToNumber(["twelve"])).toBe(12);
    expect(wordsToNumber(["two", "hundred", "and", "five"])).toBe(205);
    expect(wordsToNumber(["banana"])).toBeNull();
  });

  it("reads trial lengths", () => {
    expect(extractTrialDays("with a 7 day free trial")).toBe(7);
    expect(extractTrialDays("a 14-day trial")).toBe(14);
    expect(extractTrialDays("seven day trial")).toBe(7);
    expect(extractTrialDays("two week free trial")).toBe(14);
    expect(extractTrialDays("no trial mentioned")).toBeNull();
  });
});

describe("findNameInText (merchant fuzzy match)", () => {
  const names = ctx.subs.map((s) => s.merchant);
  it("finds an exact name inside a sentence", () => {
    expect(findNameInText("please cancel netflix for me", names).match).toBe("Netflix");
  });
  it("finds a name from one distinctive word", () => {
    expect(findNameInText("pause adobe", names).match).toBe("Adobe Creative Cloud");
    expect(findNameInText("cancel the planet one", names).match).toBe("Planet Fitness");
  });
  it("tolerates a near-miss spelling", () => {
    expect(findNameInText("cancel netflx", names).match).toBe("Netflix");
    expect(findNameInText("pause spotfy", names).match).toBe("Spotify");
  });
  it("reports a tie instead of guessing", () => {
    const r = findNameInText("cancel netflix and spotify", names);
    expect(r.match).toBeNull();
    expect(r.ambiguous.sort()).toEqual(["Netflix", "Spotify"]);
  });
  it("returns nothing for an unknown name", () => {
    expect(findNameInText("cancel hulu", names)).toEqual({ match: null, ambiguous: [] });
    expect(findNameInText("", names).match).toBeNull();
  });
  it("does not match on generic words alone", () => {
    expect(findNameInText("add to my fund", ctx.goals.map((g) => g.name)).match).toBeNull();
  });
});

describe("categories and debts", () => {
  it("maps everyday words to a budget category", () => {
    expect(findCategoryInText("my food budget", ctx.categories)).toBe("food");
    expect(findCategoryInText("groceries", ctx.categories)).toBe("food");
    expect(findCategoryInText("gas", ctx.categories)).toBe("transport");
    expect(findCategoryInText("rent", ctx.categories)).toBe("housing");
    expect(findCategoryInText("pottery", ctx.categories)).toBeNull();
  });
  it("finds a debt by name or by kind", () => {
    expect(findDebtInText("my discover card", ctx.debts)).toBe("Discover it Student");
    expect(findDebtInText("the credit card", ctx.debts)).toBe("Discover it Student");
    expect(findDebtInText("my student loan", ctx.debts)).toBe("Federal Student Loan");
    expect(findDebtInText("the mortgage", ctx.debts)).toBeNull();
  });
});

describe("keywordIntent (fallback routing)", () => {
  it.each([
    ["cancel Netflix", "cancel_subscription"],
    ["Vera, cancel Netflix", "cancel_subscription"],
    ["Hey Vera please cancel my Netflix subscription", "cancel_subscription"],
    ["stop paying for Spotify", "cancel_subscription"],
    ["get rid of Planet Fitness", "cancel_subscription"],
    ["unsubscribe me", "cancel_subscription"],
    ["can you cancel Netflix", "cancel_subscription"],
    ["pause Spotify", "pause_card"],
    ["freeze my Netflix card", "pause_card"],
    ["resume Spotify", "resume_card"],
    ["turn Spotify back on", "resume_card"],
    ["create a card for Hulu with a $12 limit", "create_card"],
    ["get me a new card for Disney Plus", "create_card"],
    ["approve the new Netflix price", "approve_new_price"],
    ["let it through", "approve_new_price"],
    ["keep blocking Netflix", "keep_blocking"],
    ["reject the price increase", "keep_blocking"],
    ["keep Adobe after the trial", "keep_after_trial"],
    ["I want to keep Adobe", "keep_after_trial"],
    ["set my food budget to $500", "set_budget"],
    ["raise the entertainment budget to 100 dollars", "set_budget"],
    ["add $200 to my emergency fund", "add_to_goal"],
    ["put fifty dollars toward the trip", "add_to_goal"],
    ["pay $100 on my credit card", "pay_debt"],
    ["make a payment on my student loan", "pay_debt"],
    ["that was me", "answer_fraud_alert"],
    ["that wasn't me", "answer_fraud_alert"],
    ["this is fraud", "answer_fraud_alert"],
    ["find my subscriptions", "find_subscriptions"],
    ["scan my transactions for subscriptions", "find_subscriptions"],
    ["guard them", "guard_subscriptions"],
    ["remember that Sarah is my trusted contact", "remember"],
    ["forget about Sarah", "forget"],
  ])("routes %j to %s", (said, expected) => {
    expect(keywordIntent(said, ctx)).toBe(expected);
  });

  it.each([
    "How much do I spend on Netflix?",
    "What subscriptions do I have?",
    "Can I afford a $300 trip?",
    "How do I cancel Netflix?",
    "Where am I overspending?",
    "Is Spotify worth it?",
    "Why was my card declined?",
    "How fast can I pay off my credit card?",
    "hello there",
    "",
  ])("leaves %j as a question", (said) => {
    expect(keywordIntent(said, ctx)).toBe("question");
  });

  it("reads 'can you ...' as a request but 'can I ...' as a question", () => {
    expect(isInformationQuestion("can you pause Spotify")).toBe(false);
    expect(isInformationQuestion("could you please cancel Netflix")).toBe(false);
    expect(isInformationQuestion("can I cancel Netflix")).toBe(true);
    expect(isInformationQuestion("Vera, what is my balance")).toBe(true);
  });

  it("knows whether a sentence has any action verb", () => {
    expect(hasActionCue("cancel Netflix")).toBe(true);
    expect(hasActionCue("set my food limit to 500")).toBe(true);
    expect(hasActionCue("my Netflix is expensive")).toBe(false);
    expect(hasActionCue("good morning")).toBe(false);
  });
});

describe("extractParamsDeterministic", () => {
  it("finds the merchant for card actions", () => {
    expect(extractParamsDeterministic("cancel_subscription", "Vera, cancel Netflix", ctx)).toEqual({ merchant: "Netflix" });
    expect(extractParamsDeterministic("pause_card", "pause the planet one", ctx)).toEqual({ merchant: "Planet Fitness" });
    expect(extractParamsDeterministic("cancel_subscription", "cancel hulu", ctx)).toEqual({});
  });

  it("extracts a new card's merchant, limit and trial", () => {
    expect(extractParamsDeterministic("create_card", "create a card for Hulu with a $12 limit", ctx)).toEqual({
      merchant: "Hulu",
      monthly_limit_dollars: 12,
    });
    expect(extractParamsDeterministic("create_card", "make a card for disney plus with a 7 day free trial and a 10 dollar limit", ctx)).toEqual({
      merchant: "Disney Plus",
      monthly_limit_dollars: 10,
      trial_days: 7,
    });
    expect(extractParamsDeterministic("create_card", "get me a card for hulu please", ctx)).toMatchObject({ merchant: "Hulu" });
  });

  it("extracts budget, goal and debt amounts", () => {
    expect(extractParamsDeterministic("set_budget", "set my groceries budget to $450", ctx)).toEqual({ category: "food", monthly_limit_dollars: 450 });
    expect(extractParamsDeterministic("add_to_goal", "add $200 to my emergency fund", ctx)).toEqual({ goal_name: "Emergency Fund", dollars: 200 });
    expect(extractParamsDeterministic("pay_debt", "pay $100 on my credit card", ctx)).toEqual({ debt_name: "Discover it Student", dollars: 100 });
  });

  it("reads the fraud answer", () => {
    expect(extractParamsDeterministic("answer_fraud_alert", "that wasn't me", ctx)).toEqual({ was_me: false });
    expect(extractParamsDeterministic("answer_fraud_alert", "yes that was me", ctx)).toEqual({ was_me: true });
  });

  it("pulls out what to remember and what to forget", () => {
    expect(extractParamsDeterministic("remember", "Vera, remember that Sarah is my trusted contact", ctx)).toEqual({ fact: "Sarah is my trusted contact" });
    expect(extractParamsDeterministic("forget", "forget about Sarah", ctx)).toEqual({ fact_substring: "Sarah" });
  });
});
