"use client";

import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="max-w-xl mx-auto mt-10 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 space-y-4">
      <h1 className="text-lg font-semibold text-foreground">Something went wrong loading this page.</h1>
      <p className="text-sm text-muted-foreground">
        {error.digest ? `Reference: ${error.digest}. ` : ""}Try again, or start a fresh demo.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <Link href="/" className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium">
          Back to start
        </Link>
      </div>
    </div>
  );
}
