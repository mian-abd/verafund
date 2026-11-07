"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverSubscriptions, guardDiscovered } from "@/lib/discovery";
import { GuardError, WorkspaceMissingError } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

const MAX_PICKED = 25;
const MAX_NAME = 80;

function userMessage(err: unknown): string {
  if (err instanceof GuardError) return err.message;
  console.error("[discovery]", err);
  return "Something went wrong while checking your transactions. Try again.";
}

// Every redirect goes back to the Subscriptions page with the panel still open.
function back(params: { error?: string; notice?: string }): never {
  const query = new URLSearchParams({ discover: "1" });
  if (params.error) query.set("error", params.error);
  if (params.notice) query.set("notice", params.notice);
  redirect(`/app?${query.toString()}`);
}

// The names come from the browser, so check them. guardDiscovered looks each one up in the
// server's own scan, which means a made-up merchant or price can never reach a card.
function pickedMerchants(formData: FormData): string[] {
  const names = formData
    .getAll("merchant")
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= MAX_NAME);
  const unique = [...new Set(names)];
  if (unique.length === 0) throw new GuardError("Pick at least one subscription to guard.");
  if (unique.length > MAX_PICKED) throw new GuardError(`Pick ${MAX_PICKED} or fewer at a time.`);
  return unique;
}

// "Find my subscriptions": scans the history (and warms Jev's answers so the page that
// opens next is quick), then opens the panel. The results themselves render from the URL,
// so they survive a reload.
export async function runDiscoveryAction() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");
  let error: string | undefined;
  try {
    await discoverSubscriptions(workspaceId);
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    error = userMessage(err);
  }
  back({ error });
}

export async function guardSelectedAction(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  let notice: string | undefined;
  let error: string | undefined;
  try {
    const merchants = pickedMerchants(formData);
    const created = await guardDiscovered(workspaceId, merchants);
    if (created === 0) {
      error = "Nothing new to guard: those are already guarded, or they no longer show up as recurring charges.";
    } else {
      const skipped = merchants.length - created;
      notice =
        `Guarded ${created} ${created === 1 ? "subscription" : "subscriptions"}. Each has its own card, limited to its latest price.` +
        (skipped > 0 ? ` ${skipped} ${skipped === 1 ? "was" : "were"} skipped (already guarded).` : "");
    }
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    error = userMessage(err);
  }
  revalidatePath("/app", "layout");
  back({ error, notice });
}
