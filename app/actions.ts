"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { phoneAlertsConfigured, phoneAlertsOn, ringPriceHike } from "@/lib/phone-alert";
import Stripe from "stripe";
import {
  addSubscription,
  approveNewPrice,
  createDemoWorkspace,
  GuardError,
  jumpAhead,
  keepAfterTrial,
  keepBlocking,
  markCancelled,
  setCardPaused,
  simulateCharge,
  WorkspaceMissingError,
} from "@/lib/guard";
import { parseDollarsToCents } from "@/lib/format";
import { clearWorkspaceId, getWorkspaceId, setWorkspaceId } from "@/lib/session";
import { checkCredentials, LOGIN_ERROR, setDisplayName, validateSignUp } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function userMessage(err: unknown): string {
  if (err instanceof GuardError) return err.message;
  if (err instanceof Stripe.errors.StripeError) return `Stripe sandbox error: ${err.message}`;
  return "Something went wrong. Please try again.";
}

function returnPath(formData: FormData): string {
  const value = formData.get("returnTo");
  if (typeof value !== "string" || !value.startsWith("/app") || value.startsWith("//")) return "/app";
  return value.split(/[?#]/)[0];
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) throw new GuardError(`Missing ${name}.`);
  return value.trim();
}

// Runs a workspace-scoped mutation, then sends the user back to the page they
// were on. Errors are shown on that page as persistent text, never a toast.
async function run(formData: FormData, mutate: (workspaceId: string) => Promise<void>) {
  const back = returnPath(formData);
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  let error: string | null = null;
  try {
    await mutate(workspaceId);
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    console.error("[action]", err);
    error = userMessage(err);
  }
  revalidatePath("/app", "layout");
  redirect(error ? `${back}?error=${encodeURIComponent(error)}` : back);
}

export async function startDemo() {
  let workspaceId: string;
  try {
    workspaceId = await createDemoWorkspace();
  } catch (err) {
    console.error("[startDemo]", err);
    redirect(`/?error=${encodeURIComponent(userMessage(err))}`);
  }
  await setWorkspaceId(workspaceId);
  redirect("/app");
}

// ---------- front door: sign up / log in / log out ----------
// No accounts are stored. Logging in checks one demo login, sign-up just takes a name,
// and both open a fresh workspace with sample data. The vf_ws cookie is the session.

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signUpAction(formData: FormData) {
  const checked = validateSignUp({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!checked.ok) redirect(`/signup?error=${encodeURIComponent(checked.error)}`);

  let workspaceId: string;
  try {
    workspaceId = await createDemoWorkspace();
    // Best effort: the greeting uses the entered name, but a failed rename must not block sign-up.
    await setDisplayName(workspaceId, checked.name).catch((err) => console.error("[signUp] name", err));
  } catch (err) {
    console.error("[signUpAction]", err);
    redirect(`/signup?error=${encodeURIComponent(userMessage(err))}`);
  }
  await setWorkspaceId(workspaceId);
  redirect("/app");
}

export async function logInAction(formData: FormData) {
  if (!checkCredentials(formText(formData, "email"), formText(formData, "password"))) {
    redirect(`/login?error=${encodeURIComponent(LOGIN_ERROR)}`);
  }

  let workspaceId: string;
  try {
    workspaceId = await createDemoWorkspace();
  } catch (err) {
    console.error("[logInAction]", err);
    redirect(`/login?error=${encodeURIComponent(userMessage(err))}`);
  }
  await setWorkspaceId(workspaceId);
  redirect("/app");
}

export async function logOutAction() {
  await clearWorkspaceId();
  redirect("/");
}

export async function simulateChargeAction(formData: FormData) {
  await run(formData, async (ws) => {
    const cents = parseDollarsToCents(formData.get("amount"));
    if (cents === null) throw new GuardError("Enter an amount like 18.99 (between $0.01 and $10,000).");
    const result = await simulateCharge(ws, field(formData, "subscriptionId"), cents);
    // A blocked price hike rings the owner's phone (if they turned phone alerts on).
    if (!result.approved && result.reason === "above_limit" && phoneAlertsConfigured() && (await phoneAlertsOn(ws))) {
      after(() =>
        ringPriceHike({ workspaceId: ws, chargeId: result.chargeId, merchant: result.merchant, amountCents: cents, limitCents: result.limitCents }).then(() => undefined),
      );
    }
  });
}

export async function approveNewPriceAction(formData: FormData) {
  await run(formData, (ws) => approveNewPrice(ws, field(formData, "chargeId")));
}

export async function keepBlockingAction(formData: FormData) {
  await run(formData, (ws) => keepBlocking(ws, field(formData, "chargeId")));
}

export async function pauseCardAction(formData: FormData) {
  await run(formData, (ws) => setCardPaused(ws, field(formData, "subscriptionId"), true));
}

export async function resumeCardAction(formData: FormData) {
  await run(formData, (ws) => setCardPaused(ws, field(formData, "subscriptionId"), false));
}

export async function keepAfterTrialAction(formData: FormData) {
  await run(formData, (ws) => keepAfterTrial(ws, field(formData, "subscriptionId")));
}

export async function markCancelledAction(formData: FormData) {
  await run(formData, (ws) => markCancelled(ws, field(formData, "subscriptionId")));
}

export async function jumpAheadAction(formData: FormData) {
  await run(formData, (ws) => jumpAhead(ws, 8));
}

export async function addSubscriptionAction(formData: FormData) {
  await run(formData, async (ws) => {
    const merchant = field(formData, "merchant");
    if (merchant.length > 40) throw new GuardError("Keep the merchant name under 40 characters.");
    const amountCents = parseDollarsToCents(formData.get("price"));
    if (amountCents === null) throw new GuardError("Enter a price like 12.99 (between $0.01 and $10,000).");
    const cycle = formData.get("cycle") === "yearly" ? "yearly" : "monthly";
    let trialDays: number | null = null;
    if (formData.get("trial") === "on") {
      trialDays = Number(formData.get("trialDays"));
      if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 90) {
        throw new GuardError("Free trial length must be between 1 and 90 days.");
      }
    }
    const category = typeof formData.get("category") === "string" && String(formData.get("category")).trim()
      ? String(formData.get("category")).trim().slice(0, 30)
      : "Subscription";
    await addSubscription(ws, { merchant, category, amountCents, cycle, trialDays });
  });
}

export async function resetDemoAction() {
  await startDemo();
}

export async function markNotificationsReadAction(formData: FormData) {
  await run(formData, async (ws) => {
    const db = await getDb();
    await db.update(notifications).set({ read: true }).where(eq(notifications.workspaceId, ws));
  });
}
