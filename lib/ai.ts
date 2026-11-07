// Thin Anthropic Messages API client (plain fetch, no SDK). Every caller must treat a
// throw as "AI offline" and fall back to a rule-based answer. The API key is read from
// the environment per call and is never logged or returned.

export const AI_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 25_000;

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export const IMAGE_MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export class AiUnavailableError extends Error {}

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } };

async function callMessages(body: {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }>;
  maxTokens: number;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: body.maxTokens,
        ...(body.system ? { system: body.system } : {}),
        messages: body.messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiUnavailableError(timedOut ? "Claude request timed out" : "Could not reach the Claude API");
  }

  if (!res.ok) {
    // Status only: the response body is not logged or surfaced.
    throw new AiUnavailableError(`Claude API returned ${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }> } | null;
  const text = (json?.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  if (!text) throw new AiUnavailableError("Claude returned an empty answer");
  return text;
}

// The API wants the first turn to be from the user and roles to alternate; merge or drop to fit.
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const content = t.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n\n${content}`;
    else out.push({ role: t.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export async function askClaude(system: string, turns: ChatTurn[], maxTokens = 600): Promise<string> {
  const messages = normalizeTurns(turns);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    throw new AiUnavailableError("Nothing to answer");
  }
  return callMessages({ system, messages, maxTokens });
}

export interface ExtractedPurchase {
  item: string | null;
  priceCents: number | null;
}

// Vision: reads a product photo or receipt and returns the item name and price, if visible.
export async function extractPurchaseFromImage(base64: string, mediaType: ImageMediaType): Promise<ExtractedPurchase> {
  const text = await callMessages({
    maxTokens: 200,
    system:
      "You read photos of products, price tags and receipts. Reply with only a JSON object " +
      '{"item": string|null, "price": number|null}. "item" is a short product name (max 60 characters). ' +
      '"price" is the total price in US dollars as a plain number (for a receipt, the total paid). ' +
      "Use null for anything you cannot read. No other text.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "What is the item and its price?" },
        ],
      },
    ],
  });
  return parseExtraction(text);
}

export function parseExtraction(text: string): ExtractedPurchase {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { item: null, priceCents: null };
  try {
    const raw = JSON.parse(match[0]) as { item?: unknown; price?: unknown };
    const item = typeof raw.item === "string" && raw.item.trim() ? raw.item.trim().slice(0, 80) : null;
    const price =
      typeof raw.price === "number"
        ? raw.price
        : typeof raw.price === "string"
          ? Number(raw.price.replace(/[$,\s]/g, ""))
          : NaN;
    const cents = Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null;
    return { item, priceCents: cents };
  } catch {
    return { item: null, priceCents: null };
  }
}
