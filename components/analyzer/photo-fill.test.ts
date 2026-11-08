import { describe, expect, it } from "vitest";
import { applyPhotoRead, clearPhotoFill, EMPTY_FILL, parsePhotoRead, type FillState } from "./photo-fill";

const read = { item: "Sony WH-1000XM5", priceCents: 39999, store: "Best Buy" };

describe("applyPhotoRead", () => {
  it("fills both empty fields", () => {
    expect(applyPhotoRead(EMPTY_FILL, read)).toEqual({
      item: "Sony WH-1000XM5",
      price: "399.99",
      itemFromPhoto: true,
      priceFromPhoto: true,
    });
  });

  it("lets typed values win, field by field", () => {
    const typedItem: FillState = { ...EMPTY_FILL, item: "My headphones" };
    expect(applyPhotoRead(typedItem, read)).toEqual({
      item: "My headphones",
      price: "399.99",
      itemFromPhoto: false,
      priceFromPhoto: true,
    });
    const typedBoth: FillState = { ...EMPTY_FILL, item: "Mug", price: "12" };
    expect(applyPhotoRead(typedBoth, read)).toEqual({ item: "Mug", price: "12", itemFromPhoto: false, priceFromPhoto: false });
  });

  it("replaces values an earlier photo filled", () => {
    const first = applyPhotoRead(EMPTY_FILL, read);
    const second = applyPhotoRead(first, { item: "Kettle", priceCents: 4550, store: null });
    expect(second).toEqual({ item: "Kettle", price: "45.50", itemFromPhoto: true, priceFromPhoto: true });
  });

  it("clears a stale value when the new photo has nothing for that field", () => {
    const first = applyPhotoRead(EMPTY_FILL, read);
    const second = applyPhotoRead(first, { item: "Kettle", priceCents: null, store: null });
    expect(second).toEqual({ item: "Kettle", price: "", itemFromPhoto: true, priceFromPhoto: false });
  });

  it("keeps a typed value even when the photo has nothing for it", () => {
    const typed: FillState = { ...EMPTY_FILL, price: "20" };
    expect(applyPhotoRead(typed, { item: "Kettle", priceCents: null, store: null }).price).toBe("20");
  });

  it("treats a photo-filled value the user then edited as typed", () => {
    const edited: FillState = { ...applyPhotoRead(EMPTY_FILL, read), item: "Sony XM5 (black)", itemFromPhoto: false };
    expect(applyPhotoRead(edited, { item: "Kettle", priceCents: 4550, store: null }).item).toBe("Sony XM5 (black)");
  });

  it("formats whole-dollar prices with cents", () => {
    expect(applyPhotoRead(EMPTY_FILL, { item: null, priceCents: 6000, store: null }).price).toBe("60.00");
  });
});

describe("clearPhotoFill", () => {
  it("takes back only what the photo filled", () => {
    const mixed: FillState = { item: "My item", price: "399.99", itemFromPhoto: false, priceFromPhoto: true };
    expect(clearPhotoFill(mixed)).toEqual({ item: "My item", price: "", itemFromPhoto: false, priceFromPhoto: false });
    expect(clearPhotoFill(EMPTY_FILL)).toEqual(EMPTY_FILL);
  });
});

describe("parsePhotoRead", () => {
  it("reads a good response", () => {
    expect(parsePhotoRead({ item: " Mug ", priceCents: 1250, store: "Target" })).toEqual({ item: "Mug", priceCents: 1250, store: "Target" });
  });

  it("returns null when nothing is usable", () => {
    expect(parsePhotoRead({ item: null, priceCents: null, store: "Target" })).toBeNull();
    expect(parsePhotoRead({ error: "x" })).toBeNull();
    expect(parsePhotoRead(null)).toBeNull();
    expect(parsePhotoRead("no")).toBeNull();
  });

  it("ignores bad field types", () => {
    expect(parsePhotoRead({ item: 5, priceCents: "12.50", store: 3 })).toBeNull();
    expect(parsePhotoRead({ item: "Mug", priceCents: -4, store: "" })).toEqual({ item: "Mug", priceCents: null, store: null });
    expect(parsePhotoRead({ item: "Mug", priceCents: 12.5, store: null })?.priceCents).toBeNull();
  });
});
