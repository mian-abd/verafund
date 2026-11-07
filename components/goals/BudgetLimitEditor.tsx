"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateBudgetLimitAction } from "@/app/app/goals/actions";
import { ReturnTo, SubmitButton } from "@/components/ui";

function toInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function BudgetLimitEditor({ budgetId, category, limitCents }: { budgetId: string; category: string; limitCents: number }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${category} budget limit`}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil size={13} aria-hidden="true" />
        Edit limit
      </button>
    );
  }

  const inputId = `limit-${budgetId}`;
  return (
    <form action={updateBudgetLimitAction} className="flex flex-wrap items-end gap-2">
      <ReturnTo />
      <input type="hidden" name="budgetId" value={budgetId} />
      <div>
        <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground">
          Monthly limit for {category} ($)
        </label>
        <input
          id={inputId}
          name="limit"
          type="text"
          inputMode="decimal"
          required
          autoFocus
          defaultValue={toInputValue(limitCents)}
          className="mt-1 w-32 rounded-lg border border-input bg-background px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <SubmitButton pendingText="Saving…" className="!px-3 !py-1.5 text-xs">
        Save limit
      </SubmitButton>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
