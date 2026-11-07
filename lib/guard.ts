// Guard service layer: every read and write is scoped to one demo workspace, and
// a charge's decision is made before the charge is recorded.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "./db/client";
import { seedFinance } from "./finance-seed";
import {
  accounts,
  charges,
  notifications,
  policyEvents,
  subscriptions,
  transactions,
  workspaces,
  type Charge,
  type PolicyEvent,
  type Subscription,
  type Workspace,
} from "./db/schema";
import { decide, reconcile, type Decision, type Policy } from "./engine";
import { formatCents, formatShortDate } from "./format";
import { adapterFor, getPayments, type PaymentsAdapter } from "./payments";

export const DAY_MS = 86_400_000;

export class GuardError extends Error {}
export class WorkspaceMissingError extends GuardError {
  constructor() {
    super("Your session has expired. Get started again.");
  }
}

type NewSubscription = {
  merchant: string;
  category: string;
  amountCents: number;
  cycle: "monthly" | "yearly";
  trialDays: number | null;
};

// Fictional demo data: prices are illustrative, not quotes from these merchants.
const DEMO_SUBSCRIPTIONS: NewSubscription[] = [
  { merchant: "Netflix", category: "Streaming", amountCents: 1599, cycle: "monthly", trialDays: null },
  { merchant: "Spotify", category: "Music", amountCents: 1199, cycle: "monthly", trialDays: null },
  { merchant: "Planet Fitness", category: "Fitness", amountCents: 2499, cycle: "monthly", trialDays: null },
  { merchant: "Adobe Creative Cloud", category: "Design", amountCents: 2299, cycle: "monthly", trialDays: 7 },
];

export function workspaceNow(ws: Pick<Workspace, "clockOffsetDays">): number {
  return Date.now() + ws.clockOffsetDays * DAY_MS;
}

function policyOf(sub: Subscription): Policy {
  return {
    merchant: sub.merchant,
    limitCents: sub.limitCents,
    cardStatus: sub.cardStatus,
    status: sub.status,
    kind: sub.kind,
    trialEndsAt: sub.trialEndsAt,
  };
}

function cycleLabel(cycle: Subscription["cycle"]): string {
  return cycle === "monthly" ? "mo" : "yr";
}

async function requireWorkspace(db: Db, workspaceId: string): Promise<Workspace> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new WorkspaceMissingError();
  return ws;
}

async function requireSubscription(db: Db, workspaceId: string, subscriptionId: string): Promise<Subscription> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) throw new GuardError("That subscription doesn't exist in your workspace.");
  return sub;
}

async function requireCharge(db: Db, workspaceId: string, chargeId: string): Promise<Charge> {
  const [charge] = await db
    .select()
    .from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.workspaceId, workspaceId)));
  if (!charge) throw new GuardError("That charge doesn't exist in your workspace.");
  return charge;
}

async function logEvent(
  db: Db,
  sub: Pick<Subscription, "id" | "workspaceId">,
  type: string,
  detail: string,
  at: number,
  actor: PolicyEvent["actor"] = "user",
) {
  await db.insert(policyEvents).values({
    id: randomUUID(),
    workspaceId: sub.workspaceId,
    subscriptionId: sub.id,
    type,
    detail,
    actor,
    at,
    createdAt: Date.now(),
  });
}

async function buildSubscription(
  payments: PaymentsAdapter,
  workspaceId: string,
  input: NewSubscription,
  position: number,
  now: number,
): Promise<Subscription> {
  const id = randomUUID();
  const card = await payments.createCard({
    merchant: input.merchant,
    limitCents: input.amountCents,
    workspaceId,
    subscriptionId: id,
  });
  const isTrial = input.trialDays !== null;
  return {
    id,
    workspaceId,
    merchant: input.merchant,
    category: input.category,
    amountCents: input.amountCents,
    cycle: input.cycle,
    kind: isTrial ? "trial" : "paid",
    status: isTrial ? "trial" : "active",
    trialEndsAt: isTrial ? now + input.trialDays! * DAY_MS : null,
    limitCents: input.amountCents,
    cardProvider: payments.mode,
    cardId: card.cardId,
    cardLast4: card.last4,
    cardStatus: "active",
    createdAt: Date.now(),
    position,
  };
}

function createdDetail(sub: Subscription): string {
  const base = `Card ••${sub.cardLast4} issued for ${sub.merchant} with a ${formatCents(sub.limitCents)} per-charge limit`;
  return sub.trialEndsAt ? `${base}; free trial until ${formatShortDate(sub.trialEndsAt)}` : base;
}

export async function createDemoWorkspace(): Promise<string> {
  const db = await getDb();
  const payments = getPayments();
  const id = randomUUID();
  const now = Date.now();
  const rows = await Promise.all(
    DEMO_SUBSCRIPTIONS.map((input, i) => buildSubscription(payments, id, input, i, now)),
  );
  await db.insert(workspaces).values({ id, createdAt: now, clockOffsetDays: 0 });
  await db.insert(subscriptions).values(rows);
  for (const sub of rows) await logEvent(db, sub, "created", createdDetail(sub), now, "system");
  await seedFinance(db, id, now);
  return id;
}

export async function addSubscription(workspaceId: string, input: NewSubscription): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${subscriptions.position}), -1) + 1` })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const now = workspaceNow(ws);
  const sub = await buildSubscription(getPayments(), workspaceId, input, next, now);
  await db.insert(subscriptions).values(sub);
  await logEvent(db, sub, "created", createdDetail(sub), now);
}

// A trial whose end date has passed gets its card locked before anything else
// happens, so the first paid charge is declined by the card network, not by us.
async function lockTrialIfEnded(db: Db, sub: Subscription, now: number): Promise<Subscription> {
  if (sub.kind !== "trial" || sub.status !== "trial" || sub.trialEndsAt === null || now < sub.trialEndsAt) {
    return sub;
  }
  await adapterFor(sub.cardProvider).setStatus(sub.cardId, "inactive");
  await db
    .update(subscriptions)
    .set({ status: "trial_ended", cardStatus: "inactive" })
    .where(eq(subscriptions.id, sub.id));
  await logEvent(
    db,
    sub,
    "trial_locked",
    `Free trial ended; card ••${sub.cardLast4} locked so it can't convert to ${formatCents(sub.amountCents)}/${cycleLabel(sub.cycle)}`,
    sub.trialEndsAt,
    "system",
  );
  await db.insert(notifications).values({
    id: randomUUID(),
    workspaceId: sub.workspaceId,
    kind: "trial_locked",
    title: `${sub.merchant} free trial ended`,
    body: `Card ••${sub.cardLast4} is locked, so the trial can't turn into a ${formatCents(sub.amountCents)}/${cycleLabel(sub.cycle)} plan without you.`,
    read: false,
    createdAt: Date.now(),
  });
  return { ...sub, status: "trial_ended", cardStatus: "inactive" };
}

export async function jumpAhead(workspaceId: string, days: number): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const updated = { ...ws, clockOffsetDays: ws.clockOffsetDays + days };
  await db
    .update(workspaces)
    .set({ clockOffsetDays: updated.clockOffsetDays })
    .where(eq(workspaces.id, workspaceId));
  const now = workspaceNow(updated);
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  for (const sub of subs) await lockTrialIfEnded(db, sub, now);
}

export async function simulateCharge(workspaceId: string, subscriptionId: string, amountCents: number) {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const now = workspaceNow(ws);
  const sub = await lockTrialIfEnded(db, await requireSubscription(db, workspaceId, subscriptionId), now);

  const local = decide(policyOf(sub), { merchant: sub.merchant, amountCents, at: now });
  let decision: Decision = local;
  let providerAuthorizationId: string | null = null;
  let providerReason: string | null = null;

  if (sub.cardProvider === "stripe") {
    const result = await adapterFor("stripe").authorize({ cardId: sub.cardId, amountCents, merchant: sub.merchant });
    decision = reconcile(local, result);
    providerAuthorizationId = result.authorizationId;
    providerReason = result.reason;
  }

  await db.insert(charges).values({
    id: randomUUID(),
    workspaceId,
    subscriptionId: sub.id,
    merchant: sub.merchant,
    amountCents,
    attemptedAt: now,
    approved: decision.approved,
    reason: decision.reason,
    reasonText: decision.text,
    provider: sub.cardProvider,
    providerAuthorizationId,
    providerReason,
    resolution: null,
    createdAt: Date.now(),
  });

  if (!decision.approved) {
    await db.insert(notifications).values({
      id: randomUUID(),
      workspaceId,
      kind: decision.reason ?? "declined",
      title: `Blocked ${formatCents(amountCents)} from ${sub.merchant}`,
      body: decision.text,
      read: false,
      createdAt: Date.now(),
    });
  }

  // Mirror the attempt into the transaction history so it shows on the dashboard.
  const [card] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.type, "credit")));
  await db.insert(transactions).values({
    id: randomUUID(),
    workspaceId,
    accountId: card?.id ?? "virtual",
    merchant: sub.merchant,
    category: "subscriptions",
    amountCents: -amountCents,
    occurredAt: now,
    description: decision.approved ? `Guard card ••${sub.cardLast4}` : `Blocked by Guard: ${decision.text}`,
    status: decision.approved ? "posted" : "blocked",
    riskScore: null,
    riskSignals: null,
    subscriptionId: sub.id,
    createdAt: Date.now(),
  });
}

export async function approveNewPrice(workspaceId: string, chargeId: string): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const charge = await requireCharge(db, workspaceId, chargeId);
  if (charge.approved || charge.reason !== "above_limit") {
    throw new GuardError("Only a charge declined for being above the limit can be approved as a new price.");
  }
  if (charge.resolution) throw new GuardError("You already answered this charge.");
  const sub = await requireSubscription(db, workspaceId, charge.subscriptionId);

  await adapterFor(sub.cardProvider).setLimit(sub.cardId, charge.amountCents);
  await db
    .update(subscriptions)
    .set({ limitCents: charge.amountCents, amountCents: charge.amountCents })
    .where(eq(subscriptions.id, sub.id));
  await db.update(charges).set({ resolution: "approved_new_price" }).where(eq(charges.id, charge.id));
  await logEvent(
    db,
    sub,
    "limit_changed",
    `You approved ${sub.merchant}'s new price: limit raised from ${formatCents(sub.limitCents)} to ${formatCents(charge.amountCents)}`,
    workspaceNow(ws),
  );
}

export async function keepBlocking(workspaceId: string, chargeId: string): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const charge = await requireCharge(db, workspaceId, chargeId);
  if (charge.approved) throw new GuardError("That charge was approved; there is nothing to block.");
  if (charge.resolution) throw new GuardError("You already answered this charge.");
  const sub = await requireSubscription(db, workspaceId, charge.subscriptionId);
  await db.update(charges).set({ resolution: "kept_blocking" }).where(eq(charges.id, charge.id));
  await logEvent(
    db,
    sub,
    "kept_limit",
    `You kept the ${formatCents(sub.limitCents)} limit; ${sub.merchant}'s ${formatCents(charge.amountCents)} charge stays declined`,
    workspaceNow(ws),
  );
}

export async function setCardPaused(workspaceId: string, subscriptionId: string, paused: boolean): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const sub = await requireSubscription(db, workspaceId, subscriptionId);
  if (sub.status === "cancelled") throw new GuardError("This card is closed and can't be paused or resumed.");
  if (sub.status === "trial_ended" && !paused) {
    throw new GuardError(`The ${sub.merchant} trial has ended. Choose "Keep subscription" to unlock the card.`);
  }
  const target = paused ? "inactive" : "active";
  if (sub.cardStatus === target) return;
  await adapterFor(sub.cardProvider).setStatus(sub.cardId, target);
  await db.update(subscriptions).set({ cardStatus: target }).where(eq(subscriptions.id, sub.id));
  await logEvent(
    db,
    sub,
    paused ? "paused" : "resumed",
    paused ? `You paused card ••${sub.cardLast4}` : `You resumed card ••${sub.cardLast4}`,
    workspaceNow(ws),
  );
}

export async function keepAfterTrial(workspaceId: string, subscriptionId: string): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const sub = await requireSubscription(db, workspaceId, subscriptionId);
  if (sub.kind !== "trial" || sub.status === "cancelled") {
    throw new GuardError("Only an active or ended free trial can be kept.");
  }
  await adapterFor(sub.cardProvider).setStatus(sub.cardId, "active");
  await db
    .update(subscriptions)
    .set({ kind: "paid", status: "active", cardStatus: "active" })
    .where(eq(subscriptions.id, sub.id));
  await logEvent(
    db,
    sub,
    "trial_converted",
    `You chose to keep ${sub.merchant} at ${formatCents(sub.amountCents)}/${cycleLabel(sub.cycle)}; card unlocked`,
    workspaceNow(ws),
  );
}

export async function markCancelled(workspaceId: string, subscriptionId: string): Promise<void> {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const sub = await requireSubscription(db, workspaceId, subscriptionId);
  if (sub.status === "cancelled") return;
  await adapterFor(sub.cardProvider).setStatus(sub.cardId, "canceled");
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cardStatus: "canceled" })
    .where(eq(subscriptions.id, sub.id));
  await logEvent(
    db,
    sub,
    "cancelled",
    `You confirmed you cancelled with ${sub.merchant}; card ••${sub.cardLast4} closed so no further charges go through`,
    workspaceNow(ws),
  );
}

// ---------- reads ----------

export interface SubscriptionView extends Subscription {
  lastCharge: Charge | null;
  // A decline for being above the limit that the user hasn't answered yet.
  pendingPriceChange: Charge | null;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return ws ?? null;
}

export async function getDashboard(workspaceId: string) {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .orderBy(asc(subscriptions.position));
  const allCharges = await db
    .select()
    .from(charges)
    .where(eq(charges.workspaceId, workspaceId))
    .orderBy(desc(charges.createdAt), desc(sql`rowid`));

  const views: SubscriptionView[] = subs.map((sub) => {
    const lastCharge = allCharges.find((c) => c.subscriptionId === sub.id) ?? null;
    const pendingPriceChange =
      lastCharge && !lastCharge.approved && lastCharge.reason === "above_limit" && !lastCharge.resolution
        ? lastCharge
        : null;
    return { ...sub, lastCharge, pendingPriceChange };
  });

  const declined = allCharges.filter((c) => !c.approved);
  return {
    workspace: ws,
    now: workspaceNow(ws),
    subscriptions: views,
    stats: {
      monthlyCents: subs
        .filter((s) => s.status !== "cancelled")
        .reduce((sum, s) => sum + (s.cycle === "monthly" ? s.amountCents : Math.round(s.amountCents / 12)), 0),
      declinedCount: declined.length,
      declinedCents: declined.reduce((sum, c) => sum + c.amountCents, 0),
      trialsGuarded: subs.filter((s) => s.kind === "trial").length,
    },
  };
}

export type TimelineItem =
  | { kind: "charge"; at: number; createdAt: number; charge: Charge }
  | { kind: "event"; at: number; createdAt: number; event: PolicyEvent };

function mergeTimeline(chargeRows: Charge[], eventRows: PolicyEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...chargeRows.map((c) => ({ kind: "charge" as const, at: c.attemptedAt, createdAt: c.createdAt, charge: c })),
    ...eventRows.map((e) => ({ kind: "event" as const, at: e.at, createdAt: e.createdAt, event: e })),
  ];
  return items.sort((a, b) => b.createdAt - a.createdAt || b.at - a.at);
}

export async function getSubscriptionDetail(workspaceId: string, subscriptionId: string) {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const sub = await requireSubscription(db, workspaceId, subscriptionId);
  const chargeRows = await db
    .select()
    .from(charges)
    .where(and(eq(charges.workspaceId, workspaceId), eq(charges.subscriptionId, subscriptionId)))
    .orderBy(desc(charges.createdAt), desc(sql`rowid`));
  const eventRows = await db
    .select()
    .from(policyEvents)
    .where(and(eq(policyEvents.workspaceId, workspaceId), eq(policyEvents.subscriptionId, subscriptionId)))
    .orderBy(desc(policyEvents.createdAt), desc(sql`rowid`));
  const lastCharge = chargeRows[0] ?? null;
  const pendingPriceChange =
    lastCharge && !lastCharge.approved && lastCharge.reason === "above_limit" && !lastCharge.resolution
      ? lastCharge
      : null;
  return {
    workspace: ws,
    now: workspaceNow(ws),
    subscription: { ...sub, lastCharge, pendingPriceChange } as SubscriptionView,
    timeline: mergeTimeline(chargeRows, eventRows),
  };
}

export async function getActivity(workspaceId: string) {
  const db = await getDb();
  const ws = await requireWorkspace(db, workspaceId);
  const chargeRows = await db
    .select()
    .from(charges)
    .where(eq(charges.workspaceId, workspaceId))
    .orderBy(desc(charges.createdAt), desc(sql`rowid`));
  const eventRows = await db
    .select()
    .from(policyEvents)
    .where(eq(policyEvents.workspaceId, workspaceId))
    .orderBy(desc(policyEvents.createdAt), desc(sql`rowid`));
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  return {
    workspace: ws,
    now: workspaceNow(ws),
    merchantById: Object.fromEntries(subs.map((s) => [s.id, s.merchant])),
    timeline: mergeTimeline(chargeRows, eventRows),
  };
}
