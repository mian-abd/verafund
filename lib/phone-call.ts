import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { charges, subscriptions, transactions } from "./db/schema";
import { answerFlagged } from "./fraud-answer";
import { formatCents } from "./format";
import { approveNewPrice, keepBlocking } from "./guard";
import { CALL_REPLIES, callScript, priceCallScript, priceReplies, type CallKind } from "./phone-alert";

// Everything the phone needs about the thing Vera is calling about, from a verified link.
export interface CallSubject {
  kind: CallKind;
  title: string;
  merchant: string;
  amountLabel: string;
  detail: string;
  script: string;
  replies: { yes: string; no: string };
  yesLabel: string;
  noLabel: string;
  settled: "yes" | "no" | null;
}

type Claim = { workspaceId: string; subjectId: string; kind: CallKind };

export async function loadCallSubject(claim: Claim): Promise<CallSubject | null> {
  const db = await getDb();
  if (claim.kind === "fraud") {
    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, claim.subjectId), eq(transactions.workspaceId, claim.workspaceId)));
    if (!tx) return null;
    const amountCents = Math.abs(tx.amountCents);
    return {
      kind: "fraud",
      title: "VeraFund fraud check",
      merchant: tx.merchant,
      amountLabel: formatCents(amountCents),
      detail: `Risk score ${tx.riskScore ?? 0}/100`,
      script: callScript(tx.merchant, amountCents),
      replies: CALL_REPLIES,
      yesLabel: "It was me",
      noLabel: "Block it",
      settled: tx.status === "flagged" ? null : tx.status === "blocked" ? "no" : "yes",
    };
  }

  const [row] = await db
    .select({ charge: charges, limitCents: subscriptions.limitCents })
    .from(charges)
    .innerJoin(subscriptions, eq(subscriptions.id, charges.subscriptionId))
    .where(and(eq(charges.id, claim.subjectId), eq(charges.workspaceId, claim.workspaceId)));
  if (!row) return null;
  const { charge } = row;
  // Once approved, the card's limit already equals the new price; show the limit it had.
  const limitCents = charge.resolution === "approved_new_price" ? charge.amountCents : row.limitCents;
  return {
    kind: "price",
    title: "VeraFund price check",
    merchant: charge.merchant,
    amountLabel: formatCents(charge.amountCents),
    detail: `Your limit is ${formatCents(limitCents)}`,
    script: priceCallScript(charge.merchant, charge.amountCents, limitCents),
    replies: priceReplies(charge.merchant, charge.amountCents, limitCents),
    yesLabel: `Approve ${formatCents(charge.amountCents)}`,
    noLabel: "Keep blocking",
    settled: charge.resolution === "approved_new_price" ? "yes" : charge.resolution === "kept_blocking" ? "no" : null,
  };
}

// Applies the answer. Throws GuardError when it was already answered.
export async function answerCall(claim: Claim, decision: "yes" | "no"): Promise<void> {
  if (claim.kind === "fraud") {
    await answerFlagged(claim.workspaceId, claim.subjectId, decision, "phone");
  } else if (decision === "yes") {
    await approveNewPrice(claim.workspaceId, claim.subjectId);
  } else {
    await keepBlocking(claim.workspaceId, claim.subjectId);
  }
}
