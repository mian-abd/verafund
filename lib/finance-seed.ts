// Realistic personal-finance history for a new workspace: a part-time student
// with a checking, savings and credit account and ~90 days of transactions.
// Deterministic per workspace (seeded RNG) so a reload never reshuffles data.

import { randomUUID } from "node:crypto";
import type { Db } from "./db/client";
import { accounts, budgets, debts, goals, profiles, transactions, userCards } from "./db/schema";

const DAY = 86_400_000;

function rngFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tx = typeof transactions.$inferInsert;

export const CATEGORY_BUDGETS: Record<string, number> = {
  housing: 90000,
  food: 46000,
  transport: 9500,
  entertainment: 7000,
  shopping: 13000,
  utilities: 13000,
  subscriptions: 7000,
};

// Subscription merchants and prices mirror the guarded subscriptions so the
// history and the cards tell the same story.
const SUBSCRIPTION_HISTORY = [
  { merchant: "Netflix", cents: 1599, day: 12 },
  { merchant: "Spotify", cents: 1199, day: 8 },
  { merchant: "Planet Fitness", cents: 2499, day: 5 },
];

export async function seedFinance(db: Db, workspaceId: string, now: number): Promise<void> {
  const rand = rngFor(workspaceId);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

  const checkingId = randomUUID();
  const savingsId = randomUUID();
  const creditId = randomUUID();

  await db.insert(profiles).values({
    workspaceId,
    displayName: "Alex Chen",
    monthlyIncomeCents: 260000,
    hourlyRateCents: 2000,
    taxRateBps: 1800,
    employer: "Campus IT Help Desk",
    payFrequency: "biweekly",
  });

  await db.insert(accounts).values([
    { id: checkingId, workspaceId, name: "Everyday Checking", type: "checking", institution: "Wells Fargo", balanceCents: 185000, color: "#D71E28" },
    { id: savingsId, workspaceId, name: "Way2Save Savings", type: "savings", institution: "Wells Fargo", balanceCents: 420000, color: "#00A651" },
    { id: creditId, workspaceId, name: "Discover it Student", type: "credit", institution: "Discover", balanceCents: -68000, color: "#FF6600" },
  ]);

  const rows: Tx[] = [];
  const add = (at: number, cents: number, merchant: string, category: string, accountId = checkingId, description?: string) => {
    if (at > now) return;
    rows.push({
      id: randomUUID(),
      workspaceId,
      accountId,
      merchant,
      category,
      amountCents: cents,
      occurredAt: at,
      description: description ?? null,
      status: "posted",
      riskScore: null,
      riskSignals: null,
      subscriptionId: null,
      createdAt: now,
    });
  };

  const start = now - 90 * DAY;
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(start + dayOffset * DAY);
    d.setHours(hour, between(0, 59), 0, 0);
    return d.getTime();
  };

  // Bi-weekly payroll.
  for (let d = 4; d <= 90; d += 14) add(at(d, 10), 120000, "Campus IT - Payroll", "income", checkingId, "Bi-weekly payroll deposit");

  for (let d = 0; d <= 90; d++) {
    const date = new Date(start + d * DAY);
    const dom = date.getDate();
    if (dom === 1) add(at(d, 9), -87500, "Maple Apartments", "housing", checkingId, "Monthly rent (shared apartment)");
    if (dom === 20) add(at(d, 8), -2800, "DTE Energy", "utilities", checkingId, "Electric bill (1/3 split)");
    if (dom === 22) add(at(d, 8), -5700, "Comcast Internet", "utilities");
    if (dom === 15) add(at(d, 8), -4500, "T-Mobile", "utilities");
    for (const s of SUBSCRIPTION_HISTORY) {
      if (dom === s.day) add(at(d, 7), -s.cents, s.merchant, "subscriptions", creditId);
    }
    if (dom === 28) add(at(d, 12), -30000, "Transfer to Savings", "transfer", checkingId, "Monthly savings goal");

    // Everyday spending with a little randomness.
    if (rand() < 0.3) add(at(d, between(10, 20)), -between(2500, 9000), pick(["Trader Joe's", "Kroger", "Whole Foods", "Aldi"]), "food");
    if (rand() < 0.45) add(at(d, between(8, 21)), -between(500, 3200), pick(["Starbucks", "Chipotle", "Uber Eats", "Taco Bell", "Panera Bread"]), "food", pick([checkingId, creditId]));
    if (rand() < 0.14) add(at(d, between(7, 19)), -between(3000, 4800), pick(["Shell", "BP", "Speedway"]), "transport");
    if (rand() < 0.07) add(at(d, between(17, 23)), -between(900, 2800), pick(["Uber", "Lyft"]), "transport", creditId);
    if (rand() < 0.1) add(at(d, between(11, 22)), -between(1500, 12000), pick(["Amazon", "Target", "Best Buy", "Walmart"]), "shopping", creditId);
    if (rand() < 0.06) add(at(d, between(18, 23)), -between(1200, 3500), pick(["AMC Theatres", "Steam", "Ticketmaster"]), "entertainment", creditId);
  }
  rows.sort((a, b) => (a.occurredAt as number) - (b.occurredAt as number));
  for (let i = 0; i < rows.length; i += 100) await db.insert(transactions).values(rows.slice(i, i + 100));

  await db.insert(budgets).values(
    Object.entries(CATEGORY_BUDGETS).map(([category, limitCents]) => ({ id: randomUUID(), workspaceId, category, limitCents })),
  );

  await db.insert(goals).values([
    { id: randomUUID(), workspaceId, name: "Emergency Fund", icon: "Shield", targetCents: 300000, savedCents: 150000, dueAt: now + 180 * DAY, createdAt: now },
    { id: randomUUID(), workspaceId, name: "Spring Break Trip", icon: "Plane", targetCents: 80000, savedCents: 34000, dueAt: now + 120 * DAY, createdAt: now },
    { id: randomUUID(), workspaceId, name: "New Laptop Fund", icon: "Laptop", targetCents: 120000, savedCents: 45000, dueAt: now + 240 * DAY, createdAt: now },
  ]);

  await db.insert(debts).values([
    { id: randomUUID(), workspaceId, name: "Discover it Student", kind: "credit_card", balanceCents: 68000, originalCents: 150000, aprBps: 2499, minPaymentCents: 3500 },
    { id: randomUUID(), workspaceId, name: "Federal Student Loan", kind: "student_loan", balanceCents: 1240000, originalCents: 1550000, aprBps: 550, minPaymentCents: 13000 },
  ]);

  await db.insert(userCards).values([
    { id: randomUUID(), workspaceId, name: "Discover it Student Cash Back", issuer: "Discover", type: "credit", last4: "4829", baseRewardBps: 100, categoryBonuses: JSON.stringify({ food: 500, subscriptions: 500 }), annualFeeCents: 0 },
    { id: randomUUID(), workspaceId, name: "Wells Fargo Active Cash", issuer: "Wells Fargo", type: "credit", last4: "5521", baseRewardBps: 200, categoryBonuses: "{}", annualFeeCents: 0 },
    { id: randomUUID(), workspaceId, name: "Wells Fargo Debit", issuer: "Wells Fargo", type: "debit", last4: "9903", baseRewardBps: 0, categoryBonuses: "{}", annualFeeCents: 0 },
  ]);
}
