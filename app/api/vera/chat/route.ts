import { GuardError, WorkspaceMissingError } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { askVera, recentVeraMessages } from "@/lib/vera-chat";

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

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return Response.json({ error: "No session" }, { status: 401 });
  return Response.json({ messages: await recentVeraMessages(workspaceId) });
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return Response.json({ error: "Your session expired. Log in again." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; page?: unknown; voice?: unknown };
  try {
    const answer = await askVera(workspaceId, typeof body.message === "string" ? body.message : "", {
      page: pageName(body.page),
      voice: body.voice === true,
    });
    return Response.json(answer);
  } catch (err) {
    if (err instanceof WorkspaceMissingError) return Response.json({ error: err.message }, { status: 401 });
    if (err instanceof GuardError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[vera chat]", err);
    return Response.json({ error: "Vera could not answer just now. Try again." }, { status: 500 });
  }
}
