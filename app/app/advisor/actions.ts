"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { advisorMessages } from "@/lib/db/schema";
import { GuardError, WorkspaceMissingError } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { handleAgentMessage } from "@/lib/agent/flow";

const BACK = "/app/advisor";

export async function askVeraAction(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  const raw = formData.get("message");
  let error: string | null = null;
  try {
    // Questions are answered as before; "cancel Netflix"-style requests become a pending action
    // the user confirms under "Vera's actions" on this page.
    await handleAgentMessage(workspaceId, typeof raw === "string" ? raw : "", { page: "AI Advisor", surface: "advisor" });
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    if (err instanceof GuardError) error = err.message;
    else {
      console.error("[advisor]", err);
      error = "Vera could not answer just now. Try again.";
    }
  }
  revalidatePath("/app", "layout");
  redirect(error ? `${BACK}?error=${encodeURIComponent(error)}` : BACK);
}

export async function clearChatAction() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");
  try {
    const db = await getDb();
    await db.delete(advisorMessages).where(eq(advisorMessages.workspaceId, workspaceId));
  } catch (err) {
    console.error("[advisor clear]", err);
    redirect(`${BACK}?error=${encodeURIComponent("Could not clear the chat. Try again.")}`);
  }
  revalidatePath("/app", "layout");
  redirect(BACK);
}
