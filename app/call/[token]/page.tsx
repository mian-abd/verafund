import type { Metadata } from "next";
import { IncomingCall } from "@/components/IncomingCall";
import { verifyCallToken } from "@/lib/phone-alert";
import { loadCallSubject } from "@/lib/phone-call";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vera is calling", robots: { index: false } };

// Opened from the phone alert. The signed link stands in for the workspace cookie,
// because the phone is not the browser the workspace was created in.
export default async function CallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = decodeURIComponent(token);
  const claim = verifyCallToken(raw);
  const subject = claim ? await loadCallSubject(claim) : null;
  if (!subject) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          {claim ? "That charge no longer exists." : "This call link has expired. Open VeraFund to answer the charge."}
        </p>
      </main>
    );
  }
  return <IncomingCall token={raw} {...subject} />;
}
