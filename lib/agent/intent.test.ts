import { describe, expect, it } from "vitest";
import { combineConfirmation, settleRoute } from "./intent";

const base = { jev: null, llm: null, rules: "question" as const, informational: false };

describe("settleRoute", () => {
  it("trusts Jev when it is confident", () => {
    expect(settleRoute({ ...base, jev: { choice: "pause_card", confidence: 0.9 }, rules: "cancel_subscription" })).toEqual({ intent: "pause_card", source: "jev" });
  });

  it("falls back to the LLM when Jev is missing or under 0.55, then to keyword rules", () => {
    expect(settleRoute({ ...base, jev: { choice: "pause_card", confidence: 0.54 }, llm: "cancel_subscription", rules: "pay_debt" })).toEqual({
      intent: "cancel_subscription",
      source: "llm",
    });
    expect(settleRoute({ ...base, jev: null, llm: "set_budget", rules: "pay_debt" })).toEqual({ intent: "set_budget", source: "llm" });
    expect(settleRoute({ ...base, jev: null, llm: null, rules: "pay_debt" })).toEqual({ intent: "pay_debt", source: "rules" });
    expect(settleRoute({ ...base, jev: { choice: "pause_card", confidence: 0.3 }, llm: null, rules: "resume_card" })).toEqual({
      intent: "resume_card",
      source: "rules",
    });
  });

  it("never turns an information question into an action", () => {
    expect(settleRoute({ ...base, jev: { choice: "cancel_subscription", confidence: 0.99 }, informational: true })).toEqual({ intent: "question", source: "rules" });
    expect(settleRoute({ ...base, llm: "cancel_subscription", informational: true, rules: "cancel_subscription" })).toEqual({ intent: "question", source: "rules" });
  });

  it("still proposes an unmistakable command that a router read as a question", () => {
    expect(settleRoute({ ...base, jev: { choice: "question", confidence: 0.95 }, rules: "cancel_subscription" })).toEqual({
      intent: "cancel_subscription",
      source: "rules",
    });
  });

  it("answers a question when everything agrees it is one", () => {
    expect(settleRoute({ ...base, jev: { choice: "question", confidence: 0.9 } })).toEqual({ intent: "question", source: "jev" });
  });
});

describe("combineConfirmation (regex + Jev noul)", () => {
  it("uses the regex alone when Jev is unavailable", () => {
    expect(combineConfirmation("yeah do it", null)).toBe("yes");
    expect(combineConfirmation("no wait", null)).toBe("no");
    expect(combineConfirmation("hmm let me think", null)).toBe("unclear");
  });

  it("a plain no always wins, whatever Jev says", () => {
    expect(combineConfirmation("no wait", 0.99)).toBe("no");
    expect(combineConfirmation("nope", 0.8)).toBe("no");
  });

  it("a yes needs Jev's agreement when Jev is available", () => {
    expect(combineConfirmation("yeah do it", 0.97)).toBe("yes");
    expect(combineConfirmation("yeah do it", 0.2)).toBe("unclear");
  });

  it("Jev can read a clear agreement the regex missed, but only at high confidence", () => {
    expect(combineConfirmation("I suppose that works for me", 0.95)).toBe("yes");
    expect(combineConfirmation("I suppose that works for me", 0.7)).toBe("unclear");
    expect(combineConfirmation("not exactly what I wanted but fine", 0.97)).not.toBe("yes");
    expect(combineConfirmation("what time is it", 0.05)).toBe("no");
  });

  it("an objection can never become a yes", () => {
    expect(combineConfirmation("yes but don't", 0.99)).toBe("unclear");
  });
});
