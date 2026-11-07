// Fraud engine: scores an incoming purchase 0-100 from independent, explainable
// signals using the workspace's own history. Pure functions only (no I/O, no
// clock), so every rule is unit-tested. The rule score alone decides the status;
// optional model evidence (lib/jev.ts) is appended with 0 points and never changes it.

import { formatCents } from "./format";

export interface RiskSignal {
  signal: string;
  points: number;
  detail: string;
}

export type Severity = "low" | "medium" | "high";

export interface PurchaseInput {
  merchant: string;
  /** Positive cents. */
  amountCents: number;
  category: string;
  /** ISO 3166 alpha-2, e.g. "US". */
  country: string;
  /** Epoch ms on the app's clock (workspaceNow). */
  at: number;
}

/** The slice of a stored transaction the engine needs. Spending is negative cents. */
export interface HistoryTx {
  merchant: string;
  category: string;
  amountCents: number;
  occurredAt: number;
  status: "posted" | "pending" | "flagged" | "blocked";
}

export interface FraudContext {
  history: HistoryTx[];
  /** Checking balance in cents, or null when the workspace has none. */
  checkingBalanceCents: number | null;
  homeCountry?: string;
  /** IANA zone used to read the hour of day. Defaults to the app's display zone. */
  timeZone?: string;
}

export interface FraudResult {
  score: number;
  severity: Severity;
  signals: RiskSignal[];
}

export const HIGH_RISK_THRESHOLD = 70;
export const MEDIUM_RISK_THRESHOLD = 40;
export const APP_TIME_ZONE = "America/Los_Angeles";
export const VELOCITY_WINDOW_MS = 60 * 60 * 1000;

export function severityOf(score: number): Severity {
  if (score >= HIGH_RISK_THRESHOLD) return "high";
  if (score >= MEDIUM_RISK_THRESHOLD) return "medium";
  return "low";
}

// ---------- helpers ----------

export function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCategory(name: string): string {
  return name.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

export function hourOfDay(ms: number, timeZone: string = APP_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  return hour === 24 ? 0 : hour;
}

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? "AM" : "PM"}`;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "the United States",
  CA: "Canada",
  GB: "the United Kingdom",
  MX: "Mexico",
  RU: "Russia",
  CN: "China",
  NG: "Nigeria",
  KP: "North Korea",
  IR: "Iran",
  BY: "Belarus",
  UA: "Ukraine",
  RO: "Romania",
  BR: "Brazil",
  IN: "India",
  DE: "Germany",
  FR: "France",
};

// Corridors with outsized card-fraud rates; used only to weigh the foreign-country signal.
const HIGH_RISK_COUNTRIES = new Set(["RU", "KP", "IR", "NG", "BY", "SY", "CU", "MM", "RO"]);

const SEVERE_CATEGORIES = new Set(["crypto", "cryptocurrency", "bitcoin", "wire transfer", "wire", "money transfer"]);
const RISKY_CATEGORIES = new Set(["gambling", "casino", "gift cards", "gift card", "cash advance", "forex"]);

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

function isSpend(t: HistoryTx): boolean {
  return t.amountCents < 0 && normalizeCategory(t.category) !== "transfer" && normalizeCategory(t.category) !== "income";
}

// ---------- signals ----------

type SignalFn = (p: PurchaseInput, ctx: FraudContext, baseline: HistoryTx[]) => RiskSignal | null;

// Amount far above what this category normally costs.
const amountAnomaly: SignalFn = (p, _ctx, baseline) => {
  const cat = normalizeCategory(p.category);
  const inCategory = baseline.filter((t) => normalizeCategory(t.category) === cat);
  const useCategory = inCategory.length >= 3;
  const sample = (useCategory ? inCategory : baseline).map((t) => Math.abs(t.amountCents));
  if (sample.length < 3) return null;
  const med = median(sample);
  if (med <= 0) return null;
  const { mean, std } = meanStd(sample);
  const ratio = p.amountCents / med;
  const z = std > 0 ? (p.amountCents - mean) / std : Infinity;
  let points = 0;
  if (ratio >= 10) points = 30;
  else if (ratio >= 5) points = 22;
  else if (ratio >= 3 && z >= 2) points = 12;
  if (points === 0) return null;
  const basis = useCategory ? `your usual ${p.category} purchase` : `your typical purchase (no history in ${p.category})`;
  return {
    signal: "amount_far_above_typical",
    points,
    detail: `${formatCents(p.amountCents)} is ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x ${basis} of ${formatCents(Math.round(med))}.`,
  };
};

// First time we've seen this merchant (flagged and blocked attempts don't earn trust).
const newMerchant: SignalFn = (p, _ctx, baseline) => {
  const key = normalizeMerchant(p.merchant);
  if (!key) return null;
  if (baseline.some((t) => normalizeMerchant(t.merchant) === key)) return null;
  return { signal: "new_merchant", points: 15, detail: `You've never bought from ${p.merchant} before.` };
};

// Several charges in a short window.
const velocity: SignalFn = (p, ctx) => {
  const recent = ctx.history.filter(
    (t) => isSpend(t) && t.status !== "blocked" && t.occurredAt <= p.at && p.at - t.occurredAt <= VELOCITY_WINDOW_MS,
  );
  const n = recent.length;
  if (n >= 4) return { signal: "velocity", points: 20, detail: `${n + 1} charges within the last hour, including this one.` };
  if (n >= 2) return { signal: "velocity", points: 12, detail: `${n + 1} charges within the last hour, including this one.` };
  return null;
};

// Late-night purchases, read on the app's clock.
const unusualHour: SignalFn = (p, ctx) => {
  const hour = hourOfDay(p.at, ctx.timeZone);
  if (hour >= 0 && hour < 5) {
    return { signal: "unusual_hour", points: 12, detail: `Attempted at ${hourLabel(hour)}, when you rarely spend.` };
  }
  return null;
};

// Categories that don't fit this account's normal life.
const categoryMismatch: SignalFn = (p, _ctx, baseline) => {
  const cat = normalizeCategory(p.category);
  const severe = SEVERE_CATEGORIES.has(cat);
  const risky = RISKY_CATEGORIES.has(cat);
  if (!severe && !risky) return null;
  const prior = baseline.filter((t) => normalizeCategory(t.category) === cat).length;
  if (prior >= 2) return null;
  return {
    signal: "category_mismatch",
    points: severe ? 25 : 15,
    detail: `${p.category} isn't something you normally spend on, and it's a common fraud pattern.`,
  };
};

// Purchase from outside the home country.
const foreignCountry: SignalFn = (p, ctx) => {
  const home = (ctx.homeCountry ?? "US").toUpperCase();
  const country = p.country.trim().toUpperCase();
  if (!country || country === home) return null;
  const highRisk = HIGH_RISK_COUNTRIES.has(country);
  return {
    signal: "foreign_country",
    points: highRisk ? 28 : 20,
    detail: `Card used in ${countryName(country)}, but your purchases are in ${countryName(home)}.${highRisk ? " That region has high card-fraud rates." : ""}`,
  };
};

// Big, perfectly round amounts are typical of scripted theft.
const roundHighAmount: SignalFn = (p) => {
  if (p.amountCents >= 50_000 && p.amountCents % 5_000 === 0) {
    return { signal: "round_high_amount", points: 10, detail: `${formatCents(p.amountCents)} is a large, perfectly round amount.` };
  }
  return null;
};

// A big bite out of what's in checking.
const balanceRatio: SignalFn = (p, ctx) => {
  const balance = ctx.checkingBalanceCents;
  if (balance === null || p.amountCents < 10_000) return null;
  if (balance <= 0 || p.amountCents >= balance) {
    return { signal: "amount_vs_balance", points: 20, detail: `${formatCents(p.amountCents)} is more than your checking balance of ${formatCents(Math.max(balance, 0))}.` };
  }
  const share = p.amountCents / balance;
  if (share >= 0.5) {
    return { signal: "amount_vs_balance", points: 15, detail: `${formatCents(p.amountCents)} would take ${Math.round(share * 100)}% of your ${formatCents(balance)} checking balance.` };
  }
  if (share >= 0.25) {
    return { signal: "amount_vs_balance", points: 8, detail: `${formatCents(p.amountCents)} is ${Math.round(share * 100)}% of your ${formatCents(balance)} checking balance.` };
  }
  return null;
};

const SIGNALS: SignalFn[] = [
  amountAnomaly,
  newMerchant,
  velocity,
  unusualHour,
  categoryMismatch,
  foreignCountry,
  roundHighAmount,
  balanceRatio,
];

export function scorePurchase(purchase: PurchaseInput, ctx: FraudContext): FraudResult {
  // Baselines only trust purchases that went through; flagged and blocked ones don't count.
  const baseline = ctx.history.filter((t) => isSpend(t) && (t.status === "posted" || t.status === "pending"));
  const signals = SIGNALS.map((fn) => fn(purchase, ctx, baseline)).filter((s): s is RiskSignal => s !== null);
  signals.sort((a, b) => b.points - a.points);
  const score = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));
  return { score, severity: severityOf(score), signals };
}

// ---------- storage and display helpers ----------

export function parseRiskSignals(json: string | null | undefined): RiskSignal[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is RiskSignal =>
        !!s && typeof s === "object" && typeof s.signal === "string" && typeof s.points === "number" && typeof s.detail === "string",
    );
  } catch {
    return [];
  }
}

export const SIGNAL_LABELS: Record<string, string> = {
  amount_far_above_typical: "Unusually large amount",
  new_merchant: "New merchant",
  velocity: "Rapid charges",
  unusual_hour: "Unusual hour",
  category_mismatch: "Unusual category",
  foreign_country: "Foreign country",
  round_high_amount: "Round high amount",
  amount_vs_balance: "Large vs. balance",
  user_confirmed: "You confirmed",
  jev_likely_fraud: "Jev: fraud probability",
  jev_fraud_type: "Jev: fraud type",
};

export function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal.replace(/_/g, " ");
}

// "CryptoVault-International.xyz" is read out as "CryptoVault"; ordinary names stay whole.
export function spokenMerchant(merchant: string): string {
  const trimmed = merchant.trim();
  const withoutTld = trimmed.replace(/\.[a-z]{2,}$/i, "");
  if (withoutTld === trimmed) return trimmed;
  return withoutTld.split(/[-_]/)[0] || withoutTld;
}

export function veraFraudScript(merchant: string, amountCents: number): string {
  const amount = amountCents % 100 === 0 ? `$${(amountCents / 100).toLocaleString("en-US")}` : formatCents(amountCents);
  return `Hi, it's Vera. A ${amount} charge at ${spokenMerchant(merchant)} just tried to go through. That's not like you. Was this you?`;
}
