import { describe, expect, it } from "vitest";
import { buildHints } from "./hints";
import { matchPreset, stripPreamble } from "./presets";
import { testCtx, testSub } from "./testctx";
import type { ToolName } from "./types";
import { validateAction } from "./validate";

const ctx = testCtx();
const withPending = testCtx({
  subs: [testSub("Netflix", { pendingCharge: { id: "ch-1", amountCents: 1899 } }), testSub("Spotify", { amountCents: 1199, limitCents: 1199 })],
});
const flagged = testCtx({ flagged: { id: "tx-1", merchant: "Binance", amountCents: 45000, riskScore: 82 } });

function tool(text: string, c = ctx) {
  const m = matchPreset(text, c);
  return m?.kind === "tool" ? { tool: m.tool, raw: m.raw } : m;
}

describe("stripPreamble", () => {
  it("removes the polite lead-in and tail", () => {
    expect(stripPreamble("Hey Vera, can you please cancel Netflix for me?")).toBe("cancel netflix");
    expect(stripPreamble("I want you to pause Spotify now")).toBe("pause spotify");
    expect(stripPreamble("yes guard them all")).toBe("guard them all");
  });
});

describe("preset commands: cards", () => {
  it.each([
    ["cancel Netflix", "cancel_subscription", "Netflix"],
    ["Vera, cancel Netflix", "cancel_subscription", "Netflix"],
    ["Hey Vera, can you cancel my Netflix subscription please", "cancel_subscription", "Netflix"],
    ["stop Spotify", "cancel_subscription", "Spotify"],
    ["stop paying for Planet Fitness", "cancel_subscription", "Planet Fitness"],
    ["get rid of Netflix", "cancel_subscription", "Netflix"],
    ["unsubscribe me from Spotify", "cancel_subscription", "Spotify"],
    ["pause Spotify", "pause_card", "Spotify"],
    ["freeze my Netflix card", "pause_card", "Netflix"],
    ["turn off Netflix", "pause_card", "Netflix"],
    ["turn netflix off", "pause_card", "Netflix"],
    ["resume Spotify", "resume_card", "Spotify"],
    ["unpause the Netflix card", "resume_card", "Netflix"],
    ["turn Spotify back on", "resume_card", "Spotify"],
    ["keep Adobe after the trial", "keep_after_trial", "Adobe Creative Cloud"],
    ["keep adobe", "keep_after_trial", "Adobe Creative Cloud"],
  ] as Array<[string, ToolName, string]>)("%j -> %s (%s)", (said, expectedTool, merchant) => {
    expect(tool(said)).toEqual({ tool: expectedTool, raw: { merchant } });
  });

  it("matches a strong verb even when the merchant is unknown, so the validator can say so", () => {
    expect(tool("cancel Hulu")).toEqual({ tool: "cancel_subscription", raw: { merchant: "hulu" } });
    const m = matchPreset("cancel Hulu", ctx);
    expect(m?.kind === "tool" && validateAction(m.tool, m.raw, ctx)).toMatchObject({ ok: false });
  });

  it("does not match a weak verb without a known merchant", () => {
    expect(matchPreset("stop it", ctx)).toBeNull();
    expect(matchPreset("close the window", ctx)).toBeNull();
    expect(matchPreset("turn the volume off", ctx)).toBeNull();
  });
});

describe("preset commands: price changes", () => {
  it("approves a named merchant or the only pending charge", () => {
    expect(tool("approve the new price for Netflix", withPending)).toEqual({ tool: "approve_new_price", raw: { merchant: "Netflix" } });
    expect(tool("approve it", withPending)).toEqual({ tool: "approve_new_price", raw: {} });
    expect(tool("approve the price increase", withPending)).toEqual({ tool: "approve_new_price", raw: {} });
    expect(tool("let it through", withPending)).toEqual({ tool: "approve_new_price", raw: {} });
    expect(tool("raise the limit on Netflix", withPending)).toEqual({ tool: "approve_new_price", raw: { merchant: "Netflix" } });
  });

  it("keeps blocking", () => {
    expect(tool("keep blocking Netflix", withPending)).toEqual({ tool: "keep_blocking", raw: { merchant: "Netflix" } });
    expect(tool("keep blocking it", withPending)).toEqual({ tool: "keep_blocking", raw: {} });
    expect(tool("reject the price increase", withPending)).toEqual({ tool: "keep_blocking", raw: {} });
    expect(tool("don't approve it", withPending)).toEqual({ tool: "keep_blocking", raw: {} });
  });

  it("'approve it' resolves to the single pending charge and writes the read-back", () => {
    const m = matchPreset("approve it", withPending);
    expect(m?.kind).toBe("tool");
    if (m?.kind !== "tool") return;
    const v = validateAction(m.tool, m.raw, withPending);
    expect(v).toMatchObject({ ok: true, params: { chargeId: "ch-1", merchant: "Netflix" } });
    if (v.ok) expect(v.summary).toContain("$18.99");
  });

  it("asks which one when two merchants have a charge waiting", () => {
    const two = testCtx({
      subs: [
        testSub("Netflix", { pendingCharge: { id: "c1", amountCents: 1899 } }),
        testSub("Spotify", { pendingCharge: { id: "c2", amountCents: 1399 } }),
      ],
    });
    const m = matchPreset("approve it", two);
    expect(m?.kind === "tool" && validateAction(m.tool, m.raw, two)).toMatchObject({ ok: false });
  });
});

describe("preset commands: money", () => {
  it("sets a budget", () => {
    expect(tool("set my food budget to $300")).toEqual({ tool: "set_budget", raw: { category: "food", monthly_limit_dollars: 300 } });
    expect(tool("Set my entertainment budget to 80 dollars")).toEqual({ tool: "set_budget", raw: { category: "entertainment", monthly_limit_dollars: 80 } });
    expect(tool("change my groceries budget to $450")).toEqual({ tool: "set_budget", raw: { category: "food", monthly_limit_dollars: 450 } });
  });

  it("never reads a relative change as the new limit", () => {
    expect(tool("raise my food budget by $50")).toEqual({ tool: "set_budget", raw: { category: "food" } });
  });

  it("adds to a goal", () => {
    expect(tool("put $50 in my laptop fund")).toEqual({ tool: "add_to_goal", raw: { goal_name: "New Laptop Fund", dollars: 50 } });
    expect(tool("add $200 to my emergency fund")).toEqual({ tool: "add_to_goal", raw: { goal_name: "Emergency Fund", dollars: 200 } });
    expect(tool("save fifty dollars for my trip")).toEqual({ tool: "add_to_goal", raw: { goal_name: "Spring Break Trip", dollars: 50 } });
  });

  it("does not treat 'save' without a goal as a goal action", () => {
    expect(matchPreset("save money on groceries", ctx)).toBeNull();
    expect(matchPreset("add a card for hulu", ctx)).toBeNull();
  });

  it("pays a debt by name or kind", () => {
    expect(tool("pay $100 toward my Discover card")).toEqual({ tool: "pay_debt", raw: { debt_name: "Discover it Student", dollars: 100 } });
    expect(tool("pay $100 on my credit card")).toEqual({ tool: "pay_debt", raw: { debt_name: "Discover it Student", dollars: 100 } });
    expect(tool("make a payment of $250 on my student loan")).toEqual({ tool: "pay_debt", raw: { debt_name: "Federal Student Loan", dollars: 250 } });
  });

  it("leaves the amount out when none was said, so the validator asks", () => {
    expect(tool("pay off my credit card")).toEqual({ tool: "pay_debt", raw: { debt_name: "Discover it Student" } });
    const m = matchPreset("pay off my credit card", ctx);
    const v = m?.kind === "tool" ? validateAction(m.tool, m.raw, ctx) : null;
    expect(v).toMatchObject({ ok: false });
  });
});

describe("preset commands: fraud, discovery, memory", () => {
  it("answers the fraud alert", () => {
    expect(tool("yes that was me", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: true } });
    expect(tool("that was me", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: true } });
    expect(tool("no that wasn't me", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: false } });
    expect(tool("that wasn't me", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: false } });
    expect(tool("this is fraud", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: false } });
    expect(tool("I didn't make that purchase", flagged)).toEqual({ tool: "answer_fraud_alert", raw: { was_me: false } });
  });

  it("asks rather than guesses when the answer contradicts itself", () => {
    expect(tool("no that was me", flagged)).toEqual({ tool: "answer_fraud_alert", raw: {} });
  });

  it("finds and guards subscriptions", () => {
    expect(tool("find my subscriptions")).toEqual({ tool: "find_subscriptions", raw: {} });
    expect(tool("Vera, scan my transactions for subscriptions")).toEqual({ tool: "find_subscriptions", raw: {} });
    expect(tool("guard them all")).toEqual({ tool: "guard_subscriptions", raw: {} });
    expect(tool("yes, guard them")).toEqual({ tool: "guard_subscriptions", raw: {} });
    expect(tool("guard Hulu")).toEqual({ tool: "guard_subscriptions", raw: { merchants: ["hulu"] } });
  });

  it("remembers and forgets with the user's own wording", () => {
    expect(tool("Vera, remember that Sarah is my trusted contact.")).toEqual({ tool: "remember", raw: { fact: "Sarah is my trusted contact" } });
    expect(tool("remember my daughter Sarah can call about my account")).toEqual({
      tool: "remember",
      raw: { fact: "my daughter Sarah can call about my account" },
    });
    expect(tool("forget about Sarah")).toEqual({ tool: "forget", raw: { fact_substring: "Sarah" } });
    expect(tool("please forget that I like Netflix")).toEqual({ tool: "forget", raw: { fact_substring: "I like Netflix" } });
  });

  it("treats 'remember that I want to cancel Netflix' as a memory, not a cancellation", () => {
    expect(tool("remember that I want to cancel Netflix")).toEqual({ tool: "remember", raw: { fact: "I want to cancel Netflix" } });
  });

  it("does not treat 'forget it' as a request to delete a memory", () => {
    expect(matchPreset("forget it", ctx)).toBeNull();
    expect(matchPreset("never mind, forget that", ctx)).toBeNull();
  });

  it("recalls what it remembers", () => {
    for (const s of ["what do you remember", "What do you remember about me?", "what have I told you", "what do you know about me", "show me what you remember"]) {
      expect(matchPreset(s, ctx)).toMatchObject({ kind: "recall" });
    }
  });
});

describe("conversation is not an action", () => {
  it.each([
    "How do I cancel Netflix?",
    "Can I cancel Netflix?",
    "What's my Netflix bill?",
    "Where am I overspending?",
    "Can I afford a $300 trip this month?",
    "How fast can I pay off my credit card?",
    "Which subscription should I cancel?",
    "Is Spotify worth it?",
    "Tell me a joke",
    "I'm worried about money",
    "hello",
    "thanks Vera",
    "What is a credit score?",
    "do you remember my name",
    "I keep going over budget on food",
  ])("%j matches no preset", (said) => {
    expect(matchPreset(said, ctx)).toBeNull();
  });
});

describe("Try saying hints", () => {
  it("builds hints from the workspace's real names", () => {
    const hints = buildHints(ctx);
    expect(hints).toContain("Cancel Netflix");
    expect(hints).toContain("Pause Spotify");
    expect(hints.some((h) => /^Set my food budget to \$\d+$/.test(h))).toBe(true);
    expect(hints.some((h) => h.startsWith("Put $50 in my "))).toBe(true);
    expect(hints.length).toBeLessThanOrEqual(6);
  });

  it("skips what doesn't apply and uses what does", () => {
    const hints = buildHints(testCtx({ subs: [], goals: [], debts: [], budgets: [], memories: ["Sarah is my trusted contact"] }));
    expect(hints).toEqual(["Find my subscriptions", "What do you remember?"]);
    expect(buildHints(withPending, 10)).toContain("Approve the new Netflix price");
    expect(buildHints(flagged, 10)).toContain("No, that wasn't me");
  });

  it("only suggests phrases the preset matcher understands, and they resolve", () => {
    const rich = testCtx({
      subs: withPending.subs,
      flagged: { id: "tx-1", merchant: "Binance", amountCents: 45000, riskScore: 82 },
      memories: ["Sarah is my trusted contact"],
    });
    for (const hint of buildHints(rich, 20)) {
      const m = matchPreset(hint, rich);
      expect(m, hint).not.toBeNull();
      if (m?.kind === "tool" && m.tool !== "find_subscriptions" && m.tool !== "guard_subscriptions") {
        expect(validateAction(m.tool, m.raw, rich), hint).toMatchObject({ ok: true });
      }
    }
  });
});
