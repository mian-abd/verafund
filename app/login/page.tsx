import type { Metadata } from "next";
import Link from "next/link";
import { logInAction } from "@/app/actions";
import { AuthCard, AuthError, AuthShell, Field } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/ui";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in · VeraFund" };

export default async function LogInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome <span className="font-serif-display font-normal italic">back</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Log in to see which subscriptions Vera is guarding for you.</p>

        {error && <AuthError message={error} />}

        <p
          data-testid="demo-login-hint"
          className="mt-5 rounded-xl border border-primary/30 bg-warm px-4 py-3 text-sm text-foreground"
        >
          {`Demo login: ${DEMO_EMAIL} · ${DEMO_PASSWORD}`}
        </p>

        <form action={logInAction} data-testid="login-form" className="mt-5 space-y-4">
          <Field
            id="email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            defaultValue={DEMO_EMAIL}
            required
          />
          <Field
            id="password"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            defaultValue={DEMO_PASSWORD}
            required
          />
          <SubmitButton pendingText="Setting up your workspace…" className="w-full py-3">
            Log in
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to VeraFund?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
