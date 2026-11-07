import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { notifications, transactions } from "./db/schema";
import { parseRiskSignals, severityOf, type RiskSignal } from "./fraud";
import { formatCents } from "./format";
import { GuardError } from "./guard";

// Settles a flagged charge after the account holder answers "was this you?", whether
// they answered in the app, from a lock-screen button or on a call with Vera.
// The update is conditional on status "flagged", so a second answer is refused.
export async function answerFlagged(
  workspaceId: string,
  transactionId: string,
  decision: "yes" | "no",
  via: "app" | "phone" = "app",
): Promise<{ merchant: string; amountCents: number }> {
  const db = await getDb();
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, workspaceId)));
  if (!tx) throw new GuardError("That transaction doesn't exist in your workspace.");
  if (tx.status !== "flagged") throw new GuardError("You already answered this charge.");

  const amountCents = Math.abs(tx.amountCents);
  const where = and(
    eq(transactions.id, transactionId),
    eq(transactions.workspaceId, workspaceId),
    eq(transactions.status, "flagged"),
  );

  if (decision === "yes") {
    const before = tx.riskScore ?? 0;
    const after = Math.round(before * 0.3);
    const signals: RiskSignal[] = [
      ...parseRiskSignals(tx.riskSignals),
      {
        signal: "user_confirmed",
        points: after - before,
        detail: `You told Vera this purchase was yours${via === "phone" ? " on your phone" : ""}, so the risk dropped from ${before} to ${after}.`,
      },
    ];
    const done = await db
      .update(transactions)
      .set({ status: "posted", riskScore: after, riskSignals: JSON.stringify(signals) })
      .where(where)
      .returning({ id: transactions.id });
    if (done.length === 0) throw new GuardError("You already answered this charge.");
    return { merchant: tx.merchant, amountCents };
  }

  const done = await db.update(transactions).set({ status: "blocked" }).where(where).returning({ id: transactions.id });
  if (done.length === 0) throw new GuardError("You already answered this charge.");
  await db.insert(notifications).values({
    id: randomUUID(),
    workspaceId,
    kind: "fraud_blocked",
    title: `Vera blocked a ${formatCents(amountCents)} charge at ${tx.merchant}`,
    body: `You said it wasn't you${via === "phone" ? " when Vera called your phone" : ""}, so the ${severityOf(tx.riskScore ?? 0)}-risk charge was blocked and no money moved.`,
    read: false,
    createdAt: Date.now(),
  });
  return { merchant: tx.merchant, amountCents };
}
