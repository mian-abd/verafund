// Front-door auth for the hackathon build. There are no stored accounts: one demo
// login is checked against fixed credentials (overridable by env), and every
// successful log in or sign up gets a fresh workspace with sample data. The
// workspace cookie (vf_ws, see ./session) is the only session.

import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { profiles } from "./db/schema";

export const DEMO_EMAIL = process.env.DEMO_LOGIN_EMAIL || "alex@verafund.app";
export const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "vera2026";

export const LOGIN_ERROR = "Email or password is incorrect.";

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// Hash both sides first so the buffers are always the same length (timingSafeEqual
// throws otherwise, and a length check would leak the secret's length).
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkCredentials(email: unknown, password: unknown): boolean {
  const emailOk = safeEqual(normalizeEmail(email), normalizeEmail(DEMO_EMAIL));
  const passwordOk = safeEqual(typeof password === "string" ? password : "", DEMO_PASSWORD);
  return emailOk && passwordOk;
}

export type SignUpInput = { name: string; email: string; password: string };

// Sign-up is a form over a fresh workspace: nothing is stored except the name.
// Returns the error to show, or the cleaned name when the input is fine.
export function validateSignUp(input: { name: unknown; email: unknown; password: unknown }):
  | { ok: true; name: string }
  | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1) return { ok: false, error: "Enter your name." };
  if (name.length > 60) return { ok: false, error: "Keep your name to 60 characters or fewer." };
  const email = normalizeEmail(input.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (typeof input.password !== "string" || input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  return { ok: true, name };
}

export async function setDisplayName(workspaceId: string, name: string): Promise<void> {
  const db = await getDb();
  await db.update(profiles).set({ displayName: name }).where(eq(profiles.workspaceId, workspaceId));
}

export async function getDisplayName(workspaceId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ name: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  return row?.name ?? null;
}
