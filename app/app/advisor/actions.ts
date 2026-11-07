"use server";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChatTurn } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { advisorMessages } from "@/lib/db/schema";
import { getFinance } from "@/lib/finance";
import { getDashboard, WorkspaceMissingError } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { answerQuestion, buildSnapshot } from "./vera-brain";

const MAX_MESSAGE = 500;
const HISTORY_TURNS = 10;
const BACK = "/app/advisor";

export async function askVeraAction(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  const raw = formData.get("message");
  const question = typeof raw === "string" ? raw.trim() : "";
  if (!question) redirect(`${BACK}?error=${encodeURIComponent("Type a question for Vera first.")}`);
  if (question.length > MAX_MESSAGE) {
    redirect(`${BACK}?error=${encodeURIComponent(`Keep questions under ${MAX_MESSAGE} characters.`)}`);
  }

  let error: string | null = null;
  try {
    const db = await getDb();
    const [finance, dashboard] = await Promise.all([getFinance(workspaceId), getDashboard(workspaceId)]);
    const prior = await db
      .select()
      .from(advisorMessages)
      .where(eq(advisorMessages.workspaceId, workspaceId))
      .orderBy(desc(advisorMessages.createdAt))
      .limit(HISTORY_TURNS);
    const history: ChatTurn[] = prior.reverse().map((m) => ({ role: m.role, content: m.content }));

    const askedAt = finance.now;
    await db.insert(advisorMessages).values({
      id: randomUUID(),
      workspaceId,
      role: "user",
      content: question,
      createdAt: askedAt,
    });

    const { text } = await answerQuestion(question, history, buildSnapshot(finance, dashboard));
    await db.insert(advisorMessages).values({
      id: randomUUID(),
      workspaceId,
      role: "assistant",
      content: text,
      createdAt: askedAt + 1,
    });
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    console.error("[advisor]", err);
    error = "Vera could not answer just now. Try again.";
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
