// Pure text helpers for the Vera agent: fuzzy name matching, dollar amounts, yes/no parsing
// and the keyword intent fallback. No DB, no network. Everything here is the deterministic
// floor the agent falls back to when Jev and the LLM are both unavailable.

import type { AgentContext, Intent, RawParams, ToolName } from "./types";

// ---------- normalising ----------

// Lowercase, drop apostrophes, turn every other symbol into a space.
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "Hey Vera, please cancel Netflix" -> "cancel netflix" (on already-normalised text).
export function stripLead(q: string): string {
  return q
    .replace(/^(?:(?:hey|hi|hello|ok|okay|yo)\s+)?vera\s+/, "")
    .replace(/^(?:please|pls|kindly)\s+/, "")
    .trim();
}

export function wordCount(s: string): number {
  const n = norm(s);
  return n ? n.split(" ").length : 0;
}

// ---------- fuzzy name matching ----------

// Words too common inside names to identify one on their own ("Emergency Fund", "Student Loan").
const GENERIC = new Set([
  "the", "and", "for", "fund", "card", "credit", "loan", "student", "plan", "pass", "account", "with",
  "from", "that", "this", "new", "cloud", "creative", "premium", "plus", "pro", "music", "video", "tv",
  "app", "club", "membership", "subscription",
]);

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function closeEnough(a: string, b: string): boolean {
  return editDistance(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
}

export interface NameMatch {
  match: string | null;
  // Set when several names tie for best, so the caller can ask which one.
  ambiguous: string[];
}

// Finds which of `names` the text refers to: the whole name, one of its distinctive words,
// or a near-miss spelling of one. Works for a whole sentence or a single extracted value.
export function findNameInText(text: string, names: string[]): NameMatch {
  const t = norm(text);
  if (!t) return { match: null, ambiguous: [] };
  const words = t.split(" ");
  const padded = ` ${t} `;
  const scored: Array<{ name: string; score: number }> = [];
  for (const name of names) {
    const nn = norm(name);
    if (!nn) continue;
    let score = 0;
    if (padded.includes(` ${nn} `)) {
      score = 100 + nn.length;
    } else {
      for (const tok of nn.split(" ")) {
        if (tok.length < 3 || GENERIC.has(tok)) continue;
        if (words.includes(tok)) score = Math.max(score, 70 + tok.length);
        else if (tok.length >= 5 && words.some((w) => w.length >= 5 && closeEnough(w, tok))) score = Math.max(score, 50 + tok.length);
      }
    }
    if (score > 0) scored.push({ name, score });
  }
  if (scored.length === 0) return { match: null, ambiguous: [] };
  const best = Math.max(...scored.map((s) => s.score));
  const top = [...new Set(scored.filter((s) => s.score === best).map((s) => s.name))];
  return top.length === 1 ? { match: top[0], ambiguous: [] } : { match: null, ambiguous: top };
}

export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------- dollar amounts ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// "two hundred fifty" -> 250, "a hundred" -> 100. null when any word isn't a number word.
export function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of tokens) {
    if (w === "a" || w === "and") continue;
    if (w in SMALL) {
      current += SMALL[w];
      seen = true;
    } else if (w in TENS) {
      current += TENS[w];
      seen = true;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
      seen = true;
    } else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else return null;
  }
  return seen ? total + current : null;
}

const NUMBER_WORDS = [...Object.keys(SMALL), ...Object.keys(TENS), "hundred", "thousand", "a", "and"].join("|");
const WORD_DOLLARS = new RegExp(`\\b((?:(?:${NUMBER_WORDS})[\\s-]+)+)(?:dollars?|bucks?)\\b`);

function toDollars(s: string): number | null {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;
}

// Dollars (not cents) mentioned in the text, or null. "$12.99", "12 dollars", "fifty bucks";
// with allowBare, also a plain number like "set food to 500".
export function extractDollars(text: string, opts: { allowBare?: boolean } = {}): number | null {
  const raw = text.toLowerCase();
  const sign = raw.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (sign) return toDollars(sign[1]);
  const unit = raw.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|usd)\b/);
  if (unit) return toDollars(unit[1]);
  const words = raw.replace(/-/g, " ").match(WORD_DOLLARS);
  if (words) {
    const n = wordsToNumber(words[1].trim().split(/\s+/));
    if (n !== null && n > 0) return n;
  }
  if (opts.allowBare) {
    const re = /(?<![\w.$])(\d[\d,]*(?:\.\d{1,2})?)(?![\w%]|\s*(?:days?|weeks?|months?|years?|percent|st|nd|rd|th)\b)/g;
    for (const m of raw.matchAll(re)) {
      const before = raw.slice(Math.max(0, m.index - 14), m.index);
      if (/(ending|ends|last (?:four|4)|digits?)\s*(?:in\s*)?$/.test(before)) continue;
      const n = toDollars(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

// "a 7 day free trial" -> 7. null when no trial length is mentioned.
export function extractTrialDays(text: string): number | null {
  const raw = text.toLowerCase().replace(/-/g, " ");
  const digits = raw.match(/(\d{1,3})\s*days?\b/);
  if (digits) return Number(digits[1]);
  const weeks = raw.match(/(\d{1,2})\s*weeks?\b/);
  if (weeks) return Number(weeks[1]) * 7;
  const wordWeeks = raw.match(/\b(one|two|three|four|five|six|eight)\s+weeks?\b/);
  if (wordWeeks) return SMALL[wordWeeks[1]] * 7;
  const wordDays = raw.match(new RegExp(`\\b(${Object.keys(SMALL).join("|")}|twenty|thirty)\\s+days?\\b`));
  if (wordDays) {
    const n = SMALL[wordDays[1]] ?? TENS[wordDays[1]];
    if (n) return n;
  }
  if (/\b(a|one)\s+week\b/.test(raw)) return 7;
  if (/\b(a|one)\s+month\b/.test(raw) && /trial|free/.test(raw)) return 30;
  return null;
}

// ---------- yes / no ----------

const NO_RE =
  /\b(no|nope|nah|nay|dont|do not|not|never|stop|wait|hold on|hold it|negative|abort|cancel that|forget it|wrong)\b/;
const YES_RE =
  /\b(yes|yeah|yep|yup|yea|sure|ok|okay|okey|correct|confirm|confirmed|go ahead|go for it|do it|please do|absolutely|definitely|sounds good|thats right|affirmative|proceed|of course|certainly|alright|all right)\b/;
const UNSURE_RE = /\b(not sure|unsure|maybe|i dont know|dunno|hmm+|let me think|think about)\b/;
const NOT_A_NO_RE = /\b(no problem|no worries|no doubt|not a problem|not a bother|no hesitation)\b/g;

export type Confirmation = "yes" | "no" | "unclear";

// What did the person say to "Should I go ahead?" Only a clear answer counts; a sentence that
// both agrees and objects, sounds unsure, or runs on into a new request is "unclear".
export function parseConfirmation(transcript: string): Confirmation {
  const s = norm(transcript).replace(NOT_A_NO_RE, " ").replace(/\s+/g, " ").trim();
  if (!s) return "unclear";
  if (UNSURE_RE.test(s)) return "unclear";
  const hasNo = NO_RE.test(s);
  const hasYes = YES_RE.test(s);
  if (hasNo && hasYes) return "unclear";
  if (hasNo) return "no";
  if (hasYes) return s.split(" ").length <= 10 ? "yes" : "unclear";
  return "unclear";
}

// Any objection in the sentence ("no", "wait", "don't", "not")? A yes is never accepted past one.
export function hasNegation(transcript: string): boolean {
  return NO_RE.test(norm(transcript).replace(NOT_A_NO_RE, " "));
}

// Does the sentence contain any yes/no word at all? Used to tell "pause Spotify instead"
// (a new request) apart from a muddled answer.
export function hasConfirmationWords(transcript: string): boolean {
  const s = norm(transcript).replace(NOT_A_NO_RE, " ");
  return NO_RE.test(s) || YES_RE.test(s) || UNSURE_RE.test(s);
}

// ---------- intent: information question vs. command ----------

// "How do I cancel Netflix?" asks for information. "Can you cancel Netflix?" is a request.
export function isInformationQuestion(text: string): boolean {
  const s = stripLead(norm(text));
  if (!s) return false;
  if (/^(?:can|could|would|will)\s+(?:you|u)\b/.test(s)) return false;
  if (/^(?:i want|i need|i d like|id like|i would like|lets|let us)\b/.test(s)) return false;
  return /^(?:how|what|whats|why|when|where|which|who|whos|should|is|are|does|do|did|can|may|am|have|has|was|were|will|would|could)\b/.test(s);
}

type KeywordCtx = Pick<AgentContext, "subs" | "goals" | "debts" | "categories" | "flagged" | "budgets">;

const CANCEL_STRONG = /\b(cancel|unsubscribe|terminate)\b/;
const CANCEL_WEAK = /\b(close|end|kill|drop|delete|remove|get rid of|stop paying|stop charging|stop billing|stop payments?)\b/;
const PAUSE_STRONG = /\b(pause|freeze|suspend)\b/;
const PAUSE_WEAK = /\b(hold|lock|disable|deactivate)\b|\bturn\b.{0,30}\boff\b/;
const RESUME_STRONG = /\b(resume|unpause|unfreeze|reactivate)\b/;
const RESUME_WEAK = /\b(unlock|restart|enable|reopen)\b|\bturn\b.{0,30}\bon\b/;
const FRAUD_NO =
  /\b(that wasnt me|it wasnt me|wasnt me|not me|not mine|thats not mine|wasnt mine|i didnt (?:make|do|buy|authorize)|dont recognize|fraud|stolen|scam|unauthorized)\b/;
const FRAUD_YES =
  /\b(that was me|it was me|was me|thats mine|that was mine|its mine|i made (?:that|it|the)|i did (?:that|make|buy)|i bought (?:that|it)|yes it was|i recognize)\b/;
const REMEMBER = /\b(remember|keep in mind|make a note|take a note|note that|dont forget)\b/;
const FORGET = /\b(forget|stop remembering|unremember)\b|\bdelete (?:the |my )?(?:memory|note)/;

// The verbs of each tool, ignoring which thing they are applied to. "Is this a command at all?"
const CUES: Array<{ tool: ToolName; re: RegExp }> = [
  { tool: "answer_fraud_alert", re: new RegExp(`${FRAUD_YES.source}|${FRAUD_NO.source}`) },
  { tool: "remember", re: REMEMBER },
  { tool: "forget", re: FORGET },
  { tool: "cancel_subscription", re: CANCEL_STRONG },
  { tool: "pause_card", re: PAUSE_STRONG },
  { tool: "resume_card", re: RESUME_STRONG },
  { tool: "approve_new_price", re: /\b(approve|accept|allow)\b|\blet (?:it|that|the charge|the new price) (?:go )?through\b|\braise (?:the |its |their |my )?limit\b/ },
  { tool: "keep_blocking", re: /\bkeep\b.{0,20}\bblock|\b(reject|deny|refuse|decline)\b|\b(?:dont|do not) approve\b|\bblock (?:it|that|the)\b/ },
  { tool: "keep_after_trial", re: /\bkeep\b|\b(convert|continue|extend)\b.*\btrial\b/ },
  { tool: "set_budget", re: /\b(set|change|make|raise|lower|increase|decrease|update|adjust|cap|put|bump|cut|reduce)\b.*\bbudget\b|\bbudget\b.*\bto\b/ },
  { tool: "set_budget", re: /\b(set|change|lower|increase|decrease|adjust)\b.*\blimit\b/ },
  { tool: "add_to_goal", re: /\b(add|put|contribute|deposit|set aside|toss|throw|stash|save)\b.*\b(goal|fund|trip|laptop)\b/ },
  { tool: "pay_debt", re: /\b(pay|payment|pay off|pay down|paid)\b/ },
  { tool: "create_card", re: /\bnew (?:virtual )?card\b|\b(create|make|issue|generate|open|set up|setup|get me|give me)\b.*\b(?<!credit )(?<!debit )cards?\b/ },
  { tool: "find_subscriptions", re: /\b(find|scan|discover|detect|look for|search for|hunt for|uncover|check for|look through)\b.*\b(subscriptions?|recurring|memberships?)\b/ },
  { tool: "guard_subscriptions", re: /\b(guard|protect)\b/ },
  { tool: "cancel_subscription", re: CANCEL_WEAK },
  { tool: "pause_card", re: PAUSE_WEAK },
  { tool: "resume_card", re: RESUME_WEAK },
];

// True when the sentence contains a verb that one of the tools answers to.
export function hasActionCue(text: string): boolean {
  const q = stripLead(norm(text));
  return CUES.some((c) => c.re.test(q));
}

// Deterministic intent routing: the last resort when Jev and the LLM can't be used.
export function keywordIntent(text: string, ctx: KeywordCtx): Intent {
  const q = stripLead(norm(text));
  if (!q) return "question";
  if (isInformationQuestion(text)) return "question";

  const merchantHit = findNameInText(q, ctx.subs.map((s) => s.merchant)).match;
  const merchantSub = merchantHit ? ctx.subs.find((s) => s.merchant === merchantHit) : undefined;
  const goalHit = findNameInText(q, ctx.goals.map((g) => g.name)).match;
  const debtHit = findDebtInText(q, ctx.debts) !== null;

  if (REMEMBER.test(q)) return "remember";
  if (FORGET.test(q)) return "forget";
  if (FRAUD_NO.test(q) || FRAUD_YES.test(q)) return "answer_fraud_alert";
  if (CANCEL_STRONG.test(q)) return "cancel_subscription";
  if (PAUSE_STRONG.test(q)) return "pause_card";
  if (RESUME_STRONG.test(q)) return "resume_card";
  if (/\b(approve|accept|allow)\b/.test(q) && (/\b(price|increase|hike|charge|raise|higher)\b/.test(q) || merchantSub?.pendingCharge)) {
    return "approve_new_price";
  }
  if (/\braise (?:the |its |their |my )?limit\b|\blet (?:it|that|the charge|the new price) (?:go )?through\b/.test(q)) return "approve_new_price";
  if (
    /\bkeep\b.{0,20}\bblock/.test(q) ||
    /\b(reject|deny|refuse|decline)\b.*\b(price|increase|hike|charge|it|that)\b/.test(q) ||
    /\b(?:dont|do not) approve\b/.test(q) ||
    /\bblock (?:it|that|the (?:new )?(?:price|charge|increase))\b/.test(q)
  ) {
    return "keep_blocking";
  }
  const trialSub = merchantSub && (merchantSub.kind === "trial" || merchantSub.status === "trial_ended");
  if ((/\bkeep\b/.test(q) && (/\btrial\b/.test(q) || trialSub)) || /\b(convert|continue|extend)\b.*\btrial\b/.test(q)) {
    return "keep_after_trial";
  }
  if (CUES.find((c) => c.tool === "set_budget")!.re.test(q) || (/\b(limit|budget)\b/.test(q) && /\b(set|change|raise|lower)\b/.test(q) && findCategoryInText(q, ctx.categories))) {
    return "set_budget";
  }
  if (CUES.find((c) => c.tool === "add_to_goal")!.re.test(q) || (/\b(add|put|contribute|deposit|set aside|save|stash|move)\b/.test(q) && (goalHit || /\bgoal\b/.test(q)))) {
    return "add_to_goal";
  }
  if (/\b(pay|payment|pay off|pay down|paid)\b/.test(q) && (debtHit || /\b(debt|loan|credit card|card balance|balance)\b/.test(q))) return "pay_debt";
  if (/\b(find|scan|discover|detect|look for|search for|hunt for|uncover|check for|look through)\b.*\b(subscriptions?|recurring|memberships?)\b/.test(q)) {
    return "find_subscriptions";
  }
  if (/\b(guard|protect)\b/.test(q)) return "guard_subscriptions";
  if (CUES.find((c) => c.tool === "create_card")!.re.test(q) && !/\b(pay|payment)\b/.test(q)) return "create_card";
  if (merchantHit) {
    if (CANCEL_WEAK.test(q)) return "cancel_subscription";
    if (PAUSE_WEAK.test(q)) return "pause_card";
    if (RESUME_WEAK.test(q)) return "resume_card";
  }
  return "question";
}

// ---------- entities: categories and debts ----------

const CATEGORY_SYNONYMS: Record<string, string> = {
  groceries: "food", grocery: "food", dining: "food", restaurants: "food", restaurant: "food", "eating out": "food", coffee: "food",
  gas: "transport", fuel: "transport", transportation: "transport", car: "transport", rideshare: "transport", uber: "transport",
  rent: "housing", mortgage: "housing", apartment: "housing", home: "housing",
  fun: "entertainment", movies: "entertainment", games: "entertainment", gaming: "entertainment",
  clothes: "shopping", clothing: "shopping", amazon: "shopping",
  electric: "utilities", electricity: "utilities", internet: "utilities", phone: "utilities", bills: "utilities",
  subs: "subscriptions", streaming: "subscriptions",
};

// Which budget category a phrase refers to, or null.
export function findCategoryInText(text: string, categories: string[]): string | null {
  const t = norm(text);
  if (!t) return null;
  const padded = ` ${t} `;
  for (const c of categories) if (padded.includes(` ${norm(c)} `)) return c;
  for (const [syn, canon] of Object.entries(CATEGORY_SYNONYMS)) {
    if (padded.includes(` ${syn} `)) {
      const hit = categories.find((c) => norm(c) === canon);
      if (hit) return hit;
    }
  }
  const fuzzy = findNameInText(t, categories);
  return fuzzy.match;
}

const DEBT_KIND_WORDS: Array<{ re: RegExp; kind: string }> = [
  { re: /\bcredit cards?\b|\bcard balance\b/, kind: "credit_card" },
  { re: /\bstudent loans?\b|\bfederal loan\b/, kind: "student_loan" },
  { re: /\bauto loan\b|\bcar loan\b|\bcar payment\b/, kind: "auto_loan" },
  { re: /\bpersonal loan\b/, kind: "personal_loan" },
  { re: /\bmortgage\b/, kind: "mortgage" },
];

// Which debt a phrase refers to, by name or by kind ("my credit card"). Null when none or ambiguous.
export function findDebtInText(text: string, debts: Array<{ name: string; kind: string }>): string | null {
  const byName = findNameInText(text, debts.map((d) => d.name));
  if (byName.match) return byName.match;
  const q = norm(text);
  for (const { re, kind } of DEBT_KIND_WORDS) {
    if (!re.test(q)) continue;
    const ofKind = debts.filter((d) => d.kind === kind);
    if (ofKind.length === 1) return ofKind[0].name;
  }
  return null;
}

// ---------- deterministic parameter extraction ----------

function afterKeyword(text: string, re: RegExp): string | null {
  const m = text.match(re);
  const v = m?.[1]?.trim().replace(/[.!?]+$/, "").trim();
  return v ? v.slice(0, 200) : null;
}

// Pulls tool parameters out of the sentence without an LLM. The values are only candidates:
// validateAction checks every one of them against the user's real data.
export function extractParamsDeterministic(tool: ToolName, text: string, ctx: KeywordCtx): RawParams {
  const q = stripLead(norm(text));
  switch (tool) {
    case "cancel_subscription":
    case "pause_card":
    case "resume_card":
    case "approve_new_price":
    case "keep_blocking":
    case "keep_after_trial": {
      const hit = findNameInText(q, ctx.subs.map((s) => s.merchant));
      return hit.match ? { merchant: hit.match } : {};
    }
    case "create_card": {
      const merchantRaw =
        text.match(/\b(?:card|subscription)\s+(?:for|to|at)\s+(.+?)(?=\s+(?:with|and|that|which|limited|limit|capped|for|at|of|using|so)\b|[,.;!?]|$)/i)?.[1] ??
        text.match(/\bnew\s+(?:virtual\s+)?(.+?)\s+card\b/i)?.[1] ??
        null;
      const merchant = merchantRaw
        ? titleCase(merchantRaw.replace(/^(?:a|an|the|my)\s+/i, "").replace(/(?:\s+(?:please|thanks|thank you|now|today|okay|ok))+$/i, "")) || null
        : null;
      const dollars = extractDollars(text, { allowBare: true });
      const trial = /\btrial\b|\bfree\b/i.test(text) ? extractTrialDays(text) : null;
      return {
        ...(merchant ? { merchant } : {}),
        ...(dollars !== null ? { monthly_limit_dollars: dollars } : {}),
        ...(trial !== null ? { trial_days: trial } : {}),
      };
    }
    case "set_budget": {
      const category = findCategoryInText(q, ctx.categories);
      const dollars = extractDollars(text, { allowBare: true });
      return { ...(category ? { category } : {}), ...(dollars !== null ? { monthly_limit_dollars: dollars } : {}) };
    }
    case "add_to_goal": {
      const goal = findNameInText(q, ctx.goals.map((g) => g.name));
      const dollars = extractDollars(text, { allowBare: true });
      return { ...(goal.match ? { goal_name: goal.match } : {}), ...(dollars !== null ? { dollars } : {}) };
    }
    case "pay_debt": {
      const debt = findDebtInText(q, ctx.debts);
      const dollars = extractDollars(text, { allowBare: true });
      return { ...(debt ? { debt_name: debt } : {}), ...(dollars !== null ? { dollars } : {}) };
    }
    case "answer_fraud_alert":
      return { was_me: FRAUD_NO.test(q) ? false : FRAUD_YES.test(q) ? true : undefined };
    case "remember": {
      const fact = afterKeyword(text, /\b(?:remember|keep in mind|make a note|take a note|note|dont forget|don't forget)(?:\s+that)?[:,]?\s+(.+)$/i);
      return fact ? { fact } : {};
    }
    case "forget": {
      const frag = afterKeyword(text, /\b(?:forget|stop remembering|unremember)(?:\s+(?:about|that|the fact that|what i said about))?[:,]?\s+(.+)$/i);
      return frag ? { fact_substring: frag } : {};
    }
    default:
      return {};
  }
}
