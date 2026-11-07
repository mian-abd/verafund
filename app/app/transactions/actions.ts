"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { PURCHASE_CATEGORIES } from "@/components/transactions/options";
import { getDb } from "@/lib/db/client";
import { notifications, transactions } from "@/lib/db/schema";
import { getFinance } from "@/lib/finance";
import { scorePurchase, type RiskSignal } from "@/lib/fraud";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { GuardError, WorkspaceMissingError } from "@/lib/guard";
import { jevTriage } from "@/lib/jev";
import { logDecision } from "@/lib/decision";
import { getWorkspaceId } from "@/lib/session";
import { answerFlagged } from "@/lib/fraud-answer";
import { phoneAlertsConfigured, phoneAlertsOn, ringPhone, setPhoneAlerts } from "@/lib/phone-alert";

const BACK = "/app/transactions";

function userMessage(err: unknown): string {
  if (err instanceof GuardError) return err.message;
  return "Something went wrong. Try again, or start over.";
}

// Runs a workspace-scoped mutation, then sends the user back to the page.
// A user error comes back as persistent text on that page via ?error=.
async function run(mutate: (workspaceId: string) => Promise<void>) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  let error: string | null = null;
  try {
    await mutate(workspaceId);
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    console.error("[transactions action]", err);
    error = userMessage(err);
  }
  revalidatePath("/app", "layout");
  redirect(error ? `${BACK}?error=${encodeURIComponent(error)}` : BACK);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function simulatePurchaseAction(formData: FormData) {
  await run(async (workspaceId) => {
    const merchant = text(formData, "merchant");
    if (!merchant || merchant.length > 80) throw new GuardError("Enter a merchant name (up to 80 characters).");

    const amountCents = parseDollarsToCents(text(formData, "amount"));
    if (amountCents === null) throw new GuardError("Enter an amount like 18.99 (between $0.01 and $10,000).");

    const category = PURCHASE_CATEGORIES.find((c) => c === text(formData, "category").toLowerCase());
    if (!category) throw new GuardError("Pick a category from the list.");

    const country = (text(formData, "country") || "US").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new GuardError("Enter a two-letter country code like US.");

    const finance = await getFinance(workspaceId);
    const checking = finance.accounts.find((a) => a.type === "checking") ?? finance.accounts[0];
    if (!checking) throw new GuardError("No account to charge. Start over to reset your workspace.");

    const purchase = { merchant, amountCents, category, country, at: finance.now };
    const result = scorePurchase(purchase, {
      history: finance.transactions,
      checkingBalanceCents: finance.accounts.find((a) => a.type === "checking")?.balanceCents ?? null,
    });

    // Jev adds advisory evidence with 0 points; the rule score alone sets the status.
    const triageStarted = Date.now();
    const evidence: RiskSignal[] = await jevTriage(purchase, result.signals, result.score);
    await logDecision({
      workspaceId,
      purpose: "fraud_triage",
      engine: evidence.length ? "jev" : "rules",
      input: `${merchant} ${formatCents(amountCents)} (${category}, ${country})`,
      output: { score: result.score, severity: result.severity, jev: evidence.map((e) => e.detail) },
      latencyMs: Date.now() - triageStarted,
    });
    const signals = [...result.signals, ...evidence];
    const flagged = result.severity === "high";

    const db = await getDb();
    const transactionId = randomUUID();
    await db.insert(transactions).values({
      id: transactionId,
      workspaceId,
      accountId: checking.id,
      merchant,
      category,
      amountCents: -amountCents,
      occurredAt: finance.now,
      description: `Card purchase in ${country}`,
      status: flagged ? "flagged" : "posted",
      riskScore: result.score,
      riskSignals: JSON.stringify(signals),
      subscriptionId: null,
      createdAt: Date.now(),
    });

    if (flagged) {
      const why = result.signals.slice(0, 3).map((s) => s.detail).join(" ");
      await db.insert(notifications).values({
        id: randomUUID(),
        workspaceId,
        kind: "fraud_flagged",
        title: `Vera flagged a ${formatCents(amountCents)} charge at ${merchant}`,
        body: `Risk score ${result.score}/100. ${why}`,
        read: false,
        createdAt: Date.now(),
      });
      // Ring the owner's phone right away, without holding up the page.
      if (phoneAlertsConfigured() && (await phoneAlertsOn(workspaceId))) {
        after(() =>
          ringPhone({ workspaceId, transactionId, merchant, amountCents, riskScore: result.score }).then(() => undefined),
        );
      }
    }
  });
}

export async function resolveFlaggedAction(formData: FormData) {
  await run(async (workspaceId) => {
    const id = text(formData, "transactionId");
    const decision = text(formData, "decision");
    if (!id || (decision !== "yes" && decision !== "no")) throw new GuardError("That answer didn't come through. Try again.");
    await answerFlagged(workspaceId, id, decision);
  });
}

export async function setPhoneAlertsAction(formData: FormData) {
  await run(async (workspaceId) => {
    await setPhoneAlerts(workspaceId, text(formData, "on") === "1");
  });
}

// "Ring my phone" on a flagged charge: sends the alert again, on demand.
export async function ringPhoneAction(formData: FormData) {
  await run(async (workspaceId) => {
    if (!phoneAlertsConfigured()) throw new GuardError("Phone alerts aren't set up on this server.");
    const id = text(formData, "transactionId");
    const db = await getDb();
    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)));
    if (!tx || tx.status !== "flagged") throw new GuardError("That charge isn't waiting for an answer.");
    const sent = await ringPhone({
      workspaceId,
      transactionId: tx.id,
      merchant: tx.merchant,
      amountCents: Math.abs(tx.amountCents),
      riskScore: tx.riskScore ?? 0,
    });
    if (!sent) throw new GuardError("Couldn't reach your phone just now. Wait a few seconds and try again.");
  });
}
