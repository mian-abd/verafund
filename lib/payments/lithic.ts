import type { CardStatus } from "../engine";
import type { PaymentsAdapter } from "./types";

// Lithic sandbox: real virtual card numbers with a per-transaction spend limit, paused and
// closed through the API, and merchant authorizations simulated against the card number.
// Only the sandbox is supported, so no real money can move.
// API: https://docs.lithic.com (Authorization header carries the API key as-is).

const BASE = "https://sandbox.lithic.com/v1";
const TIMEOUT_MS = 10_000;

function apiKey(): string {
  const key = process.env.LITHIC_API_KEY?.trim();
  if (!key) throw new Error("LITHIC_API_KEY is not set");
  return key;
}

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: apiKey(), "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, json };
}

const STATE: Record<CardStatus, "OPEN" | "PAUSED" | "CLOSED"> = { active: "OPEN", inactive: "PAUSED", canceled: "CLOSED" };

// Lithic's decline codes and messages, mapped onto the reasons the engine reconciles.
export function lithicReason(codeOrMessage: string | null | undefined): string | null {
  if (!codeOrMessage) return null;
  const s = codeOrMessage.toLowerCase();
  if (/transaction[ _]limit|spend[ _]limit|user_transaction_limit|exceeds/.test(s)) return "spending_controls";
  if (/paused/.test(s)) return "card_inactive";
  if (/closed|card_not_activated|inactive/.test(s)) return "card_canceled";
  if (/insufficient/.test(s)) return "insufficient_funds";
  return s.slice(0, 80);
}

type LithicCard = { token: string; last_four: string; pan?: string };
type LithicTransaction = { result?: string; status?: string };

export const lithicPayments: PaymentsAdapter = {
  mode: "lithic",

  async createCard({ merchant, limitCents }) {
    const { ok, status, json } = await call<LithicCard & { message?: string }>("POST", "/cards", {
      type: "VIRTUAL",
      state: "OPEN",
      memo: `${merchant} (VeraFund)`.slice(0, 50),
      spend_limit: limitCents,
      spend_limit_duration: "TRANSACTION",
    });
    if (!ok || !json.token) throw new Error(`Lithic could not create the card (${status}${json.message ? `: ${json.message}` : ""})`);
    return { cardId: json.token, last4: json.last_four };
  },

  async setLimit(cardId, limitCents) {
    const { ok, status } = await call("PATCH", `/cards/${cardId}`, { spend_limit: limitCents, spend_limit_duration: "TRANSACTION" });
    if (!ok) throw new Error(`Lithic could not change the card limit (${status})`);
  },

  async setStatus(cardId, status) {
    const res = await call("PATCH", `/cards/${cardId}`, { state: STATE[status] });
    if (!res.ok) throw new Error(`Lithic could not change the card state (${res.status})`);
  },

  async authorize({ cardId, amountCents, merchant }) {
    // The sandbox simulates the merchant's request against the card number.
    const card = await call<LithicCard>("GET", `/cards/${cardId}`);
    if (!card.ok || !card.json.pan) throw new Error(`Lithic card lookup failed (${card.status})`);
    const auth = await call<{ token?: string; message?: string }>("POST", "/simulate/authorize", {
      amount: amountCents,
      descriptor: merchant.toUpperCase().slice(0, 25),
      pan: card.json.pan,
    });
    if (!auth.ok || !auth.json.token) {
      return { approved: false, reason: lithicReason(auth.json.message) ?? `http_${auth.status}`, authorizationId: null };
    }
    const tx = await call<LithicTransaction>("GET", `/transactions/${auth.json.token}`);
    const result = tx.json.result ?? null;
    const approved = tx.ok ? result === "APPROVED" && tx.json.status !== "DECLINED" : true;
    return { approved, reason: approved ? null : lithicReason(result), authorizationId: auth.json.token };
  },
};
