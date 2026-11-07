"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteGoalAction } from "@/app/app/goals/actions";
import { ReturnTo, SubmitButton } from "@/components/ui";

// In-page confirmation (no native dialog): the first click only reveals the confirm row.
export function DeleteGoalButton({ goalId, name }: { goalId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete goal
      </button>
    );
  }

  return (
    <form
      action={deleteGoalAction}
      data-testid="delete-goal-confirm"
      role="group"
      aria-label={`Confirm deleting ${name}`}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2"
    >
      <ReturnTo />
      <input type="hidden" name="goalId" value={goalId} />
      <span className="text-xs font-medium text-destructive">Delete “{name}” and its savings progress?</span>
      <SubmitButton variant="danger" pendingText="Deleting…" className="!px-3 !py-1 text-xs">
        Yes, delete
      </SubmitButton>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
