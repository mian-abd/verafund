// Vera rings your phone when a charge looks like fraud, at no cost and with no phone carrier:
// a max-priority push through ntfy (the free ntfy app on iOS or Android, subscribed to
// NTFY_TOPIC). The alert has "It was me" / "Block it" buttons that work from the lock screen,
// and "Answer Vera" opens a call screen in the phone's browser where Vera asks out loud.
//
// Links carry a signed, expiring token instead of the workspace cookie, because the phone is
// a different browser than the one the workspace lives in.

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { appSettings } from "./db/schema";
import { veraFraudScript } from "./fraud";
import { formatCents } from "./format";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const NTFY_TIMEOUT_MS = 5_000;

export function appBaseUrl(): string | null {
  const explicit = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export function phoneAlertsConfigured(): boolean {
  return Boolean(process.env.NTFY_TOPIC?.trim() && appBaseUrl());
}

function signingKey(): string {
  const key = process.env.PHONE_ALERT_SECRET?.trim() || process.env.NTFY_TOPIC?.trim();
  if (!key) throw new Error("Phone alerts are not configured");
  return key;
}

function mac(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function signCallToken(workspaceId: string, transactionId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, t: transactionId, e: now + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function verifyCallToken(token: string, now = Date.now()): { workspaceId: string; transactionId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = mac(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { w, t, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { w?: unknown; t?: unknown; e?: unknown };
    if (typeof w !== "string" || typeof t !== "string" || typeof e !== "number" || e < now) return null;
    return { workspaceId: w, transactionId: t };
  } catch {
    return null;
  }
}

// What Vera says on the call. Short, and ends with how to answer.
export function callScript(merchant: string, amountCents: number): string {
  return `${veraFraudScript(merchant, amountCents)} Say yes if it was you, or no and I'll block it.`;
}

export const CALL_REPLIES = {
  yes: "Thanks. I've marked it as yours and released the hold. Have a good day.",
  no: "Done. I blocked that charge, so no money moved. I'd keep an eye on that card. Goodbye.",
} as const;

// Per-workspace opt-in, so a visitor's test charge never rings the owner's phone by surprise.
const optInKey = (workspaceId: string) => `phone_alerts:${workspaceId}`;

export async function phoneAlertsOn(workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, optInKey(workspaceId)));
  return row?.value === "on";
}

export async function setPhoneAlerts(workspaceId: string, on: boolean): Promise<void> {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ key: optInKey(workspaceId), value: on ? "on" : "off" })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: on ? "on" : "off" } });
}

const lastRing = new Map<string, number>();

// Sends the alert. Returns false (never throws) when not configured, throttled or ntfy fails.
export async function ringPhone(input: {
  workspaceId: string;
  transactionId: string;
  merchant: string;
  amountCents: number;
  riskScore: number;
}): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC?.trim();
  const base = appBaseUrl();
  if (!topic || !base) return false;
  const key = `${input.workspaceId}:${input.transactionId}`;
  const last = lastRing.get(key) ?? 0;
  if (Date.now() - last < 20_000) return false;
  lastRing.set(key, Date.now());

  const token = signCallToken(input.workspaceId, input.transactionId);
  const callUrl = `${base}/call/${token}`;
  const answerUrl = (d: "yes" | "no") => `${base}/api/phone/answer?t=${encodeURIComponent(token)}&d=${d}`;
  const server = (process.env.NTFY_SERVER?.trim() || "https://ntfy.sh").replace(/\/+$/, "");
  try {
    const res = await fetch(server, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        priority: 5,
        tags: ["rotating_light", "telephone_receiver"],
        title: `Vera is calling: ${formatCents(input.amountCents)} at ${input.merchant}`,
        message: `Risk ${input.riskScore}/100. Was this you? Answer to talk to Vera, or tap a button.`,
        click: callUrl,
        actions: [
          { action: "view", label: "Answer Vera", url: callUrl, clear: true },
          { action: "http", label: "It was me", url: answerUrl("yes"), method: "POST", clear: true },
          { action: "http", label: "Block it", url: answerUrl("no"), method: "POST", clear: true },
        ],
      }),
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) console.error("[phone alert] ntfy returned", res.status);
    return res.ok;
  } catch (err) {
    console.error("[phone alert]", err instanceof Error ? err.message : "send failed");
    return false;
  }
}
