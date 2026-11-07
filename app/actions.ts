"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { getWorkspaceId, setWorkspaceId } from "@/lib/session";

function userMessage(err: unknown): string {
  if (err instanceof GuardError) return err.message;
  if (err instanceof Stripe.errors.StripeError) return `Stripe sandbox error: ${err.message}`;
  return "Something went wrong. Try again, or reset the demo.";
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

export async function simulateChargeAction(formData: FormData) {
  await run(formData, async (ws) => {
    const cents = parseDollarsToCents(formData.get("amount"));
    if (cents === null) throw new GuardError("Enter an amount like 18.99 (between $0.01 and $10,000).");
    await simulateCharge(ws, field(formData, "subscriptionId"), cents);
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
