import type { Metadata } from "next";
import Link from "next/link";
import { signUpAction } from "@/app/actions";
import { AuthCard, AuthError, AuthShell, Field } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Sign up · VeraFund" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Create your <span className="font-serif-display font-normal italic">workspace</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell Vera who you are and she&rsquo;ll set up a private workspace with a virtual card for every subscription.
        </p>

        {error && <AuthError message={error} />}

        <form action={signUpAction} data-testid="signup-form" className="mt-6 space-y-4">
          <Field
            id="name"
            name="name"
            label="Name"
            type="text"
            autoComplete="name"
            placeholder="Alex Chen"
            required
            maxLength={60}
          />
          <Field
            id="email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
          <Field
            id="password"
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters."
          />
          <SubmitButton pendingText="Creating your workspace…" className="w-full py-3">
            Create workspace
          </SubmitButton>
        </form>

        <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Your workspace starts with sample data (cards, transactions, goals) so you can explore right away. Sandbox
          cards, no real money.
        </p>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
