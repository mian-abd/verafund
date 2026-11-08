import { logOutAction } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { getDisplayName } from "@/lib/auth";
import { getWorkspaceId } from "@/lib/session";

// Header account area: who is signed in, and Log out. Server component: it reads the
// workspace cookie itself, so the layout only has to render <UserMenu />.
export async function UserMenu() {
  const workspaceId = await getWorkspaceId();
  const name = workspaceId ? await getDisplayName(workspaceId).catch(() => null) : null;
  const label = name?.trim() || "My account";

  return (
    <div className="flex items-center gap-2" data-testid="user-menu">
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        aria-hidden="true"
      >
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="hidden min-w-0 leading-tight sm:block">
        <span className="block max-w-[10rem] truncate text-sm font-medium text-foreground" data-testid="user-name">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">Sandbox workspace</span>
      </span>
      <form action={logOutAction}>
        <SubmitButton variant="ghost" pendingText="Logging out…" data-testid="logout-button">
          Log out
        </SubmitButton>
      </form>
    </div>
  );
}
