import { revalidatePath } from "next/cache";
import { GuardError } from "@/lib/guard";
import { verifyCallToken } from "@/lib/phone-alert";
import { answerCall, loadCallSubject } from "@/lib/phone-call";

export const dynamic = "force-dynamic";

// The answer from the phone: a lock-screen button (ntfy http action) or the call screen.
// Covers both "was this you?" and "approve the new price?". Authorized by the signed,
// expiring token in the link, not a cookie.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const claim = verifyCallToken(url.searchParams.get("t") ?? "");
  const decision = url.searchParams.get("d");
  if (!claim) return Response.json({ ok: false, text: "This call link has expired." }, { status: 401 });
  if (decision !== "yes" && decision !== "no") return Response.json({ ok: false, text: "Say yes or no." }, { status: 400 });

  // Read the wording first: approving changes the limit the reply talks about.
  const subject = await loadCallSubject(claim);
  if (!subject) return Response.json({ ok: false, text: "That charge no longer exists." }, { status: 404 });
  try {
    await answerCall(claim, decision);
  } catch (err) {
    if (err instanceof GuardError) return Response.json({ ok: false, text: err.message }, { status: 409 });
    console.error("[phone answer]", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, text: "Something went wrong. Answer in the app instead." }, { status: 500 });
  }
  revalidatePath("/app", "layout");
  return Response.json({ ok: true, decision, text: subject.replies[decision] });
}
