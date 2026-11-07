// One conversation with Vera per workspace, shared by the AI Advisor page and the
// floating "Ask Vera" panel on every page.

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import type { ChatTurn } from "./ai";
import { getDb } from "./db/client";
import { advisorMessages } from "./db/schema";
import { getFinance } from "./finance";
import { getDashboard, GuardError } from "./guard";
import { answerQuestion, buildSnapshot, type AskOptions } from "@/app/app/advisor/vera-brain";

export const MAX_QUESTION = 500;
const HISTORY_TURNS = 10;
const HOURLY_LIMIT = 40; // the site is public and AI calls cost money

export async function askVera(workspaceId: string, rawQuestion: string, opts: AskOptions = {}) {
  const question = rawQuestion.trim();
  if (!question) throw new GuardError("Type a question for Vera first.");
  if (question.length > MAX_QUESTION) throw new GuardError(`Keep questions under ${MAX_QUESTION} characters.`);

  const db = await getDb();
  const recent = await db
    .select({ id: advisorMessages.id })
    .from(advisorMessages)
    .where(
      and(
        eq(advisorMessages.workspaceId, workspaceId),
        eq(advisorMessages.role, "user"),
        gte(advisorMessages.createdAt, Date.now() - 3_600_000),
      ),
    );
  if (recent.length >= HOURLY_LIMIT) throw new GuardError("Vera needs a short break. Try again in a few minutes.");

  const [finance, dashboard] = await Promise.all([getFinance(workspaceId), getDashboard(workspaceId)]);
  const prior = await db
    .select()
    .from(advisorMessages)
    .where(eq(advisorMessages.workspaceId, workspaceId))
    .orderBy(desc(advisorMessages.createdAt))
    .limit(HISTORY_TURNS);
  const history: ChatTurn[] = prior.reverse().map((m) => ({ role: m.role, content: m.content }));

  // Wall-clock timestamps keep the shared history in order across both chat surfaces.
  const askedAt = Date.now();
  await db.insert(advisorMessages).values({ id: randomUUID(), workspaceId, role: "user", content: question, createdAt: askedAt });
  const answer = await answerQuestion(question, history, buildSnapshot(finance, dashboard), opts);
  await db.insert(advisorMessages).values({
    id: randomUUID(),
    workspaceId,
    role: "assistant",
    content: answer.text,
    createdAt: askedAt + 1,
  });
  return answer;
}

export async function recentVeraMessages(workspaceId: string, limit = 20) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(advisorMessages)
    .where(eq(advisorMessages.workspaceId, workspaceId))
    .orderBy(desc(advisorMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt }));
}
