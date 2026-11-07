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

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col sticky top-0 h-screen">
        <div className="p-6 pb-4">
          <Logo />
        </div>
        <AppNav orientation="vertical" />
        <div className="m-3 rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Demo workspace</p>
          <p>Your data is private to this browser session and uses demo merchants and prices.</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-border bg-card px-4 md:px-6 py-3 space-y-3 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
          <div className="flex items-center justify-between gap-3 md:hidden">
            <Logo />
            <ThemeToggle />
          </div>
          <div className="md:hidden">
            <AppNav orientation="horizontal" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ModeBadge />
            <span className="text-sm text-muted-foreground" data-testid="demo-date">
              Demo date: <span className="font-medium text-foreground">{formatDate(now)}</span>
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
                Reset demo
              </SubmitButton>
            </form>
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
