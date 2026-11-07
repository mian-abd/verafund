import Link from "next/link";
import { redirect } from "next/navigation";
import { jumpAheadAction, resetDemoAction } from "../actions";
import { AppNav } from "@/components/AppNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ReturnTo, SubmitButton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getWorkspace, workspaceNow } from "@/lib/guard";
import { paymentsMode } from "@/lib/payments";
import { getWorkspaceId } from "@/lib/session";
import { getNotifications } from "@/lib/finance";
import { formatDateTime } from "@/lib/format";
import { NotificationBell } from "@/components/NotificationBell";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <img src="/images/logo-icon.svg" alt="" className="w-8 h-8 rounded-full" />
      <span className="text-lg font-bold text-foreground">
        Vera<span className="text-muted-foreground font-medium">Fund</span>
      </span>
    </Link>
  );
}

function ModeBadge() {
  const stripe = paymentsMode() === "stripe";
  return (
    <span
      data-testid="payments-mode"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        stripe
          ? "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
          : "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${stripe ? "bg-green-600" : "bg-amber-500"}`} aria-hidden="true" />
      {stripe ? "Stripe Issuing · sandbox" : "Simulated · no payment network"}
    </span>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/");
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) redirect("/?expired=1");
  const now = workspaceNow(workspace);
  const bellItems = (await getNotifications(workspaceId)).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    read: n.read,
    when: formatDateTime(n.createdAt),
  }));
  const bell = <NotificationBell items={bellItems} />;

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col sticky top-0 h-screen">
        <div className="p-6 pb-4">
          <Logo />
        </div>
        <AppNav orientation="vertical" />
        <div className="m-3 rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Private workspace</p>
          <p>Your data stays private to this browser. Sandbox cards: no real money moves.</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-border bg-card px-4 md:px-6 py-3 space-y-3 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
          <div className="flex items-center justify-between gap-3 md:hidden">
            <Logo />
            <div className="flex items-center gap-2">
              {bell}
              <ThemeToggle />
            </div>
          </div>
          <div className="md:hidden">
            <AppNav orientation="horizontal" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ModeBadge />
            <span className="text-sm text-muted-foreground" data-testid="demo-date">
              Today: <span className="font-medium text-foreground">{formatDate(now)}</span>
              {workspace.clockOffsetDays > 0 && ` (+${workspace.clockOffsetDays} days)`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={jumpAheadAction}>
              <ReturnTo />
              <SubmitButton variant="outline" pendingText="Jumping…">
                Jump ahead 8 days
              </SubmitButton>
            </form>
            <form action={resetDemoAction}>
              <SubmitButton variant="ghost" pendingText="Resetting…">
                Start over
              </SubmitButton>
            </form>
            <div className="hidden md:flex items-center gap-2">
              {bell}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
