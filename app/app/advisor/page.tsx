import { asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ActionsPanel } from "@/components/advisor/ActionsPanel";
import { ChatPanel } from "@/components/advisor/ChatPanel";
import { listMemories } from "@/lib/agent/memory";
import { listRecentActions } from "@/lib/agent/store";
import { aiEnabled } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { advisorMessages } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/");
  const { error } = await searchParams;

  const db = await getDb();
  const rows = await db
    .select()
    .from(advisorMessages)
    .where(eq(advisorMessages.workspaceId, workspaceId))
    .orderBy(asc(advisorMessages.createdAt), asc(sql`rowid`));

  const [actionRows, memories] = await Promise.all([listRecentActions(workspaceId, 15), listMemories(workspaceId)]);
  const actions = actionRows.map((a) => ({ ...a, time: formatDateTime(a.createdAt) }));

  const messages = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    time: formatDateTime(m.createdAt),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="advisor-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Advisor</h1>
        <p className="text-sm text-muted-foreground">
          Ask Vera about affording something, your budget, debt or subscriptions. Answers use your real numbers. She can also act for you: try “cancel Netflix”.
        </p>
      </div>

      {error && (
        <p role="alert" data-testid="advisor-error" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <ChatPanel messages={messages} aiOnline={aiEnabled()} />

      <ActionsPanel actions={actions} memories={memories} />

      <p className="text-xs text-muted-foreground">
        Vera gives budgeting guidance based on your data in VeraFund. It is not professional financial advice.
      </p>
    </div>
  );
}
