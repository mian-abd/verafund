"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GuardError } from "@/lib/guard";
import { connectBank, createLinkToken, sandboxPublicToken, syncBank } from "@/lib/plaid";
import { getWorkspaceId } from "@/lib/session";

async function workspace(): Promise<string> {
  const id = await getWorkspaceId();
  if (!id) redirect("/?expired=1");
  return id;
}

function message(err: unknown): string {
  if (err instanceof GuardError) return err.message;
  console.error("[banks]", err);
  return "Couldn't reach the bank. Try again in a moment.";
}

function done(error: string | null, notice?: string): never {
  revalidatePath("/app", "layout");
  if (error) redirect(`/app/banks?error=${encodeURIComponent(error)}`);
  redirect(`/app/banks${notice ? `?notice=${encodeURIComponent(notice)}` : ""}`);
}

// Called from the browser to open Plaid Link.
export async function linkTokenAction(): Promise<{ token: string } | { error: string }> {
  try {
    return { token: await createLinkToken(await workspace()) };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function connectBankAction(publicToken: string, institutionName: string) {
  const ws = await workspace();
  let result: Awaited<ReturnType<typeof connectBank>> | null = null;
  let error: string | null = null;
  try {
    result = await connectBank(ws, publicToken, institutionName);
  } catch (err) {
    error = message(err);
  }
  done(error, result ? `Connected ${institutionName}: ${result.accounts} accounts, ${result.transactions} transactions imported.` : undefined);
}

export async function quickConnectAction() {
  const ws = await workspace();
  let result: Awaited<ReturnType<typeof connectBank>> | null = null;
  let error: string | null = null;
  try {
    result = await connectBank(ws, await sandboxPublicToken(), "First Platypus Bank");
  } catch (err) {
    error = message(err);
  }
  done(error, result ? `Connected First Platypus Bank: ${result.accounts} accounts, ${result.transactions} transactions imported.` : undefined);
}

export async function syncBankAction(formData: FormData) {
  const ws = await workspace();
  const id = String(formData.get("itemId") ?? "");
  let result: Awaited<ReturnType<typeof syncBank>> | null = null;
  let error: string | null = null;
  try {
    result = await syncBank(ws, id);
  } catch (err) {
    error = message(err);
  }
  done(error, result ? `Synced: ${result.transactions} new transactions.` : undefined);
}
