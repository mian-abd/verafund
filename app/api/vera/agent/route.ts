// Vera's action agent.
//   POST { message, page, voice }              -> answer | confirm | done | clarify | cancelled
//   POST { confirm: actionId, decision }       -> done | cancelled   (a tap on the card's button)
//   POST { transcript, pendingActionId }       -> done | cancelled | clarify   (a spoken yes/no)
//   POST { forgetMemory: memoryId }            -> { ok }
//   GET                                        -> recent actions, memories, the pending action
// Needs the workspace cookie. Every query below is scoped to that workspace.

import { GuardError, WorkspaceMissingError } from "@/lib/guard";
import { confirmFromButton, getAgentOverview, handleAgentMessage, handleVoiceTranscript } from "@/lib/agent/flow";
import { forgetMemoryById } from "@/lib/agent/memory";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGES: Record<string, string> = {
  "/app": "Guarded subscriptions",
  "/app/overview": "Overview dashboard",
  "/app/transactions": "Transactions and fraud alerts",
  "/app/goals": "Goals, debt and budgets",
  "/app/banks": "Bank connections",
  "/app/analyzer": "Purchase Analyzer",
  "/app/activity": "Activity log",
  "/app/advisor": "AI Advisor",
};

function pageName(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  if (path.startsWith("/app/subscriptions/")) return "subscription detail";
  return PAGES[path];
}

function fail(err: unknown) {
  if (err instanceof WorkspaceMissingError) return Response.json({ error: err.message }, { status: 401 });
  if (err instanceof GuardError) return Response.json({ error: err.message }, { status: 400 });
  console.error("[vera agent]", err);
  return Response.json({ error: "Vera could not do that just now. Try again." }, { status: 500 });
}

const ID = /^[0-9a-f-]{36}$/;

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return Response.json({ error: "No session" }, { status: 401 });
  try {
    return Response.json(await getAgentOverview(workspaceId));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return Response.json({ error: "Your session expired. Log in again." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    // A tap on the confirm card.
    if (typeof body.confirm === "string") {
      if (!ID.test(body.confirm)) return Response.json({ error: "That request doesn't exist anymore." }, { status: 400 });
      if (body.decision !== "yes" && body.decision !== "no") return Response.json({ error: "Answer yes or no." }, { status: 400 });
      return Response.json(await confirmFromButton(workspaceId, body.confirm, body.decision));
    }

    // A spoken answer to a read-back.
    if (typeof body.transcript === "string" && typeof body.pendingActionId === "string") {
      if (!ID.test(body.pendingActionId)) return Response.json({ error: "That request doesn't exist anymore." }, { status: 400 });
      return Response.json(await handleVoiceTranscript(workspaceId, body.transcript, body.pendingActionId, { page: pageName(body.page) }));
    }

    if (typeof body.forgetMemory === "string") {
      if (!ID.test(body.forgetMemory)) return Response.json({ error: "That memory doesn't exist anymore." }, { status: 400 });
      return Response.json({ ok: await forgetMemoryById(workspaceId, body.forgetMemory) });
    }

    return Response.json(
      await handleAgentMessage(workspaceId, typeof body.message === "string" ? body.message : "", {
        page: pageName(body.page),
        voice: body.voice === true,
        surface: "dock",
      }),
    );
  } catch (err) {
    return fail(err);
  }
}
