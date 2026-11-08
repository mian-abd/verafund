"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AI_MODEL,
  IMAGE_MEDIA_TYPES,
  aiEnabled,
  askClaude,
  cleanStoreName,
  visionEnabled,
  extractPurchaseFromImage,
  type ImageMediaType,
} from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { purchaseChecks } from "@/lib/db/schema";
import { formatCents, MAX_CHARGE_CENTS, parseDollarsToCents } from "@/lib/format";
import { getFinance } from "@/lib/finance";
import { WorkspaceMissingError } from "@/lib/guard";
import { analyzePurchase, formatWeeks, VERDICT_LABEL, type PurchaseAnalysis } from "@/lib/purchase";
import { getWorkspaceId } from "@/lib/session";
import { buildPurchaseInput, type StoredAnalysis } from "./stored";

const BACK = "/app/analyzer";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

class UserError extends Error {}

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

async function explain(item: string, a: PurchaseAnalysis): Promise<string | null> {
  if (!aiEnabled()) return null;
  const facts = [
    `Item: ${item}, price ${formatCents(a.priceCents)}.`,
    a.hoursOfWork !== null ? `Costs ${a.hoursOfWork} hours of after-tax work.` : "",
    a.percentOfIncome !== null ? `${a.percentOfIncome}% of monthly income.` : "",
    `Discretionary budget left this month: ${formatCents(a.remainingBeforeCents)} before, ${formatCents(a.remainingAfterCents)} after.`,
    ...a.goalImpacts.map((g) => `Goal ${g.name}: ${g.delayWeeks !== null ? `delayed ${formatWeeks(g.delayWeeks)}` : "no savings pace"}.`),
    `Verdict: ${VERDICT_LABEL[a.verdict]}.`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    return await askClaude(
      "You are Vera, a friendly personal-finance assistant. Write one short paragraph (max 70 words), plain text, " +
        "explaining the purchase verdict to the user in plain English using only the facts given. Be specific with dollar " +
        "amounts. If helpful, suggest one practical alternative (wait, save first, or a cheaper option). Do not invent numbers.",
      [{ role: "user", content: facts }],
      300,
    );
  } catch (err) {
    console.error(`[analyzer] ${AI_MODEL} explanation failed:`, err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

export async function analyzePurchaseAction(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  let checkId: string | null = null;
  let error: string | null = null;
  try {
    const typedItem = String(formData.get("item") ?? "").trim().slice(0, 80);
    const priceField = String(formData.get("price") ?? "").trim();
    let priceCents = priceField ? parseDollarsToCents(priceField) : null;
    if (priceField && priceCents === null) {
      throw new UserError(`Enter a price like 49.99 (between $0.01 and ${formatCents(MAX_CHARGE_CENTS)}).`);
    }
    let item = typedItem;
    // The store the photo autofill read (hidden form field); null when there was none.
    const store = cleanStoreName(formData.get("store"));

    const photo = formData.get("photo");
    const hasPhoto = photo instanceof File && photo.size > 0;
    let aiExtracted = false;
    let usedPhoto = false;

    if (hasPhoto) {
      if (photo.size > MAX_PHOTO_BYTES) throw new UserError("That photo is over 5 MB. Choose a smaller image.");
      const mediaType = photo.type as ImageMediaType;
      if (!IMAGE_MEDIA_TYPES.includes(mediaType)) throw new UserError("Upload a JPG, PNG, WebP or GIF image.");

      // Only call vision when something is still missing; typed values always win.
      if ((!item || priceCents === null) && visionEnabled()) {
        try {
          const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
          const read = await extractPurchaseFromImage(base64, mediaType);
          if (!item && read.item) {
            item = read.item;
            aiExtracted = true;
          }
          if (priceCents === null && read.priceCents !== null) {
            priceCents = Math.min(read.priceCents, MAX_CHARGE_CENTS);
            aiExtracted = true;
          }
          usedPhoto = aiExtracted;
        } catch (err) {
          console.error("[analyzer] photo read failed:", err instanceof Error ? err.message : "unknown error");
          throw new UserError("I could not read that photo. Type the item name and price instead.");
        }
      }
    }

    if (!item && priceCents === null) {
      throw new UserError(
        hasPhoto && !visionEnabled()
          ? "Photo reading is off (it needs Claude, and private mode keeps photos on this device). Type the item name and price."
          : "Enter an item name and price, or upload a photo.",
      );
    }
    if (priceCents === null) {
      throw new UserError(
        hasPhoto ? "I could not see a price in that photo. Type the price." : "Enter the item's price.",
      );
    }
    if (!item) {
      if (hasPhoto) throw new UserError("I could not tell what the item is. Type the item name.");
      throw new UserError("Enter an item name.");
    }

    const finance = await getFinance(workspaceId);
    const analysis = analyzePurchase(buildPurchaseInput(finance, priceCents));
    const explanation = await explain(item, analysis);
    const stored: StoredAnalysis = {
      ...analysis,
      source: usedPhoto ? "photo" : "typed",
      aiExtracted,
      explanation,
      store,
    };

    checkId = randomUUID();
    const db = await getDb();
    await db.insert(purchaseChecks).values({
      id: checkId,
      workspaceId,
      item,
      priceCents,
      verdict: analysis.verdict,
      analysis: JSON.stringify(stored),
      createdAt: finance.now,
    });
  } catch (err) {
    if (err instanceof WorkspaceMissingError) redirect("/?expired=1");
    if (err instanceof UserError) error = err.message;
    else {
      console.error("[analyzer]", err);
      error = "Something went wrong analyzing that purchase. Try again.";
    }
  }
  revalidatePath("/app", "layout");
  if (error || !checkId) fail(error ?? "Something went wrong analyzing that purchase. Try again.");
  redirect(`${BACK}?check=${checkId}`);
}
