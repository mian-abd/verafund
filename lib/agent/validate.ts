// Validates a proposed action against the user's real workspace data and writes the
// plain-English read-back they will be asked to confirm. Pure: the caller loads the
// AgentContext. The AI only proposes; nothing here (or anywhere upstream) executes anything.

import { formatCents } from "../format";
import { extractDollars, findCategoryInText, findNameInText, norm, titleCase } from "./text";
import type { AgentContext, CtxSub, RawParams, ToolName, Validation } from "./types";

const MAX_CARD_LIMIT_CENTS = 1_000_000; // $10,000: Stripe's per-authorization cap
const MAX_BUDGET_CENTS = 100_000_00; // $100,000 a month is far beyond any real budget
const MAX_MONEY_CENTS = 1_000_000_000; // $10M, same ceiling as the goals page

export function orList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function cardList(ctx: AgentContext): string {
  const names = ctx.subs.filter((s) => s.status !== "cancelled").map((s) => s.merchant);
  return names.length ? names.slice(0, 8).join(", ") : "none yet";
}

const clarify = (text: string): Validation => ({ ok: false, clarify: text });

function perCycle(sub: Pick<CtxSub, "amountCents" | "cycle">): string {
  return `${formatCents(sub.amountCents)} a ${sub.cycle === "monthly" ? "month" : "year"}`;
}

// Numbers can arrive as 12, "12", "$12.50" or "12 dollars" (from an LLM or a regex).
export function coerceDollars(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v === "string") return extractDollars(v, { allowBare: true });
  return null;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

type SubResult = { sub: CtxSub } | { clarify: string };

// Finds the subscription card the user means. `pool` is who to default to when no merchant was
// named and exactly one card could be meant (e.g. the only one with a price change waiting).
function resolveSub(ctx: AgentContext, raw: unknown, pool: CtxSub[] = []): SubResult {
  const asked = typeof raw === "string" ? raw.trim() : "";
  const live = ctx.subs.filter((s) => s.status !== "cancelled");
  if (!asked) {
    if (pool.length === 1) return { sub: pool[0] };
    if (pool.length > 1) return { clarify: `Which one do you mean: ${orList(pool.map((s) => s.merchant))}?` };
    if (live.length === 0) return { clarify: "You don't have any active subscription cards yet." };
    return { clarify: `Which subscription do you mean? Your cards are ${cardList(ctx)}.` };
  }
  const hit = findNameInText(asked, live.map((s) => s.merchant));
  if (hit.match) return { sub: live.find((s) => s.merchant === hit.match)! };
  if (hit.ambiguous.length > 1) return { clarify: `Did you mean ${orList(hit.ambiguous)}?` };
  const closed = findNameInText(asked, ctx.subs.filter((s) => s.status === "cancelled").map((s) => s.merchant));
  if (closed.match) return { clarify: `The ${closed.match} card is already closed, so there's nothing more to do there.` };
  return { clarify: `I couldn't find a subscription called "${titleCase(asked.slice(0, 40))}". Your cards are ${cardList(ctx)}. Which one did you mean?` };
}

function merchantParam(raw: RawParams): unknown {
  return raw.merchant ?? raw.subscription ?? raw.name;
}

export function validateAction(tool: ToolName, raw: RawParams, ctx: AgentContext): Validation {
  switch (tool) {
    case "cancel_subscription": {
      const r = resolveSub(ctx, merchantParam(raw));
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant },
        summary: `${s.merchant} is ${perCycle(s)}. I'll close its card so they can't charge you again and draft a cancellation message. Should I go ahead?`,
      };
    }

    case "pause_card": {
      const r = resolveSub(ctx, merchantParam(raw));
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      if (s.cardStatus === "inactive") return clarify(`The ${s.merchant} card is already paused.`);
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant },
        summary: `I'll pause the ${s.merchant} card ending ${s.cardLast4}, so nothing can be charged to it until you turn it back on. Should I go ahead?`,
      };
    }

    case "resume_card": {
      const r = resolveSub(ctx, merchantParam(raw));
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      if (s.status === "trial_ended") {
        return clarify(`The ${s.merchant} free trial has ended, so its card is locked. If you want to keep it, say "keep ${s.merchant}".`);
      }
      if (s.cardStatus === "active") return clarify(`The ${s.merchant} card is already on.`);
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant },
        summary: `I'll turn the ${s.merchant} card ending ${s.cardLast4} back on, so it can be charged again up to ${formatCents(s.limitCents)} at a time. Should I go ahead?`,
      };
    }

    case "create_card": {
      const merchant = typeof raw.merchant === "string" ? titleCase(raw.merchant.trim().replace(/\s+/g, " ")) : "";
      if (!merchant) return clarify("Which company is the new card for?");
      if (merchant.length < 2 || merchant.length > 40 || !/[a-z]/i.test(merchant)) {
        return clarify("That company name doesn't look right. What should I call the card?");
      }
      const existing = ctx.subs.find((s) => s.status !== "cancelled" && norm(s.merchant) === norm(merchant));
      if (existing) return clarify(`You already have a ${existing.merchant} card. Do you want to pause it or change something about it instead?`);
      const dollars = coerceDollars(raw.monthly_limit_dollars);
      if (dollars === null) return clarify(`How much should the ${merchant} card be allowed to charge each month?`);
      const cents = dollarsToCents(dollars);
      if (cents < 100 || cents > MAX_CARD_LIMIT_CENTS) return clarify("The card limit has to be between $1 and $10,000.");
      let trialDays: number | null = null;
      if (raw.trial_days !== undefined && raw.trial_days !== null && raw.trial_days !== "") {
        const n = Number(raw.trial_days);
        if (!Number.isInteger(n) || n < 1 || n > 90) return clarify("A free trial can be 1 to 90 days. How long is it?");
        trialDays = n;
      }
      return {
        ok: true,
        params: { merchant, amountCents: cents, trialDays },
        summary: `I'll create a new guarded card for ${merchant} that can't be charged more than ${formatCents(cents)} at a time${
          trialDays ? `, with a ${trialDays}-day free trial that locks the card when it ends` : ""
        }. Should I go ahead?`,
      };
    }

    case "approve_new_price": {
      const r = resolveSub(ctx, merchantParam(raw), ctx.subs.filter((s) => s.pendingCharge));
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      if (!s.pendingCharge) return clarify(`${s.merchant} doesn't have a price-change charge waiting for your answer.`);
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant, chargeId: s.pendingCharge.id },
        summary: `${s.merchant} tried to charge ${formatCents(s.pendingCharge.amountCents)}, which is above your ${formatCents(s.limitCents)} limit. I'll raise the limit to ${formatCents(s.pendingCharge.amountCents)} so it can go through. Should I go ahead?`,
      };
    }

    case "keep_blocking": {
      const r = resolveSub(ctx, merchantParam(raw), ctx.subs.filter((s) => s.pendingCharge));
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      if (!s.pendingCharge) return clarify(`${s.merchant} doesn't have a price-change charge waiting for your answer.`);
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant, chargeId: s.pendingCharge.id },
        summary: `${s.merchant} tried to charge ${formatCents(s.pendingCharge.amountCents)}, above your ${formatCents(s.limitCents)} limit. I'll keep blocking it and leave your limit where it is. Should I go ahead?`,
      };
    }

    case "keep_after_trial": {
      const trials = ctx.subs.filter((s) => s.kind === "trial" && s.status !== "cancelled");
      const r = resolveSub(ctx, merchantParam(raw), trials);
      if ("clarify" in r) return clarify(r.clarify);
      const s = r.sub;
      if (s.kind !== "trial") return clarify(`${s.merchant} isn't a free trial, so there's nothing to keep.`);
      return {
        ok: true,
        params: { subscriptionId: s.id, merchant: s.merchant },
        summary: `${s.merchant}'s free trial ${s.status === "trial_ended" ? "has ended and its card is locked" : "is still running"}. I'll turn it into a paid subscription at ${perCycle(s)} and keep the card on. Should I go ahead?`,
      };
    }

    case "set_budget": {
      const categoryRaw = typeof raw.category === "string" ? raw.category : "";
      if (!categoryRaw.trim()) return clarify(`Which budget should I change? You have ${orList(ctx.categories.slice(0, 8))}.`);
      const category = findCategoryInText(categoryRaw, ctx.categories);
      if (!category) {
        return clarify(`I couldn't find a "${categoryRaw.slice(0, 30)}" category. You have ${orList(ctx.categories.slice(0, 8))}. Which one did you mean?`);
      }
      const dollars = coerceDollars(raw.monthly_limit_dollars);
      if (dollars === null) return clarify(`What monthly limit do you want for ${category}?`);
      const cents = dollarsToCents(dollars);
      if (cents < 100 || cents > MAX_BUDGET_CENTS) return clarify("A budget has to be between $1 and $100,000 a month.");
      const current = ctx.budgets.find((b) => b.category === category);
      return {
        ok: true,
        params: { category, limitCents: cents, budgetId: current?.id ?? null },
        summary: `I'll set your ${category} budget to ${formatCents(cents)} a month${
          current ? ` (it's ${formatCents(current.limitCents)} now)` : ", since you don't have one for it yet"
        }. Should I go ahead?`,
      };
    }

    case "add_to_goal": {
      const nameRaw = typeof raw.goal_name === "string" ? raw.goal_name.trim() : "";
      if (ctx.goals.length === 0) return clarify("You don't have any savings goals yet. Add one on the Goals page first.");
      if (!nameRaw) {
        if (ctx.goals.length === 1) raw = { ...raw, goal_name: ctx.goals[0].name };
        else return clarify(`Which goal is it for? You have ${orList(ctx.goals.map((g) => g.name))}.`);
      }
      const hit = findNameInText(String(raw.goal_name), ctx.goals.map((g) => g.name));
      if (hit.ambiguous.length > 1) return clarify(`Did you mean ${orList(hit.ambiguous)}?`);
      const goal = ctx.goals.find((g) => g.name === hit.match);
      if (!goal) return clarify(`I couldn't find a goal called "${String(raw.goal_name).slice(0, 40)}". You have ${orList(ctx.goals.map((g) => g.name))}.`);
      const dollars = coerceDollars(raw.dollars);
      if (dollars === null) return clarify(`How much should I add to ${goal.name}?`);
      const cents = dollarsToCents(dollars);
      if (cents < 1 || cents > MAX_MONEY_CENTS) return clarify("That amount doesn't look right. Tell me a dollar amount.");
      const remaining = Math.max(0, goal.targetCents - goal.savedCents);
      if (remaining === 0) return clarify(`${goal.name} is already fully funded.`);
      if (cents > remaining) return clarify(`That's more than ${goal.name} needs. You can add up to ${formatCents(remaining)}.`);
      return {
        ok: true,
        params: { goalId: goal.id, goalName: goal.name, cents },
        summary: `I'll record ${formatCents(cents)} going into your ${goal.name} goal, taking it from ${formatCents(goal.savedCents)} to ${formatCents(goal.savedCents + cents)} of ${formatCents(goal.targetCents)}. This updates your goal in VeraFund. Should I go ahead?`,
      };
    }

    case "pay_debt": {
      const live = ctx.debts.filter((d) => d.balanceCents > 0);
      const nameRaw = typeof raw.debt_name === "string" ? raw.debt_name.trim() : "";
      if (ctx.debts.length === 0) return clarify("You don't have any debts on record.");
      if (live.length === 0) return clarify("All of your debts are already paid off.");
      let debtName = nameRaw;
      if (!debtName) {
        if (live.length === 1) debtName = live[0].name;
        else return clarify(`Which debt do you mean? You have ${orList(live.map((d) => d.name))}.`);
      }
      const hit = findNameInText(debtName, ctx.debts.map((d) => d.name));
      if (hit.ambiguous.length > 1) return clarify(`Did you mean ${orList(hit.ambiguous)}?`);
      const debt = ctx.debts.find((d) => d.name === hit.match);
      if (!debt) return clarify(`I couldn't find a debt called "${debtName.slice(0, 40)}". You have ${orList(ctx.debts.map((d) => d.name))}.`);
      if (debt.balanceCents === 0) return clarify(`${debt.name} is already paid off.`);
      const dollars = coerceDollars(raw.dollars);
      if (dollars === null) return clarify(`How much should I record as a payment on ${debt.name}?`);
      const cents = dollarsToCents(dollars);
      if (cents < 1 || cents > MAX_MONEY_CENTS) return clarify("That amount doesn't look right. Tell me a dollar amount.");
      if (cents > debt.balanceCents) return clarify(`That's more than you owe. The balance on ${debt.name} is ${formatCents(debt.balanceCents)}.`);
      return {
        ok: true,
        params: { debtId: debt.id, debtName: debt.name, cents },
        summary: `I'll record a ${formatCents(cents)} payment on ${debt.name}, taking the balance from ${formatCents(debt.balanceCents)} to ${formatCents(debt.balanceCents - cents)}. This updates your balance in VeraFund; I don't move money from your bank. Should I go ahead?`,
      };
    }

    case "answer_fraud_alert": {
      const f = ctx.flagged;
      if (!f) return clarify("There isn't a flagged charge waiting for your answer right now.");
      const wasMe = raw.was_me;
      const flag = `The ${formatCents(f.amountCents)} charge at ${f.merchant} was flagged as suspicious.`;
      if (wasMe === true || wasMe === "true") {
        return {
          ok: true,
          params: { transactionId: f.id, merchant: f.merchant, wasMe: true },
          summary: `${flag} You're telling me it was you, so I'll let it go through. Should I go ahead?`,
        };
      }
      if (wasMe === false || wasMe === "false") {
        return {
          ok: true,
          params: { transactionId: f.id, merchant: f.merchant, wasMe: false },
          summary: `${flag} You're telling me it wasn't you, so I'll block it and no money will move. Should I go ahead?`,
        };
      }
      return clarify(`${flag} Was that you?`);
    }

    case "remember": {
      const fact = typeof raw.fact === "string" ? raw.fact.replace(/\s+/g, " ").trim() : "";
      if (fact.length < 3) return clarify("What would you like me to remember?");
      return { ok: true, params: { fact: fact.slice(0, 200) }, summary: `I'll remember: ${fact.slice(0, 200)}` };
    }

    case "forget": {
      const frag = typeof raw.fact_substring === "string" ? raw.fact_substring.replace(/\s+/g, " ").trim() : "";
      if (frag.length < 2) return clarify("What should I forget?");
      return { ok: true, params: { fragment: frag.slice(0, 120) }, summary: `I'll forget what I know about: ${frag.slice(0, 120)}` };
    }

    case "find_subscriptions":
      return { ok: true, params: {}, summary: "I'll look through your transactions for recurring charges." };

    case "guard_subscriptions":
      // Needs the discovered list, which is async: see planGuard.
      return clarify("Let me look for subscriptions first.");
  }
}

// guard_subscriptions needs what discovery found. `asked` is the user's sentence or the
// merchants the LLM extracted; with no merchant named, every unguarded find is included.
export function planGuard(
  discovered: Array<{ merchant: string; amountCents: number; cycle: "monthly" | "yearly"; alreadyGuarded: boolean }>,
  asked: { text?: string; merchants?: unknown },
): Validation {
  const open = discovered.filter((d) => !d.alreadyGuarded);
  if (discovered.length === 0) return clarify("I didn't find any recurring charges to guard.");
  if (open.length === 0) return clarify("Everything I found is already guarded by a card.");

  let chosen = open;
  const named = Array.isArray(asked.merchants) ? asked.merchants.filter((m): m is string => typeof m === "string" && m.trim() !== "") : [];
  const picks = new Set<string>();
  for (const m of named) {
    const hit = findNameInText(m, open.map((d) => d.merchant));
    if (hit.match) picks.add(hit.match);
  }
  if (named.length > 0 && picks.size === 0) {
    // A merchant that is named but isn't one of the open finds must not silently become "all of them".
    return clarify(`I didn't find ${orList(named.slice(0, 3))} among the unguarded subscriptions I found: ${orList(open.slice(0, 6).map((d) => d.merchant))}.`);
  }
  if (picks.size === 0 && asked.text) {
    for (const d of open) {
      if (findNameInText(asked.text, [d.merchant]).match) picks.add(d.merchant);
    }
  }
  if (picks.size > 0) chosen = open.filter((d) => picks.has(d.merchant));
  chosen = chosen.slice(0, 10);

  const list = chosen.map((d) => `${d.merchant} (${perCycle(d)})`).join(", ");
  return {
    ok: true,
    params: { merchants: chosen.map((d) => d.merchant) },
    summary: `I found ${chosen.length} subscription${chosen.length === 1 ? "" : "s"} without a guarded card: ${list}. I'll create a guarded card for ${
      chosen.length === 1 ? "it" : "each"
    }, limited to its current price. Should I go ahead?`,
  };
}
