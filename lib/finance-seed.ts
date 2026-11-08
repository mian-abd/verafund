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

// The first three mirror the guarded subscriptions so the history and the cards tell the
// same story. Hulu and iCloud+ have no card yet: "Find my subscriptions" discovers them,
// and Hulu's last charge went up (hikedCents applies to charges in the last 35 days).
const SUBSCRIPTION_HISTORY: Array<{ merchant: string; cents: number; day: number; hikedCents?: number }> = [
  { merchant: "Netflix", cents: 1599, day: 12 },
  { merchant: "Spotify", cents: 1199, day: 8 },
  { merchant: "Planet Fitness", cents: 2499, day: 5 },
  { merchant: "Hulu", cents: 999, day: 18, hikedCents: 1199 },
  { merchant: "iCloud+", cents: 299, day: 3 },
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

  // History starts on the 1st, four months back, so the monthly charts show whole months.
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 4, 1);
  startDate.setHours(0, 0, 0, 0);
  const start = startDate.getTime();
  const days = Math.floor((now - start) / DAY);
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(start + dayOffset * DAY);
    d.setHours(hour, between(0, 59), 0, 0);
    return d.getTime();
  };

  // Bi-weekly payroll that moves with the hours actually worked (finals week is thin,
  // an extra shift or two shows up now and then).
  // Anchored so the latest payday was three days ago.
  for (let d = days - 3; d >= 0; d -= 14) {
    const hours = between(58, 76);
    add(at(d, 10), Math.round(hours * 2000 * 0.82), "Campus IT - Payroll", "income", checkingId, `Bi-weekly payroll · ${hours} hrs`);
  }

  // Each month has its own mood: some are tight, some get away from you.
  const monthMood = new Map<string, number>();
  const mood = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!monthMood.has(key)) monthMood.set(key, 0.75 + rand() * 0.6);
    return monthMood.get(key)!;
  };
  // A few one-off hits that real months have, on random days.
  const oneOffs: Array<{ day: number; cents: number; merchant: string; category: string; note: string }> = [
    { day: between(3, 12), cents: between(18000, 26000), merchant: "Campus Bookstore", category: "shopping", note: "Textbooks" },
    { day: between(30, 70), cents: between(24000, 36000), merchant: "Delta Air Lines", category: "transport", note: "Flight home" },
    { day: between(40, 100), cents: between(16000, 42000), merchant: "Midas", category: "transport", note: "Brake pads" },
    { day: between(20, 110), cents: between(8500, 15000), merchant: "Ticketmaster", category: "entertainment", note: "Concert tickets" },
    { day: between(10, 110), cents: between(6000, 9500), merchant: "The Cheesecake Factory", category: "food", note: "Birthday dinner" },
    { day: between(50, 115), cents: between(9000, 18000), merchant: "Costco", category: "food", note: "Bulk run" },
  ];
  for (const o of oneOffs) {
    if (o.day <= days) add(at(o.day, between(11, 20)), -o.cents, o.merchant, o.category, creditId, o.note);
  }

  for (let d = 0; d <= days; d++) {
    const date = new Date(start + d * DAY);
    const dom = date.getDate();
    const dow = date.getDay(); // 0 Sunday … 6 Saturday
    const weekend = dow === 5 || dow === 6;
    const m = mood(date);
    const scaled = (lo: number, hi: number) => Math.round(between(lo, hi) * m);

    if (dom === 1) add(at(d, 9), -87500, "Maple Apartments", "housing", checkingId, "Monthly rent (shared apartment)");
    if (dom === 20) add(at(d, 8), -2800, "DTE Energy", "utilities", checkingId, "Electric bill (1/3 split)");
    if (dom === 22) add(at(d, 8), -5700, "Comcast Internet", "utilities");
    if (dom === 15) add(at(d, 8), -4500, "T-Mobile", "utilities");
    for (const s of SUBSCRIPTION_HISTORY) {
      const recent = start + d * DAY >= now - 35 * DAY;
      if (dom === s.day) add(at(d, 7), -(s.hikedCents && recent ? s.hikedCents : s.cents), s.merchant, "subscriptions", creditId);
    }
    if (dom === 28) add(at(d, 12), -30000, "Transfer to Savings", "transfer", checkingId, "Monthly savings goal");
    // Roommates pay back their share of internet and power a few days into the month.
    if (dom === between(2, 6) && rand() < 0.8) add(at(d, 19), between(2400, 4300), "Venmo - Jordan", "income", checkingId, "Utilities split");
    // Weekend delivery shifts.
    if (dow === 1 && rand() < 0.45) add(at(d, 9), between(3800, 16500), "DoorDash - Dasher payout", "income", checkingId, "Weekly payout");

    // Groceries: a big Sunday shop, plus top-ups.
    if (dow === 0 && rand() < 0.75) add(at(d, between(10, 17)), -scaled(5200, 13800), pick(["Trader Joe's", "Kroger", "Aldi"]), "food");
    else if (rand() < 0.12) add(at(d, between(17, 21)), -between(900, 3400), pick(["Kroger", "Whole Foods", "7-Eleven"]), "food");
    // Eating out clusters on Fridays and Saturdays.
    if (rand() < (weekend ? 0.7 : 0.32)) {
      add(at(d, between(11, 22)), -scaled(weekend ? 1400 : 600, weekend ? 5200 : 2600), pick(["Starbucks", "Chipotle", "Uber Eats", "Taco Bell", "Panera Bread", "Raising Cane's"]), "food", pick([checkingId, creditId]));
    }
    if (rand() < 0.11) add(at(d, between(7, 19)), -between(2800, 5200), pick(["Shell", "BP", "Speedway"]), "transport");
    if (rand() < (weekend ? 0.18 : 0.04)) add(at(d, between(20, 23)), -between(900, 3100), pick(["Uber", "Lyft"]), "transport", creditId);
    if (rand() < 0.09 * m) add(at(d, between(11, 22)), -scaled(1200, 11000), pick(["Amazon", "Target", "Best Buy", "Walmart", "CVS Pharmacy"]), "shopping", creditId);
    if (rand() < (weekend ? 0.12 : 0.03)) add(at(d, between(18, 23)), -between(1200, 3600), pick(["AMC Theatres", "Steam", "Dave & Buster's"]), "entertainment", creditId);
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
