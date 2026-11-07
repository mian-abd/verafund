// Preset commands: the phrases Vera must get right every single time, recognised with plain
// pattern matching. No network call, so they are instant and work offline. Parameters are
// resolved against the workspace's real merchants, goals, debts and categories with fuzzy
// matching. A preset only picks the tool and gathers candidate parameters; validateAction still
// checks them and the user still has to confirm. Anything that matches no preset goes to Jev,
// then the LLM, then keyword rules (see intent.ts).

import { extractDollars, findCategoryInText, findDebtInText, findNameInText, norm, stripLead } from "./text";
import type { AgentContext, RawParams, ToolName } from "./types";

export type PresetCtx = Pick<AgentContext, "subs" | "goals" | "debts" | "categories" | "flagged" | "budgets">;

export type PresetMatch =
  | { kind: "tool"; tool: ToolName; raw: RawParams; label: string }
  | { kind: "recall"; label: string };

const tool = (t: ToolName, raw: RawParams, label: string): PresetMatch => ({ kind: "tool", tool: t, raw, label });

// "Hey Vera, can you please cancel Netflix for me?" -> "cancel netflix"
export function stripPreamble(text: string): string {
  let s = norm(text);
  for (let i = 0; i < 5; i++) {
    const next = stripLead(s)
      .replace(/^(?:just|now|and|so|then|go ahead and|yes|yeah|yep|yup|sure|okay|ok)\s+/, "")
      .replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/, "")
      .replace(/^(?:i\s+(?:want|need|would like|wanna)(?:\s+you)?\s+to|i\s*d like(?:\s+you)?\s+to|id like(?:\s+you)?\s+to|lets|let us)\s+/, "")
      .replace(/\s+(?:please|pls|thanks|thank you|for me|right now|now|too|also|today)$/, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

// "my netflix subscription" -> "netflix"
// Vera asked a follow-up about a new card ("Which company is the new card for?"); fold the
// short reply into a full command so "Claude, $20 a month" finishes the request.
export function continueCreateCard(reply: string, lastAssistant: string | undefined): string | null {
  if (!lastAssistant) return null;
  const answer = reply.trim().replace(/^(?:it'?s\s+|its\s+|for\s+|the\s+)/i, "").replace(/[.!?]+$/, "");
  if (!answer || answer.split(/\s+/).length > 12) return null;
  if (/^Which company is the new card for\?/.test(lastAssistant)) return `create a card for ${answer}`;
  const howMuch = lastAssistant.match(/^How much should the (.+?) card be allowed to charge each month\?/);
  if (howMuch && /\d/.test(answer)) return `create a card for ${howMuch[1]} at ${answer.startsWith("$") ? answer : `$${answer}`}`;
  return null;
}

function cleanRest(rest: string): string {
  return rest
    .replace(/^(?:the\s+card\s+for\s+|my\s+|the\s+|our\s+|that\s+|this\s+|a\s+|an\s+)+/, "")
    .replace(/\s+(?:subscription|membership|account|plan|card|please|thanks)$/g, "")
    .trim();
}

const IT = /^(?:it|that|this|them|that one|this one|the new one)?$/;

// ---------- remember / forget / recall (matched on the raw text so the fact keeps its wording) ----------

const PRE = String.raw`^\s*(?:(?:hey|hi|hello|ok|okay|yo)[\s,]+)?(?:vera[\s,]+)?(?:please[\s,]+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:i\s+(?:want|need|would\s+like)\s+you\s+to\s+)?`;
const REMEMBER_RE = new RegExp(
  PRE + String.raw`(?:remember|keep\s+in\s+mind|make\s+a\s+note|take\s+a\s+note|note|don'?t\s+forget|do\s+not\s+forget)(?:\s+that)?[:,]?\s+(\S[\s\S]*)$`,
  "i",
);
const FORGET_RE = new RegExp(PRE + String.raw`(?:forget|stop\s+remembering|unremember)(?:\s+(?:about|that|the\s+fact\s+that))?[:,]?\s+(\S[\s\S]*)$`, "i");
const RECALL_RES = [
  /^(?:what|which)(?: things| facts| all)?\s+(?:do|did|can)\s+you\s+(?:remember|recall)\b/,
  /^what\s+do\s+you\s+know\s+about\s+me\b/,
  /^what\s+have\s+i\s+(?:told|asked)\s+you(?:\s+to\s+remember)?\b/,
  /^(?:show|list|tell)\s+(?:me\s+)?(?:what\s+you\s+remember|your\s+memories|my\s+memories|what\s+you\s+know\s+about\s+me)\b/,
  /^what\s+(?:are|were)\s+(?:my|your)\s+memories\b/,
];
// "forget it" is just a figure of speech, not a request to delete a memory.
const NOT_A_MEMORY = /^(?:it|that|this|them|about it|about that)$/;

// ---------- fraud ----------

const SUBJECT = String.raw`(?:that|it|this|thats|its)`;
const FRAUD_YES = new RegExp(String.raw`^${SUBJECT}\s+(?:was\s+|is\s+|s\s+)?(?:me|mine|my\s+(?:purchase|charge))\b|^i\s+(?:made|did|bought|recognize)\s+(?:that|it|this)\b`);
const FRAUD_NO = new RegExp(
  String.raw`^${SUBJECT}\s+(?:was\s+not|wasnt|is\s+not|isnt|aint|not)\s+(?:me|mine)\b|^not\s+(?:me|mine)\b|^i\s+(?:didnt|did\s+not)\s+(?:make|do|buy|authorize|recognize)\s+(?:that|it|this)\b|^${SUBJECT}\s+(?:is\s+|was\s+|s\s+)?fraud\b|^(?:this|that)\s+is\s+fraud\b|^dont\s+recognize\b`,
);

function fraudPreset(q: string): PresetMatch | null {
  const noPrefix = /^(?:no|nope|nah)\s+/.test(q);
  const body = q.replace(/^(?:no|nope|nah)\s+/, "");
  const yes = FRAUD_YES.test(body);
  const no = FRAUD_NO.test(body);
  if (!yes && !no) return null;
  // "no that was me" is ambiguous (is the no an answer to something else?): ask rather than guess.
  if (yes && noPrefix) return tool("answer_fraud_alert", {}, "fraud alert");
  return tool("answer_fraud_alert", { was_me: yes }, "fraud alert");
}

// ---------- the matcher ----------

export function matchPreset(text: string, ctx: PresetCtx): PresetMatch | null {
  const original = text.trim();
  if (!original) return null;
  const q = stripPreamble(original);
  if (!q) return null;
  const merchants = ctx.subs.map((s) => s.merchant);
  const findMerchant = (s: string) => findNameInText(s, merchants);

  // Memory comes first: "remember that I want to cancel Netflix" is a memory, not a cancellation.
  const rem = original.match(REMEMBER_RE);
  if (rem) return tool("remember", { fact: rem[1].trim().replace(/[.!?]+$/, "") }, "remember");
  const forget = original.match(FORGET_RE);
  if (forget) {
    const frag = forget[1].trim().replace(/[.!?]+$/, "");
    if (!NOT_A_MEMORY.test(norm(frag))) return tool("forget", { fact_substring: frag }, "forget");
  }
  if (RECALL_RES.some((re) => re.test(q))) return { kind: "recall", label: "what do you remember" };

  const fraud = fraudPreset(q);
  if (fraud) return fraud;

  if (/^(?:find|discover|detect|scan|look\s+for|search\s+for|hunt\s+for|check\s+for|look\s+through|uncover)\b.*\b(?:subscriptions?|recurring|memberships?)\b/.test(q)) {
    return tool("find_subscriptions", {}, "find subscriptions");
  }

  const guard = q.match(/^(?:guard|protect|secure)\s+(.+)$/);
  if (guard) {
    const rest = guard[1].trim();
    if (/^(?:them(?:\s+all)?|all(?:\s+of\s+them)?|everything|those|these|(?:all\s+(?:of\s+)?)?(?:my\s+|the\s+)?subscriptions|all\s+of\s+my\s+subscriptions)$/.test(rest)) {
      return tool("guard_subscriptions", {}, "guard them all");
    }
    const name = cleanRest(rest);
    return tool("guard_subscriptions", name ? { merchants: [name] } : {}, "guard one");
  }

  // ----- cards -----
  const strongCancel = q.match(/^(?:cancel|unsubscribe(?:\s+me)?(?:\s+from)?|terminate)(?:\s+(.*))?$/);
  if (strongCancel) return tool("cancel_subscription", merchantParams(strongCancel[1] ?? "", findMerchant), "cancel");

  const weakCancel = q.match(/^(?:stop|end|close|kill|drop|delete|remove|get\s+rid\s+of)\s+(?:paying\s+(?:for\s+)?|charging\s+me\s+for\s+|billing\s+me\s+for\s+|payments?\s+(?:to|for)\s+)?(.+)$/);
  if (weakCancel && findMerchant(weakCancel[1]).match) return tool("cancel_subscription", merchantParams(weakCancel[1], findMerchant), "cancel");

  const strongPause = q.match(/^(?:pause|freeze|suspend)(?:\s+(.*))?$/);
  if (strongPause) return tool("pause_card", merchantParams(strongPause[1] ?? "", findMerchant), "pause");
  const weakPause =
    q.match(/^(?:lock|hold|disable|deactivate)\s+(.+)$/) ??
    q.match(/^turn\s+off\s+(.+)$/) ??
    q.match(/^turn\s+(.+?)\s+off$/) ??
    q.match(/^put\s+(?:a\s+)?hold\s+on\s+(.+)$/);
  if (weakPause && findMerchant(weakPause[1]).match) return tool("pause_card", merchantParams(weakPause[1], findMerchant), "pause");

  const strongResume = q.match(/^(?:resume|unpause|unfreeze|reactivate)(?:\s+(.*))?$/);
  if (strongResume) return tool("resume_card", merchantParams(strongResume[1] ?? "", findMerchant), "resume");
  const weakResume =
    q.match(/^(?:unlock|restart|enable|reopen)\s+(.+)$/) ??
    q.match(/^turn\s+(?:back\s+)?on\s+(.+)$/) ??
    q.match(/^turn\s+(.+?)\s+(?:back\s+)?on$/);
  if (weakResume && findMerchant(weakResume[1]).match) return tool("resume_card", merchantParams(weakResume[1], findMerchant), "resume");

  // ----- price changes -----
  const keepBlocking =
    q.match(/^keep\s+(?:on\s+)?blocking(?:\s+(.*))?$/) ??
    q.match(/^keep\s+(?:it|that|the\s+charge|the\s+new\s+price|the\s+price)\s+blocked(?:\s+(.*))?$/) ??
    q.match(/^(?:reject|deny|refuse|decline)\s+(?:the\s+)?(?:new\s+)?(?:price|increase|hike|charge|it|that)(?:\s+(?:increase|hike|change|charge))?(?:\s+(?:for|from|on)\s+(.*))?$/) ??
    q.match(/^(?:dont|do\s+not)\s+approve(?:\s+(.*))?$/);
  if (keepBlocking) return tool("keep_blocking", pendingMerchant(keepBlocking[1] ?? "", findMerchant), "keep blocking");

  const approve = q.match(/^(?:approve|accept|allow)\s+(.+)$/);
  if (approve) {
    const rest = approve[1];
    const priceWord = /\b(?:price|increase|hike|charge|limit|raise|higher)\b/.test(rest);
    const merchantHit = findMerchant(rest).match;
    const hasPending = merchantHit ? ctx.subs.find((s) => s.merchant === merchantHit)?.pendingCharge : null;
    if (priceWord || IT.test(rest) || hasPending) return tool("approve_new_price", pendingMerchant(rest, findMerchant), "approve new price");
  }
  const letThrough = q.match(/^let\s+(?:it|that|the\s+charge|the\s+new\s+price|them)\s+(?:go\s+)?through(?:\s+(?:for\s+)?(.*))?$/) ?? q.match(/^raise\s+(?:the\s+|its\s+|their\s+|my\s+)?limit(?:\s+(?:on|for)\s+(.*))?$/);
  if (letThrough) return tool("approve_new_price", pendingMerchant(letThrough[1] ?? "", findMerchant), "approve new price");

  const keepTrial =
    q.match(/^keep\s+(.+?)\s+(?:after|past|beyond)\s+(?:the\s+|its\s+|my\s+)?(?:free\s+)?trial\b/) ??
    q.match(/^keep\s+(?:the\s+|my\s+)?(?:free\s+)?trial(?:\s+(?:for|of|on)\s+(.+))?$/) ??
    q.match(/^keep\s+(.+)$/);
  if (keepTrial) {
    const rest = keepTrial[1] ?? "";
    const hit = findMerchant(rest).match;
    const sub = hit ? ctx.subs.find((s) => s.merchant === hit) : undefined;
    const trialWord = /\btrial\b/.test(q);
    if (sub || trialWord) return tool("keep_after_trial", hit ? { merchant: hit } : {}, "keep after trial");
  }

  // ----- new cards -----
  const newCard =
    q.match(/^(?:create|make|add|set\s+up|open|issue|get(?:\s+me)?|give\s+me|i\s+(?:want|need))\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:virtual\s+|guarded\s+|separate\s+)?card(?:\s+(?:for|to\s+use\s+(?:for|with)|on)\s+(.+))?$/) ??
    q.match(/^(?:add|track|start\s+guarding|i\s+(?:just\s+)?(?:got|signed\s+up\s+for|subscribed\s+to))\s+(?:a\s+new\s+|my\s+new\s+|my\s+|a\s+|an\s+)?(.+?)\s+(?:subscription|membership|plan)\b.*$/) ??
    q.match(/^(?:new|another)\s+(?:virtual\s+)?card\s+for\s+(.+)$/);
  if (newCard) {
    const rest = (newCard[1] ?? "")
      .replace(/\s*(?:,\s*)?(?:at|for|with|of|costing|that\s+costs|which\s+costs|limited\s+to|limit|capped\s+at)?\s*\$?\d[\d,.]*\s*(?:dollars?|bucks|usd)?\b.*$/, "")
      .replace(/\s+(?:a|per|each)\s+(?:month|year)\b.*$/, "")
      .replace(/\s+with\s+(?:a\s+)?\d+[-\s]day.*$/, "")
      .replace(/(?:\s+(?:with|at|for|and|of|limited\s+to|capped\s+at)(?:\s+(?:a|an|the))?)+\s*$/, "");
    const merchant = cleanRest(rest);
    const dollars = extractDollars(original, { allowBare: true });
    const trial = q.match(/\b(\d{1,2})[-\s]day\s+(?:free\s+)?trial\b/);
    return tool(
      "create_card",
      {
        ...(merchant ? { merchant } : {}),
        ...(dollars !== null ? { monthly_limit_dollars: dollars } : {}),
        ...(trial ? { trial_days: Number(trial[1]) } : {}),
      },
      "create card",
    );
  }

  // ----- money -----
  const budget =
    q.match(/^(?:set|change|make|update|adjust|raise|lower|increase|decrease|cap|put|bump|cut|reduce)\s+(?:my\s+|the\s+|our\s+)?(.+?)\s+(?:budget|limit)\b(.*)$/) ??
    q.match(/^(?:set|change|update|adjust)\s+(?:my\s+|the\s+)?budget\s+(?:for|on)\s+(.+?)\s+(?:to|at)\b(.*)$/);
  if (budget) {
    const category = findCategoryInText(budget[1], ctx.categories);
    if (category || /\bbudget\b/.test(q)) {
      // "raise my food budget by $50" is relative: don't turn $50 into the new limit.
      const relative = /\bby\s+(?:\$|\d|a\b)/.test(q) || /\b(?:more|less)\b/.test(budget[2] ?? "");
      const dollars = relative ? null : extractDollars(original, { allowBare: true });
      return tool("set_budget", { ...(category ? { category } : {}), ...(dollars !== null ? { monthly_limit_dollars: dollars } : {}) }, "set budget");
    }
  }

  if (/^(?:put|add|save|set\s+aside|contribute|deposit|move|throw|toss|stash|transfer)\b/.test(q)) {
    const goal = findNameInText(q, ctx.goals.map((g) => g.name));
    if (goal.match || goal.ambiguous.length > 1 || /\bgoal\b/.test(q)) {
      const dollars = extractDollars(original, { allowBare: true });
      return tool("add_to_goal", { ...(goal.match ? { goal_name: goal.match } : {}), ...(dollars !== null ? { dollars } : {}) }, "add to goal");
    }
  }

  if (/^(?:pay|send|make\s+(?:a\s+)?payment)\b/.test(q)) {
    const debt = findDebtInText(q, ctx.debts);
    if (debt) {
      const dollars = extractDollars(original, { allowBare: true });
      return tool("pay_debt", { debt_name: debt, ...(dollars !== null ? { dollars } : {}) }, "pay debt");
    }
  }

  return null;
}

// "netflix" / "my netflix subscription" -> { merchant: "Netflix" }. An unknown name is passed on as
// typed so the validator can say "I couldn't find ...", and ties are passed on so it can ask which one.
function merchantParams(rest: string, find: (s: string) => { match: string | null }): RawParams {
  const cleaned = cleanRest(rest);
  if (!cleaned) return {};
  const hit = find(cleaned).match;
  return { merchant: hit ?? cleaned };
}

// Price-change answers may omit the merchant: with exactly one pending charge, the validator picks it.
function pendingMerchant(rest: string, find: (s: string) => { match: string | null }): RawParams {
  const cleaned = cleanRest(rest.replace(/^(?:the\s+)?(?:new\s+)?(?:price|increase|hike|charge)(?:\s+(?:for|from|on))?\s*/, ""));
  if (!cleaned || IT.test(cleaned)) return {};
  const hit = find(cleaned).match;
  return hit ? { merchant: hit } : {};
}
