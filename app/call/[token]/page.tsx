import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { IncomingCall } from "@/components/IncomingCall";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { formatCents } from "@/lib/format";
import { callScript, verifyCallToken } from "@/lib/phone-alert";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vera is calling", robots: { index: false } };

// Opened from the phone alert. The signed link stands in for the workspace cookie,
// because the phone is not the browser the workspace was created in.
export default async function CallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verifyCallToken(decodeURIComponent(token));
  if (!claim) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">This call link has expired. Open VeraFund to answer the charge.</p>
      </main>
    );
  }

  const db = await getDb();
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, claim.transactionId), eq(transactions.workspaceId, claim.workspaceId)));
  if (!tx) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">That charge no longer exists.</p>
      </main>
    );
  }

  const amountCents = Math.abs(tx.amountCents);
  return (
    <IncomingCall
      token={decodeURIComponent(token)}
      merchant={tx.merchant}
      amountLabel={formatCents(amountCents)}
      riskScore={tx.riskScore ?? 0}
      script={callScript(tx.merchant, amountCents)}
      settled={tx.status === "flagged" ? null : tx.status === "blocked" ? "no" : "yes"}
    />
  );
}
