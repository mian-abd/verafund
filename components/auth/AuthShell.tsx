import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

// Shared frame for the Sign up and Log in pages: the landing page's warm backdrop,
// the logo, and one centered card. Server component, no client state.

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img src="/images/hero-bg.webp" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/80" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo-icon.svg" alt="" className="h-8 w-8 rounded-full" />
            <span className="text-lg font-bold text-foreground">
              Vera<span className="font-medium text-muted-foreground">Fund</span>
            </span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-start justify-center pb-12 pt-4 sm:items-center sm:pt-0">
          <div className="w-full max-w-md animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>;
}

export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="auth-error"
      className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {message.slice(0, 200)}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
