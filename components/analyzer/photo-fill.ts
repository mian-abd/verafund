// The rules for filling the Item and Price inputs from a photo. Pure, so they are unit tested.
// Typed values always win: a field takes the photo's value only when it is empty or an earlier
// photo filled it.

export interface FillState {
  item: string;
  price: string;
  itemFromPhoto: boolean;
  priceFromPhoto: boolean;
}

export interface PhotoRead {
  item: string | null;
  priceCents: number | null;
  store: string | null;
}

export const EMPTY_FILL: FillState = { item: "", price: "", itemFromPhoto: false, priceFromPhoto: false };

function fillField(current: string, fromPhoto: boolean, value: string | null): { value: string; fromPhoto: boolean } {
  const isOurs = current.trim() === "" || fromPhoto;
  if (!isOurs) return { value: current, fromPhoto: false }; // typed value wins
  if (value === null) {
    // This photo has nothing for the field: drop what an earlier photo put there.
    return { value: fromPhoto ? "" : current, fromPhoto: false };
  }
  return { value, fromPhoto: true };
}

export function applyPhotoRead(prev: FillState, read: PhotoRead): FillState {
  const item = fillField(prev.item, prev.itemFromPhoto, read.item);
  const price = fillField(prev.price, prev.priceFromPhoto, read.priceCents === null ? null : (read.priceCents / 100).toFixed(2));
  return { item: item.value, price: price.value, itemFromPhoto: item.fromPhoto, priceFromPhoto: price.fromPhoto };
}

// The photo was removed or replaced by one that failed: take back what it filled, keep the rest.
export function clearPhotoFill(prev: FillState): FillState {
  return {
    item: prev.itemFromPhoto ? "" : prev.item,
    price: prev.priceFromPhoto ? "" : prev.price,
    itemFromPhoto: false,
    priceFromPhoto: false,
  };
}

// Reads the extract route's JSON defensively. Null when the response is unusable.
export function parsePhotoRead(data: unknown): PhotoRead | null {
  if (typeof data !== "object" || data === null) return null;
  const raw = data as Record<string, unknown>;
  const item = typeof raw.item === "string" && raw.item.trim() ? raw.item.trim().slice(0, 80) : null;
  const priceCents =
    typeof raw.priceCents === "number" && Number.isInteger(raw.priceCents) && raw.priceCents > 0 ? raw.priceCents : null;
  const store = typeof raw.store === "string" && raw.store.trim() ? raw.store.trim().slice(0, 60) : null;
  if (item === null && priceCents === null) return null; // nothing to fill
  return { item, priceCents, store };
}
