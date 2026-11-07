// Runs a confirmed action. Called only from confirmAction, after the user said yes to that exact
// action id. Each executor re-reads live data (state may have changed since the proposal), calls
// the existing guard service or a workspace-scoped agent service, and writes a notification.
// Money-affecting card actions also leave policy events: the guard functions write those.

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { profiles, subscriptions, type Subscription } from "../db/schema";
import { guardDiscovered } from "../discovery";
import { formatCents } from "../format";
import {
  addSubscription,
  approveNewPrice,
  GuardError,
  keepAfterTrial,
  keepBlocking,
  markCancelled,
  setCardPaused,
} from "../guard";
import { addToGoal, answerFlaggedCharge, payDebt, setBudgetLimit } from "./services";
import { insertNotification } from "./store";
import { norm, titleCase } from "./text";
import { isToolName, needsConfirmation, type ActionResult } from "./types";

export type Via = "voice" | "tap";

const KIND = "vera_action";

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || !v) throw new GuardError("That request was incomplete. Ask me again.");
  return v;
}

function int(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new GuardError("That request was incomplete. Ask me again.");
  return v;
}

async function subscriptionRow(workspaceId: string, id: string): Promise<Subscription> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.workspaceId, workspaceId)));
  if (!row) throw new GuardError("That subscription doesn't exist in your workspace.");
  return row;
}

function confirmedWhere(via: Via): string {
  return via === "voice" ? "by voice" : "in the app";
}

function categoryFor(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/netflix|hulu|disney|hbo|max\b|peacock|paramount|youtube|prime video|crunchyroll/.test(m)) return "Streaming";
  if (/spotify|apple music|pandora|tidal|deezer|audible/.test(m)) return "Music";
  if (/gym|fitness|peloton|yoga/.test(m)) return "Fitness";
  if (/adobe|figma|canva|sketch/.test(m)) return "Design";
  return "Subscriptions";
}

// The message the user can send to the merchant. Vera can't contact the merchant for them.
export function cancellationDraft(merchant: string, userName: string, last4: string): string {
  return [
    `Subject: Please cancel my ${merchant} subscription`,
    "",
    `Hello ${merchant} support team,`,
    "",
    `I would like to cancel my ${merchant} subscription effective immediately. Please confirm the cancellation in writing and make sure I am not billed again.`,
    "",
    `The payment card I had on file (ending ${last4}) has been closed, so any further charge attempts will be declined.`,
    "",
    "Thank you,",
    userName || "Your customer",
  ].join("\n");
}

async function displayName(workspaceId: string): Promise<string> {
  const db = await getDb();
  const [p] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.workspaceId, workspaceId));
  return p?.name ?? "";
}

export async function executeAction(
  workspaceId: string,
  tool: string,
  params: Record<string, unknown>,
  via: Via,
): Promise<ActionResult> {
  if (!isToolName(tool) || !needsConfirmation(tool)) throw new GuardError("Vera can't run that kind of request.");
  const where = confirmedWhere(via);

  switch (tool) {
    case "cancel_subscription": {
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      if (sub.status === "cancelled") return { ok: true, text: `The ${sub.merchant} card was already closed, so there's nothing more to do.` };
      await markCancelled(workspaceId, sub.id);
      const draft = cancellationDraft(sub.merchant, await displayName(workspaceId), sub.cardLast4);
      await insertNotification(
        workspaceId,
        KIND,
        `Vera closed the ${sub.merchant} card`,
        `You confirmed ${where}. Card ••${sub.cardLast4} is closed, so ${sub.merchant} can't charge you again. A cancellation message is drafted for you to send; the account itself stays open until you do.`,
      );
      return {
        ok: true,
        text: `Done. I closed the ${sub.merchant} card ending ${sub.cardLast4}, so ${sub.merchant} can't charge you again, and I drafted a cancellation message for you to send them. Your account with ${sub.merchant} stays open until you send it.`,
        draft,
      };
    }

    case "pause_card": {
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      await setCardPaused(workspaceId, sub.id, true);
      await insertNotification(workspaceId, KIND, `Vera paused the ${sub.merchant} card`, `You confirmed ${where}. Nothing can be charged to card ••${sub.cardLast4} until you turn it back on.`);
      return { ok: true, text: `Done. I paused the ${sub.merchant} card ending ${sub.cardLast4}. Nothing can be charged to it until you turn it back on.` };
    }

    case "resume_card": {
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      await setCardPaused(workspaceId, sub.id, false);
      await insertNotification(workspaceId, KIND, `Vera turned the ${sub.merchant} card back on`, `You confirmed ${where}. Card ••${sub.cardLast4} can be charged again, up to ${formatCents(sub.limitCents)} at a time.`);
      return { ok: true, text: `Done. The ${sub.merchant} card ending ${sub.cardLast4} is back on, up to ${formatCents(sub.limitCents)} per charge.` };
    }

    case "create_card": {
      const merchant = titleCase(str(params, "merchant"));
      const amountCents = int(params, "amountCents");
      const trialDays = typeof params.trialDays === "number" ? params.trialDays : null;
      const db = await getDb();
      const existing = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
      if (existing.some((s) => s.status !== "cancelled" && norm(s.merchant) === norm(merchant))) {
        throw new GuardError(`You already have a ${merchant} card, so I didn't create another.`);
      }
      await addSubscription(workspaceId, { merchant, category: categoryFor(merchant), amountCents, cycle: "monthly", trialDays });
      const [created] = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.merchant, merchant)))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const last4 = created?.cardLast4 ?? "••••";
      await insertNotification(
        workspaceId,
        KIND,
        `Vera created a ${merchant} card`,
        `You confirmed ${where}. Card ••${last4} can't be charged more than ${formatCents(amountCents)} at a time${trialDays ? `, and it locks when the ${trialDays}-day trial ends` : ""}.`,
      );
      return {
        ok: true,
        text: `Done. I created a guarded ${merchant} card ending ${last4}. It can't be charged more than ${formatCents(amountCents)} at a time${trialDays ? `, and it locks when the ${trialDays}-day free trial ends` : ""}.`,
      };
    }

    case "approve_new_price": {
      const chargeId = str(params, "chargeId");
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      await approveNewPrice(workspaceId, chargeId);
      const after = await subscriptionRow(workspaceId, sub.id);
      await insertNotification(workspaceId, KIND, `Vera approved ${sub.merchant}'s new price`, `You confirmed ${where}. The ${sub.merchant} limit went from ${formatCents(sub.limitCents)} to ${formatCents(after.limitCents)}.`);
      return { ok: true, text: `Done. I raised the ${sub.merchant} limit to ${formatCents(after.limitCents)}, so its new price can go through.` };
    }

    case "keep_blocking": {
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      await keepBlocking(workspaceId, str(params, "chargeId"));
      await insertNotification(workspaceId, KIND, `Vera is still blocking ${sub.merchant}'s new price`, `You confirmed ${where}. The limit stays at ${formatCents(sub.limitCents)}.`);
      return { ok: true, text: `Done. I'm still blocking ${sub.merchant}'s new price. Your limit stays at ${formatCents(sub.limitCents)}.` };
    }

    case "keep_after_trial": {
      const sub = await subscriptionRow(workspaceId, str(params, "subscriptionId"));
      await keepAfterTrial(workspaceId, sub.id);
      await insertNotification(workspaceId, KIND, `Vera kept ${sub.merchant} after the trial`, `You confirmed ${where}. Card ••${sub.cardLast4} is on and bills ${formatCents(sub.amountCents)}.`);
      return { ok: true, text: `Done. You're keeping ${sub.merchant} at ${formatCents(sub.amountCents)}, and its card is on.` };
    }

    case "set_budget": {
      const category = str(params, "category");
      const limitCents = int(params, "limitCents");
      await setBudgetLimit(workspaceId, category, limitCents);
      await insertNotification(workspaceId, KIND, `Vera set your ${category} budget`, `You confirmed ${where}. It is now ${formatCents(limitCents)} a month.`);
      return { ok: true, text: `Done. Your ${category} budget is now ${formatCents(limitCents)} a month.` };
    }

    case "add_to_goal": {
      const cents = int(params, "cents");
      const r = await addToGoal(workspaceId, str(params, "goalId"), cents);
      await insertNotification(
        workspaceId,
        KIND,
        `Vera added ${formatCents(cents)} to ${r.name}`,
        `You confirmed ${where}. ${r.reached ? "Goal reached!" : `It's at ${formatCents(r.savedCents)} of ${formatCents(r.targetCents)}.`}`,
      );
      return {
        ok: true,
        text: r.reached
          ? `Done, and that completes it. ${r.name} is fully funded at ${formatCents(r.targetCents)}.`
          : `Done. I added ${formatCents(cents)} to ${r.name}. It's now at ${formatCents(r.savedCents)} of ${formatCents(r.targetCents)}.`,
      };
    }

    case "pay_debt": {
      const cents = int(params, "cents");
      const r = await payDebt(workspaceId, str(params, "debtId"), cents);
      await insertNotification(
        workspaceId,
        KIND,
        `Vera recorded a ${formatCents(cents)} payment on ${r.name}`,
        `You confirmed ${where}. ${r.paidOff ? "It's paid off!" : `The balance is now ${formatCents(r.balanceCents)}.`}`,
      );
      return {
        ok: true,
        text: r.paidOff
          ? `Done. I recorded your ${formatCents(cents)} payment, and ${r.name} is paid off. I only updated the balance in VeraFund; no money moved.`
          : `Done. I recorded your ${formatCents(cents)} payment on ${r.name}. The balance is now ${formatCents(r.balanceCents)}. I only updated the balance in VeraFund; no money moved.`,
      };
    }

    case "answer_fraud_alert": {
      const wasMe = params.wasMe === true;
      const r = await answerFlaggedCharge(workspaceId, str(params, "transactionId"), wasMe);
      if (wasMe) {
        await insertNotification(workspaceId, KIND, `Vera cleared the ${r.merchant} charge`, `You confirmed ${where} that the ${formatCents(r.amountCents)} charge was yours.`);
        return { ok: true, text: `Done. I marked the ${formatCents(r.amountCents)} charge at ${r.merchant} as yours and let it through.` };
      }
      return { ok: true, text: `Done. I blocked the ${formatCents(r.amountCents)} charge at ${r.merchant}. No money moved, and I left a note in your notifications.` };
    }

    case "guard_subscriptions": {
      const merchants = Array.isArray(params.merchants) ? params.merchants.filter((m): m is string => typeof m === "string") : [];
      if (merchants.length === 0) throw new GuardError("That request was incomplete. Ask me again.");
      const created = await guardDiscovered(workspaceId, merchants);
      if (created === 0) return { ok: true, text: "Those were already guarded, so I didn't create any new cards." };
      await insertNotification(workspaceId, KIND, `Vera guarded ${created} subscription${created === 1 ? "" : "s"}`, `You confirmed ${where}. Each new card is limited to its current price.`);
      return { ok: true, text: `Done. I created ${created} guarded card${created === 1 ? "" : "s"}, each limited to its current price.` };
    }

    default:
      throw new GuardError("Vera can't run that kind of request.");
  }
}
