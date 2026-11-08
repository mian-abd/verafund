// POST /api/analyzer/extract: read the item, price and store from a product or receipt photo, so
// the Purchase Analyzer form can fill itself the moment a photo is picked.
// multipart/form-data with a `photo` file. Returns { item, priceCents, store }, each possibly null.

import { extractPurchaseWithStore, IMAGE_MEDIA_TYPES, visionEnabled } from "@/lib/ai";
import { MAX_CHARGE_CENTS } from "@/lib/format";
import { getWorkspaceId } from "@/lib/session";
import { sniffImageMediaType } from "../_lib/image";
import { sharedLimiter } from "../_lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // same limit as the server action
const MAX_BODY_BYTES = MAX_PHOTO_BYTES + 256 * 1024; // plus multipart framing
const LIMIT_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

function reply(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return reply({ error: "Your session expired. Get started again." }, 401);

  // Reading photos needs Claude. In private mode photos stay on the device.
  if (!visionEnabled()) {
    return reply({ error: "Photo reading is off. It needs Claude, and private mode keeps photos on this device." }, 503);
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return reply({ error: "That photo is over 5 MB. Choose a smaller image." }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: "Send the photo as multipart form data." }, 400);
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return reply({ error: "Attach a photo." }, 400);
  if (photo.size > MAX_PHOTO_BYTES) return reply({ error: "That photo is over 5 MB. Choose a smaller image." }, 413);

  // Trust the bytes, not the browser's label.
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const mediaType = sniffImageMediaType(bytes);
  if (!mediaType || !IMAGE_MEDIA_TYPES.includes(mediaType)) {
    return reply({ error: "Upload a JPG, PNG, WebP or GIF image." }, 415);
  }

  // Only photos that will cost a Claude call count against the hourly limit.
  const taken = sharedLimiter("extract", LIMIT_PER_HOUR, HOUR_MS).take(workspaceId);
  if (!taken.ok) {
    return reply({ error: "Too many photos this hour. Type the item and price." }, 429, {
      "retry-after": String(taken.retryAfterSec),
    });
  }

  try {
    const read = await extractPurchaseWithStore(Buffer.from(bytes).toString("base64"), mediaType);
    return reply({
      item: read.item,
      priceCents: read.priceCents === null ? null : Math.min(read.priceCents, MAX_CHARGE_CENTS),
      store: read.store,
    });
  } catch (err) {
    // Message only: never the response body or any key.
    console.error("[analyzer extract] photo read failed:", err instanceof Error ? err.message : "unknown error");
    return reply({ error: "I couldn't read that photo, type the item and price" }, 502);
  }
}
