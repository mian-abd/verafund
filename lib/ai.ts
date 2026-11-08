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

// Private mode: with LLM_PROVIDER=ollama (or no Anthropic key but an OLLAMA_URL), text
// answers come from a local model, e.g. on the Jetson's GPU.
// Hybrid mode: AGENT_LLM_PROVIDER=ollama runs Vera's action choices on the local model
// while conversation stays on Claude.
export type LlmProvider = "anthropic" | "ollama";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const OLLAMA_TIMEOUT_MS = 90_000;

function resolveProvider(wanted: string | undefined): LlmProvider | null {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasOllama = Boolean(process.env.OLLAMA_URL?.trim());
  const w = wanted?.trim().toLowerCase();
  if (w === "ollama" && hasOllama) return "ollama";
  if (w === "anthropic" && hasKey) return "anthropic";
  if (hasKey) return "anthropic";
  if (hasOllama) return "ollama";
  return null;
}

export function llmProvider(): LlmProvider | null {
  return resolveProvider(process.env.LLM_PROVIDER);
}

export function agentLlmProvider(): LlmProvider | null {
  return resolveProvider(process.env.AGENT_LLM_PROVIDER || process.env.LLM_PROVIDER);
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

// Short label for the UI, e.g. "On-device · qwen2.5:3b".
export function llmLabel(): string | null {
  const p = llmProvider();
  if (p === "ollama") return `On-device · ${ollamaModel()}`;
  if (p === "anthropic") return "Claude";
  return null;
}

// Whether the local model is loaded right now, and how much of it sits in GPU memory.
export async function ollamaStatus(): Promise<{ model: string; loaded: boolean; vramBytes: number } | null> {
  const base = process.env.OLLAMA_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const model = ollamaModel();
  try {
    const res = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!res.ok) return { model, loaded: false, vramBytes: 0 };
    const json = (await res.json()) as { models?: Array<{ name?: string; model?: string; size_vram?: number }> };
    const hit = json.models?.find((m) => m.name === model || m.model === model);
    return { model, loaded: Boolean(hit), vramBytes: hit?.size_vram ?? 0 };
  } catch {
    return { model, loaded: false, vramBytes: 0 };
  }
}

export function aiEnabled(): boolean {
  return llmProvider() !== null;
}

// Reading photos needs Claude. In private mode photos stay on the device, so it is off.
export function visionEnabled(): boolean {
  return llmProvider() === "anthropic";
}

async function callOllama(system: string, messages: ChatTurn[], maxTokens: number): Promise<string> {
  const base = process.env.OLLAMA_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new AiUnavailableError("OLLAMA_URL is not set");
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        keep_alive: -1, // stay loaded: a cold load takes ~15 s on the Jetson
        // The snapshot Vera reasons over is long; the default context would truncate it.
        options: { num_ctx: 8192, num_predict: Math.min(maxTokens, 400), temperature: 0.4 },
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiUnavailableError(timedOut ? "Local model timed out" : "Could not reach the local model");
  }
  if (!res.ok) throw new AiUnavailableError(`Local model returned ${res.status}`);
  const json = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
  const text = json?.message?.content?.trim();
  if (!text) throw new AiUnavailableError("Local model returned an empty answer");
  return text;
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
  if (llmProvider() === "ollama") return callOllama(system, messages, maxTokens);
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

// ---------- Photo autofill: item, price and store (additive) ----------

export interface ExtractedPurchaseWithStore extends ExtractedPurchase {
  /** Retailer printed on the receipt or tag, e.g. "Best Buy". Null when not visible. */
  store: string | null;
}

// A store or retailer name from a model reply or a form field: one short plain line, or null.
export function cleanStoreName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (s.length < 2) return null;
  if (/^(n\/a|none|null|unknown|not visible|not shown|unreadable|store|retailer)$/i.test(s)) return null;
  return s;
}

// Same JSON as `parseExtraction`, plus the store. Never throws.
export function parseExtractionWithStore(text: string): ExtractedPurchaseWithStore {
  const base = parseExtraction(text);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ...base, store: null };
  try {
    const raw = JSON.parse(match[0]) as { store?: unknown };
    return { ...base, store: cleanStoreName(raw.store) };
  } catch {
    return { ...base, store: null };
  }
}

// Vision: like `extractPurchaseFromImage`, and also reads the retailer when it is visible.
// Throws AiUnavailableError when Claude cannot be reached; callers show "type it instead".
export async function extractPurchaseWithStore(
  base64: string,
  mediaType: ImageMediaType,
): Promise<ExtractedPurchaseWithStore> {
  const text = await callMessages({
    // Headroom for the model's own reasoning, which counts against max_tokens.
    maxTokens: 1024,
    system:
      "You read photos of products, price tags, shelf labels and receipts. Reply with only a JSON object " +
      '{"item": string|null, "price": number|null, "store": string|null}. "item" is a short product name (max 60 characters); ' +
      "for a photo taken in a store aisle, it is the product the photo is centered on. " +
      '"price" is the price in US dollars as a plain number: for a receipt, the total paid; for a product on a shelf, the ' +
      "selling price on its shelf label or price tag (use the sale price if one is shown, not the unit price per ounce or pound, " +
      "and not a crossed-out \"was\" price). If no price is printed anywhere in the photo, price is null: never guess a price " +
      "from what the product usually costs. " +
      '"store" is the retailer or store name when it is printed on the receipt, price tag or shelf label, or clearly ' +
      'visible in the photo (for example "Best Buy"). Do not guess the store from the product brand alone. ' +
      "Use null for anything you cannot read. No other text.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "What is the item, its price, and the store?" },
        ],
      },
    ],
  });
  return parseExtractionWithStore(text);
}
