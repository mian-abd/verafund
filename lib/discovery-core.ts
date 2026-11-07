// Pure subscription-detection logic: no database, no network, no clock. Everything
// that touches the outside world (transactions, guarded subscriptions, Jev, the
// app clock) is passed in by lib/discovery.ts, so this file is easy to test.
//
// Pipeline: normalize merchants -> find the longest monthly or yearly chain of
// similar charges per merchant -> score it -> classify it (subscription or recurring
// bill) -> optionally blend in Jev's answers for the borderline ones.

import type { DiscoveredSubscription } from "./discovery";
import { MAX_CHARGE_CENTS, formatCents } from "./format";

const DAY = 86_400_000;

// ---------- types ----------

export type SubscriptionKind =
  | "streaming"
  | "music"
  | "fitness"
  | "software"
  | "news"
  | "shopping_membership"
  | "utility_bill"
  | "housing"
  | "other";

export const SUBSCRIPTION_KINDS: SubscriptionKind[] = [
  "streaming",
  "music",
  "fitness",
  "software",
  "news",
  "shopping_membership",
  "utility_bill",
  "housing",
  "other",
];

export type CandidateGroup = "subscription" | "bill";

// How we arrived at the kind: a merchant keyword (strong), the transaction's own
// category (medium) or a guess (weak, and one reason to ask Jev).
export type KindBasis = "keyword" | "category" | "fallback";

// The public interface plus what the UI and the Jev step need.
export interface DiscoveryCandidate extends DiscoveredSubscription {
  key: string; // normalized merchant, the identity used for matching
  kind: SubscriptionKind;
  group: CandidateGroup;
  kindBasis: KindBasis;
  previousAmountCents: number | null; // median of the earlier charges, only when priceChanged
}

// The slice of a transaction row that detection reads (the DB row satisfies it).
export interface RawTransaction {
  merchant: string;
  category: string;
  amountCents: number; // signed: spending is negative
  occurredAt: number;
  status: string;
}

export interface DetectOptions {
  now: number; // the app clock, not Date.now()
  guardedMerchants?: readonly string[];
}

// ---------- tunables ----------

const AMOUNT_TOLERANCE = 0.15; // consecutive charges within 15% of each other
const TAIL_RATIO = { min: 0.5, max: 2 }; // the latest charge may jump further than 15% (a real price hike)
const DUPLICATE_WINDOW_DAYS = 4; // near-identical charges this close are one charge (retries, pending+posted)
const MIN_CONFIDENCE = 0.4;
const BORDERLINE_BELOW = 0.85;
const MAX_CANDIDATES = 40;
const PRICE_CHANGE_THRESHOLD = 0.02;
const STABLE_SPREAD = 0.03; // "the same price" for a subscription: charges within 3% of each other

const CYCLES = {
  monthly: { min: 25, max: 35, nominal: 30.4, free: 2.5, scale: 2.5 },
  yearly: { min: 350, max: 380, nominal: 365, free: 5, scale: 10 },
} as const;

// ---------- merchant normalization ----------

const NOISE_WORDS = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company",
  "com", "net", "org", "www", "usa", "us", "pos", "debit", "purchase", "payment", "pmt",
  "recurring", "autopay", "ach", "online", "bill", "billing", "web",
]);

// "PAYPAL *SPOTIFY": the part before the star names the processor, not the merchant.
const PROCESSOR_PREFIXES = new Set(["paypal", "pp", "sq", "square", "tst", "sp", "google", "goog"]);

function looksLikeStoreNumber(word: string): boolean {
  if (/^#/.test(word)) return true;
  if (/^[\d-]+$/.test(word)) return true;
  // Reference codes such as "XY12AB": alphanumeric, at least two digits, long enough to not be a brand.
  const digits = (word.match(/\d/g) ?? []).length;
  return word.length >= 5 && digits >= 2 && /^[a-z0-9]+$/i.test(word) && /[a-z]/i.test(word);
}

// Cleaned words of a raw merchant string, original casing kept (used for display).
function cleanWords(raw: string): string[] {
  let s = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/&/g, " and ").replace(/\+/g, " plus ");
  const parts = s.split("*");
  if (parts.length > 1) {
    const prefix = parts[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    const rest = parts.slice(1).join(" ").trim();
    s = PROCESSOR_PREFIXES.has(prefix) && rest ? rest : parts.join(" ");
  }
  s = s.replace(/[./\\|_,;:()[\]{}"~!?@$%^=<>]/g, " ").replace(/#/g, " #");
  const words = s
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w && /[a-z0-9]/i.test(w))
    .filter((w) => !NOISE_WORDS.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")))
    .filter((w) => !looksLikeStoreNumber(w));
  if (words.length > 1 && words[0].toLowerCase() === "the") words.shift();
  return words;
}

// Lowercase, no punctuation, store numbers or noise words: the identity of a merchant.
export function normalizeMerchant(raw: string): string {
  const words = cleanWords(raw)
    .join(" ")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w));
  if (words.length > 0) return words.join(" ");
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Names that title-casing gets wrong.
const BRAND_CASE: Record<string, string> = {
  icloud: "iCloud",
  youtube: "YouTube",
  chatgpt: "ChatGPT",
  openai: "OpenAI",
  github: "GitHub",
  linkedin: "LinkedIn",
  hbo: "HBO",
  wsj: "WSJ",
  nordvpn: "NordVPN",
  expressvpn: "ExpressVPN",
};

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// "NETFLIX.COM" -> "Netflix". Mixed-case names like "iCloud" are left alone.
export function displayMerchant(raw: string): string {
  const words = cleanWords(raw);
  let text = words.join(" ").replace(/\s+/g, " ").trim();
  if (!text) text = raw.trim();
  // The "+" we expand to "plus" must not make an all-caps name look mixed-case.
  const probe = words.filter((w) => w !== "plus").join(" ") || text;
  if (probe === probe.toUpperCase() || probe === probe.toLowerCase()) text = titleCase(text);
  text = text.replace(/\bplus\b/g, "Plus").replace(/[A-Za-z0-9]+/g, (w) => BRAND_CASE[w.toLowerCase()] ?? w);
  if (text.length > 40) {
    const cut = text.slice(0, 40);
    text = cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trim();
  }
  return text || "Unknown merchant";
}

// Same merchant, allowing "adobe" to match "adobe creative cloud".
export function merchantsMatch(a: string, b: string): boolean {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short[0].length < 4) return false;
  return short.every((token, i) => token === long[i]);
}

// ---------- kind and group ----------

type KeywordRule = { kind: SubscriptionKind; phrases: string[] };

// Evaluated in order, so "prime video" is streaming before "prime" is a shopping membership.
const KEYWORD_RULES: KeywordRule[] = [
  { kind: "shopping_membership", phrases: ["rent the runway"] }, // before "rent" below
  { kind: "housing", phrases: ["rent", "apartments", "apartment", "apts", "property management", "realty", "landlord", "mortgage", "hoa", "lease", "leasing"] },
  {
    kind: "utility_bill",
    phrases: [
      "energy", "electric", "electricity", "power", "utility", "utilities", "water", "sewer", "waste", "natural gas", "gas and electric",
      "internet", "comcast", "xfinity", "spectrum", "fios", "cox", "centurylink", "broadband",
      "t mobile", "tmobile", "verizon", "at and t", "att", "sprint", "cricket", "mint mobile", "visible", "wireless", "phone",
      "insurance", "geico", "progressive", "allstate", "state farm",
      "loan", "navient", "nelnet", "sallie mae", "lending",
    ],
  },
  { kind: "streaming", phrases: ["netflix", "hulu", "disney plus", "hbo", "max", "paramount", "peacock", "youtube", "prime video", "crunchyroll", "apple tv", "twitch", "sling", "fubo", "discovery plus", "streaming"] },
  { kind: "music", phrases: ["spotify", "apple music", "pandora", "tidal", "amazon music", "soundcloud", "deezer", "music"] },
  { kind: "fitness", phrases: ["fitness", "gym", "peloton", "equinox", "crossfit", "yoga", "orangetheory", "strava", "classpass", "ymca", "climbing", "pilates", "24 hour"] },
  {
    kind: "software",
    phrases: ["adobe", "creative cloud", "microsoft", "office 365", "github", "dropbox", "icloud", "google one", "google storage", "chatgpt", "openai", "claude", "anthropic", "notion", "figma", "slack", "zoom", "1password", "lastpass", "nordvpn", "expressvpn", "vpn", "canva", "jetbrains", "software", "hosting", "cloud"],
  },
  { kind: "news", phrases: ["new york times", "nytimes", "wall street journal", "wsj", "washington post", "economist", "substack", "apple news", "bloomberg", "news"] },
  { kind: "shopping_membership", phrases: ["amazon prime", "prime", "costco", "sams club", "walmart plus", "bjs", "instacart", "dashpass", "uber one", "chewy", "stitch fix", "hellofresh", "hello fresh", "blue apron"] },
];

function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

const BILL_KINDS: ReadonlySet<SubscriptionKind> = new Set<SubscriptionKind>(["utility_bill", "housing"]);

export function isBillKind(kind: SubscriptionKind): boolean {
  return BILL_KINDS.has(kind);
}

export function groupForKind(kind: SubscriptionKind): CandidateGroup {
  return isBillKind(kind) ? "bill" : "subscription";
}

export function inferKind(normalized: string, txCategory: string): { kind: SubscriptionKind; basis: KindBasis } {
  for (const rule of KEYWORD_RULES) {
    if (rule.phrases.some((p) => hasPhrase(normalized, p))) return { kind: rule.kind, basis: "keyword" };
  }
  const cat = txCategory.toLowerCase();
  if (cat === "housing") return { kind: "housing", basis: "category" };
  if (cat === "utilities") return { kind: "utility_bill", basis: "category" };
  if (cat === "subscriptions") return { kind: "other", basis: "category" };
  return { kind: "other", basis: "fallback" };
}

const KIND_CATEGORY: Record<SubscriptionKind, string> = {
  streaming: "Streaming",
  music: "Music",
  fitness: "Fitness",
  software: "Software",
  news: "News",
  shopping_membership: "Shopping",
  utility_bill: "Utilities",
  housing: "Housing",
  other: "Subscription",
};

const BILL_LABELS: { category: string; phrases: string[] }[] = [
  { category: "Phone", phrases: ["t mobile", "tmobile", "verizon", "at and t", "att", "sprint", "cricket", "mint mobile", "visible", "wireless", "phone", "mobile"] },
  { category: "Internet", phrases: ["internet", "comcast", "xfinity", "spectrum", "fios", "cox", "centurylink", "broadband"] },
  { category: "Insurance", phrases: ["insurance", "geico", "progressive", "allstate", "state farm"] },
  { category: "Loan", phrases: ["loan", "navient", "nelnet", "sallie mae", "lending"] },
];

// The category stored on the guarded card, e.g. "Streaming", or "Phone" for a phone bill.
export function categoryForKind(kind: SubscriptionKind, normalized: string): string {
  if (kind === "utility_bill") {
    const label = BILL_LABELS.find((l) => l.phrases.some((p) => hasPhrase(normalized, p)));
    return label?.category ?? "Utilities";
  }
  return KIND_CATEGORY[kind];
}

const BILL_CATEGORIES = new Set(["housing", "utilities", "phone", "internet", "insurance", "loan"]);

// Lets the UI (and other code that only sees DiscoveredSubscription) split bills from subscriptions.
export function isBillCategory(category: string): boolean {
  return BILL_CATEGORIES.has(category.trim().toLowerCase());
}

// How much to trust "this repeats" as "this is a subscription", given what the merchant sells.
function categoryPrior(kind: SubscriptionKind, txCategory: string): number {
  if (kind !== "other") return 1;
  switch (txCategory.toLowerCase()) {
    case "subscriptions":
      return 1;
    case "entertainment":
      return 0.9;
    case "shopping":
      return 0.8;
    case "food":
    case "transport":
      return 0.45; // meals and rides twice a month are habits, not subscriptions
    default:
      return 0.85;
  }
}

// ---------- chain detection ----------

interface Charge {
  t: number;
  cents: number; // positive
  raw: string;
  category: string;
}

type CycleName = keyof typeof CYCLES;

function closeAmount(a: number, b: number): boolean {
  return Math.abs(a - b) / Math.max(a, b) <= AMOUNT_TOLERANCE;
}

function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY);
}

function inWindow(days: number, cycle: CycleName): boolean {
  return days >= CYCLES[cycle].min && days <= CYCLES[cycle].max;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Collapses a retry or a pending+posted pair into one charge.
function dedupe(sorted: Charge[]): Charge[] {
  const kept: Charge[] = [];
  for (const c of sorted) {
    const last = kept[kept.length - 1];
    if (last && c.t - last.t < DUPLICATE_WINDOW_DAYS * DAY && closeAmount(last.cents, c.cents)) continue;
    kept.push(c);
  }
  return kept;
}

// Longest run of charges where each is one billing cycle after the previous, at a similar amount.
function longestChain(charges: Charge[], cycle: CycleName): number[] | null {
  const n = charges.length;
  if (n < 2) return null;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  const miss = new Array<number>(n).fill(Infinity); // how far the chosen link is from the nominal cycle
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < j; i++) {
      const days = daysBetween(charges[i].t, charges[j].t);
      if (!inWindow(days, cycle) || !closeAmount(charges[i].cents, charges[j].cents)) continue;
      const candidate = len[i] + 1;
      const off = Math.abs(days - CYCLES[cycle].nominal);
      if (candidate > len[j] || (candidate === len[j] && off < miss[j])) {
        len[j] = candidate;
        prev[j] = i;
        miss[j] = off;
      }
    }
  }
  let end = -1;
  for (let j = 0; j < n; j++) if (len[j] >= 2 && (end < 0 || len[j] >= len[end])) end = j;
  if (end < 0) return null;
  const chain: number[] = [];
  for (let k = end; k >= 0; k = prev[k]) chain.unshift(k);
  return chain;
}

// A real price hike can exceed the 15% step. Allow the charge right after the chain to
// differ more, so "went from $9.99 to $14.99" is reported instead of silently dropped.
function extendTail(charges: Charge[], chain: number[], cycle: CycleName): number[] {
  // Only a chain whose price never moved earns this: a loose chain plus a big jump is just noise.
  if (spreadOf(chain.map((i) => charges[i].cents)) > STABLE_SPREAD) return chain;
  const last = charges[chain[chain.length - 1]];
  for (let k = chain[chain.length - 1] + 1; k < charges.length; k++) {
    const days = daysBetween(last.t, charges[k].t);
    if (days > CYCLES[cycle].max) break;
    if (!inWindow(days, cycle)) continue;
    const ratio = charges[k].cents / last.cents;
    if (ratio >= TAIL_RATIO.min && ratio <= TAIL_RATIO.max) return [...chain, k];
  }
  return chain;
}

function bestChain(charges: Charge[]): { chain: number[]; cycle: CycleName } | null {
  let best: { chain: number[]; cycle: CycleName } | null = null;
  for (const cycle of ["monthly", "yearly"] as const) {
    const base = longestChain(charges, cycle);
    if (!base) continue;
    const chain = extendTail(charges, base, cycle);
    if (!best || chain.length > best.chain.length) best = { chain, cycle };
  }
  return best;
}

// ---------- scoring ----------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function countScore(n: number): number {
  if (n >= 5) return 1;
  if (n === 4) return 0.95;
  if (n === 3) return 0.8;
  return 0.5;
}

// Calendar months run 28 to 31 days; that spread should not look irregular.
function regularity(intervals: number[], cycle: CycleName): number {
  const { nominal, free, scale } = CYCLES[cycle];
  const miss = intervals.map((d) => Math.max(0, Math.abs(d - nominal) - free) / scale);
  return clamp01(1 - miss.reduce((a, b) => a + b, 0) / miss.length);
}

function spreadOf(amounts: number[]): number {
  return (Math.max(...amounts) - Math.min(...amounts)) / Math.max(...amounts);
}

function stability(amounts: number[]): number {
  return clamp01(1 - spreadOf(amounts) / 0.3);
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.6) return "Medium";
  return "Low";
}

// ---------- dates ----------

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// The same day next month (clamped to month length) or next year, in UTC so tests don't depend on the machine's zone.
function addCycle(ms: number, cycle: CycleName): number {
  const d = new Date(ms);
  const months = cycle === "monthly" ? 1 : 12;
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const day = Math.min(d.getUTCDate(), daysInUtcMonth(year, month));
  return Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

export function estimateNext(lastChargedAt: number, cycle: CycleName, now: number): number {
  let next = addCycle(lastChargedAt, cycle);
  for (let i = 0; i < 60 && next < now; i++) next = addCycle(next, cycle);
  return next;
}

// ---------- reason sentence ----------

function gapText(intervals: number[], cycle: CycleName): string {
  if (cycle === "yearly") return "about a year apart";
  const m = Math.round(median(intervals));
  return `about ${m >= 28 && m <= 32 ? 30 : m} days apart`;
}

function reasonText(amounts: number[], intervals: number[], cycle: CycleName, priceChanged: boolean, previous: number): string {
  const n = amounts.length;
  const latest = amounts[n - 1];
  const gap = gapText(intervals, cycle);
  if (priceChanged) {
    const verb = latest > previous ? "went from" : "dropped from";
    return `${n} charges ${gap}; the price ${verb} ${formatCents(previous)} to ${formatCents(latest)}`;
  }
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  if (lo === hi) return `${n} charges of ${formatCents(latest)} ${gap}`;
  return `${n} charges from ${formatCents(lo)} to ${formatCents(hi)} ${gap}`;
}

// ---------- detection ----------

function mode(values: string[], tieBreak: string): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = tieBreak;
  let bestCount = counts.get(tieBreak) ?? 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function toCandidate(
  key: string,
  charges: Charge[],
  total: number,
  found: { chain: number[]; cycle: CycleName },
  opts: DetectOptions,
): DiscoveryCandidate | null {
  const { cycle } = found;
  const chain = found.chain.map((i) => charges[i]);
  const n = chain.length;
  const coverage = n / total;
  // Frequent merchants (coffee, groceries) produce accidental pairs; real subscriptions are most of what a merchant charges.
  if (n < 3 && coverage < 0.5) return null;

  const amounts = chain.map((c) => c.cents);
  const latest = amounts[n - 1];
  if (latest > MAX_CHARGE_CENTS) return null;
  const intervals = chain.slice(1).map((c, i) => daysBetween(chain[i].t, c.t));
  const previous = median(amounts.slice(0, -1));
  const priceChanged = Math.abs(latest - previous) / previous > PRICE_CHANGE_THRESHOLD;

  const lastChargedAt = chain[n - 1].t;
  const txCategory = mode(chain.map((c) => c.category), chain[n - 1].category);
  const merchant = mode(chain.map((c) => displayMerchant(c.raw)), displayMerchant(chain[n - 1].raw));
  const { kind, basis } = inferKind(key, txCategory);
  const group = groupForKind(kind);
  // An unknown merchant in a spending category (shops, restaurants, rides) needs a third charge,
  // and a price that barely moves, before a repeat means anything: similar-looking purchases a
  // month apart happen by chance.
  if (basis === "fallback" && (n < 3 || spreadOf(amounts) > STABLE_SPREAD)) return null;

  let confidence =
    (0.45 * countScore(n) + 0.3 * regularity(intervals, cycle) + 0.25 * stability(amounts)) *
    (0.5 + 0.5 * coverage) *
    (group === "bill" ? 1 : categoryPrior(kind, txCategory));

  // A subscription that stopped charging is probably cancelled.
  const cycleDays = CYCLES[cycle].nominal;
  const quiet = (opts.now - lastChargedAt) / DAY;
  if (quiet > cycleDays * 3) return null;
  if (quiet > cycleDays * 1.5) confidence *= 0.75;
  confidence = round2(clamp01(confidence));

  const guarded = (opts.guardedMerchants ?? []).some((g) => merchantsMatch(g, merchant));
  return {
    key,
    merchant,
    category: categoryForKind(kind, key),
    amountCents: latest,
    cycle,
    occurrences: n,
    lastChargedAt,
    nextExpectedAt: estimateNext(lastChargedAt, cycle, opts.now),
    confidence,
    reason: reasonText(amounts, intervals, cycle, priceChanged, previous),
    source: "rules",
    alreadyGuarded: guarded,
    priceChanged,
    kind,
    group,
    kindBasis: basis,
    previousAmountCents: priceChanged ? Math.round(previous) : null,
  };
}

export function sortCandidates(list: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return [...list].sort((a, b) => b.confidence - a.confidence || b.amountCents - a.amountCents || a.merchant.localeCompare(b.merchant));
}

// Rules-only detection over a transaction history.
export function detectRecurring(txs: readonly RawTransaction[], opts: DetectOptions): DiscoveryCandidate[] {
  const groups = new Map<string, Charge[]>();
  for (const t of txs) {
    if (t.amountCents >= 0) continue; // income and refunds
    if (t.status === "blocked") continue;
    const category = t.category.toLowerCase();
    if (category === "transfer" || category === "income") continue;
    if (t.occurredAt > opts.now + DAY) continue;
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ t: t.occurredAt, cents: -t.amountCents, raw: t.merchant, category });
    groups.set(key, list);
  }

  const out: DiscoveryCandidate[] = [];
  for (const [key, list] of groups) {
    const charges = dedupe(list.sort((a, b) => a.t - b.t));
    const found = bestChain(charges);
    if (!found) continue;
    const candidate = toCandidate(key, charges, charges.length, found, opts);
    if (candidate && candidate.confidence >= MIN_CONFIDENCE) out.push(candidate);
  }
  return sortCandidates(out).slice(0, MAX_CANDIDATES);
}

// The public shape, without the extra fields.
export function toDiscovered(c: DiscoveryCandidate): DiscoveredSubscription {
  return {
    merchant: c.merchant,
    category: c.category,
    amountCents: c.amountCents,
    cycle: c.cycle,
    occurrences: c.occurrences,
    lastChargedAt: c.lastChargedAt,
    nextExpectedAt: c.nextExpectedAt,
    confidence: c.confidence,
    reason: c.reason,
    source: c.source,
    alreadyGuarded: c.alreadyGuarded,
    priceChanged: c.priceChanged,
  };
}

// ---------- Jev: borderline candidates ----------

export const MAX_JEV_CANDIDATES = 12;

// Sure enough that asking would only add latency: a clear kind and a high score.
export function isBorderline(c: DiscoveryCandidate): boolean {
  return c.source === "rules" && (c.confidence < BORDERLINE_BELOW || c.kind === "other");
}

const KIND_CRITERIA: Record<SubscriptionKind, string> = {
  streaming: "Video streaming, such as Netflix, Hulu or Disney+.",
  music: "Music or audio streaming, such as Spotify or Apple Music.",
  fitness: "A gym, studio or fitness app membership.",
  software: "Software, cloud storage, an AI tool or an app subscription.",
  news: "A newspaper, magazine or newsletter subscription.",
  shopping_membership: "A retail or delivery membership, such as Prime, Costco or a meal kit.",
  utility_bill: "A utility, phone, internet, insurance or loan payment.",
  housing: "Rent or a mortgage payment.",
  other: "A recurring charge that fits none of the other kinds.",
};

export interface JevRequest {
  state: unknown;
  questions: Record<string, { type: "noul"; instructions: string } | { type: "choice"; instructions: string; criteria: Record<string, string> }>;
  keys: string[]; // keys[i] is the merchant behind candidate "c{i}"
}

// One batched request: a "noul" and a "choice" question per candidate.
export function buildJevRequest(borderline: DiscoveryCandidate[]): JevRequest {
  const picked = borderline.slice(0, MAX_JEV_CANDIDATES);
  const questions: JevRequest["questions"] = {};
  picked.forEach((c, i) => {
    questions[`c${i}_is_subscription`] = {
      type: "noul",
      instructions: `Is candidate c${i} in the state a cancellable consumer subscription or membership (not rent, a utility or a loan)?`,
    };
    questions[`c${i}_kind`] = {
      type: "choice",
      instructions: `Which kind of recurring charge is candidate c${i} in the state?`,
      criteria: KIND_CRITERIA,
    };
  });
  return {
    state: {
      task: "Recurring charges found in a US college student's bank history. Decide what each one is.",
      candidates: picked.map((c, i) => ({
        id: `c${i}`,
        merchant: c.merchant,
        amount: formatCents(c.amountCents),
        cycle: c.cycle,
        charges_found: c.occurrences,
        reason: c.reason,
        rules_guess: c.kind,
      })),
    },
    questions,
    keys: picked.map((c) => c.key),
  };
}

// support is how strongly Jev backs our classification (0..1). Agreement closes up to 60% of
// the gap to certainty; disagreement scales confidence down to 40% of what it was.
function blend(confidence: number, support: number): number {
  if (support >= 0.5) return confidence + (1 - confidence) * 0.6 * (2 * support - 1);
  return confidence * (0.4 + 1.2 * support);
}

export interface JevAnswerLike {
  noul?: number;
  choice?: string;
  confidence?: number;
}

// Blends Jev's answers into candidates the rules already found. Jev can re-label, nudge
// confidence or push a candidate under the floor, but it can never add one.
export function applyJevAnswers(
  all: DiscoveryCandidate[],
  keys: string[],
  answers: Record<string, JevAnswerLike | undefined>,
): DiscoveryCandidate[] {
  const index = new Map(keys.map((k, i) => [k, i]));
  const out: DiscoveryCandidate[] = [];
  for (const c of all) {
    const i = index.get(c.key);
    if (i === undefined) {
      out.push(c);
      continue;
    }
    const noul = answers[`c${i}_is_subscription`]?.noul;
    const p = typeof noul === "number" && noul >= 0 && noul <= 1 ? noul : null;
    const kindAnswer = answers[`c${i}_kind`];
    const jevKind = SUBSCRIPTION_KINDS.find((k) => k === kindAnswer?.choice) ?? null;
    if (p === null && jevKind === null) {
      out.push(c);
      continue;
    }

    // A strong merchant keyword only gives way to a confident Jev answer.
    const kindConfidence = kindAnswer?.confidence;
    const adopt = jevKind !== null && (c.kindBasis !== "keyword" || kindConfidence === undefined || kindConfidence >= 0.7);
    const kind = adopt && jevKind ? jevKind : c.kind;
    const group = groupForKind(kind);
    let confidence = c.confidence;
    if (p !== null) confidence = blend(confidence, group === "subscription" ? p : 1 - p);
    confidence = round2(clamp01(confidence));
    if (confidence < MIN_CONFIDENCE) continue;
    out.push({
      ...c,
      kind,
      group,
      category: categoryForKind(kind, c.key),
      confidence,
      source: "rules+jev",
    });
  }
  return sortCandidates(out);
}
