// One conversation with Vera per workspace, shared by the AI Advisor page and the
// floating "Ask Vera" panel on every page. Questions land here; requests to DO something go
// through the action agent in lib/agent/flow.ts, which calls back into askVera for anything
// that is just a question.

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { ChatTurn } from "./ai";
import { assertUnderHourlyLimit, MAX_QUESTION as MAX_QUESTION_CHARS } from "./agent/chatlog";
import { listMemoryFacts } from "./agent/memory";
import { getDb } from "./db/client";
import { advisorMessages } from "./db/schema";
import { getFinance } from "./finance";
import { getDashboard, GuardError } from "./guard";
import { answerQuestion, buildSnapshot, type AskOptions } from "@/app/app/advisor/vera-brain";

export const MAX_QUESTION = MAX_QUESTION_CHARS;
const HISTORY_TURNS = 10;

export async function askVera(workspaceId: string, rawQuestion: string, opts: AskOptions = {}) {
  const question = rawQuestion.trim();
  if (!question) throw new GuardError("Type a question for Vera first.");
  if (question.length > MAX_QUESTION) throw new GuardError(`Keep questions under ${MAX_QUESTION} characters.`);

  const db = await getDb();
  await assertUnderHourlyLimit(workspaceId);

  const [finance, dashboard, memories] = await Promise.all([
    getFinance(workspaceId),
    getDashboard(workspaceId),
    listMemoryFacts(workspaceId),
  ]);
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
  const answer = await answerQuestion(question, history, buildSnapshot(finance, dashboard, memories), opts);
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
