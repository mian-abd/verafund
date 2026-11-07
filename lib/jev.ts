// Optional TypeSafe Jev triage. Jev is a fast decision model: POST /v1/systemone
// takes { model, state, questions } and answers typed questions (noul, choice, score).
// Docs: https://docs.typesafe.ai/api/system-one.md  (base URL https://api.typesafe.ai,
// header "Authorization: Bearer <key>", key in TYPESAFE_API_KEY).
//
// Jev never decides anything. Its answers come back as evidence rows with 0 points,
// so the rule score in lib/fraud.ts is the only thing that sets the status. If the
// key is missing, the call is slow (2s timeout) or anything goes wrong, we return
// no evidence and say nothing.

import { formatCents } from "./format";
import type { PurchaseInput, RiskSignal } from "./fraud";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
export const JEV_TIMEOUT_MS = 2_000;

const FRAUD_TYPES: Record<string, string> = {
  legitimate: "A normal purchase the account holder would plausibly make themselves.",
  stolen_card: "Someone using stolen card details for a purchase the owner did not make.",
  scam_or_phishing: "The owner was tricked into paying a scammer, a fake shop or a fake investment.",
  card_testing: "A small or odd charge used to check whether stolen card details work.",
  account_takeover: "A criminal who has taken over the account moving money out.",
};

const FRAUD_TYPE_LABELS: Record<string, string> = {
  legitimate: "looks legitimate",
  stolen_card: "stolen card",
  scam_or_phishing: "scam or phishing",
  card_testing: "card testing",
  account_takeover: "account takeover",
};

type JevAnswers = {
  likely_fraud?: { type?: string; noul?: number };
  fraud_type?: { type?: string; choice?: string; confidence?: number };
};

export function buildJevState(purchase: PurchaseInput, ruleSignals: RiskSignal[], ruleScore: number) {
  return {
    purchase: {
      merchant: purchase.merchant,
      amount: formatCents(purchase.amountCents),
      category: purchase.category,
      country: purchase.country,
    },
    account_holder: "US college student with a part-time campus job; usual spending is groceries, coffee, gas, rent, streaming",
    rule_engine: {
      score_out_of_100: ruleScore,
      signals: ruleSignals.map((s) => s.detail),
    },
  };
}

export function jevEvidence(answers: JevAnswers | undefined): RiskSignal[] {
  if (!answers) return [];
  const out: RiskSignal[] = [];
  const p = answers.likely_fraud?.noul;
  if (typeof p === "number" && p >= 0 && p <= 1) {
    out.push({
      signal: "jev_likely_fraud",
      points: 0,
      detail: `Jev model puts the chance this is fraud at ${Math.round(p * 100)}%. Advisory only: it does not change the score.`,
    });
  }
  const choice = answers.fraud_type?.choice;
  if (typeof choice === "string" && choice in FRAUD_TYPES) {
    const conf = answers.fraud_type?.confidence;
    out.push({
      signal: "jev_fraud_type",
      points: 0,
      detail: `Jev model reads this as: ${FRAUD_TYPE_LABELS[choice]}${typeof conf === "number" ? ` (${Math.round(conf * 100)}% confident)` : ""}. Advisory only.`,
    });
  }
  return out;
}

// Returns evidence rows to append to the rule signals, or [] when Jev is unavailable.
export async function jevTriage(purchase: PurchaseInput, ruleSignals: RiskSignal[], ruleScore: number): Promise<RiskSignal[]> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: JEV_MODEL,
        state: buildJevState(purchase, ruleSignals, ruleScore),
        questions: {
          likely_fraud: {
            type: "noul",
            instructions: "Is this card purchase likely to be fraud that the account holder did not make or authorize?",
          },
          fraud_type: {
            type: "choice",
            instructions: "Which kind of purchase is this, given the account holder and the purchase details?",
            criteria: FRAUD_TYPES,
          },
        },
      }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { answers?: JevAnswers };
    return jevEvidence(body.answers);
  } catch {
    return [];
  }
}
