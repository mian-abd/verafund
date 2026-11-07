import { revalidatePath } from "next/cache";
import { answerFlagged } from "@/lib/fraud-answer";
import { GuardError } from "@/lib/guard";
import { CALL_REPLIES, verifyCallToken } from "@/lib/phone-alert";

export const dynamic = "force-dynamic";

// "It was me" / "Block it" from the phone: a lock-screen button (ntfy http action) or the
// call screen. Authorized by the signed, expiring token in the link, not a cookie.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const claim = verifyCallToken(url.searchParams.get("t") ?? "");
  const decision = url.searchParams.get("d");
  if (!claim) return Response.json({ ok: false, text: "This call link has expired." }, { status: 401 });
  if (decision !== "yes" && decision !== "no") return Response.json({ ok: false, text: "Say yes or no." }, { status: 400 });

  try {
    await answerFlagged(claim.workspaceId, claim.transactionId, decision, "phone");
  } catch (err) {
    if (err instanceof GuardError) return Response.json({ ok: false, text: err.message }, { status: 409 });
    console.error("[phone answer]", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, text: "Something went wrong. Answer in the app instead." }, { status: 500 });
  }
  revalidatePath("/app", "layout");
  return Response.json({ ok: true, decision, text: CALL_REPLIES[decision] });
}
