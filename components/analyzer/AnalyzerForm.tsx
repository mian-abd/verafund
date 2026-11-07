"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { analyzePurchaseAction } from "@/app/app/analyzer/actions";
import { SubmitButton } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
// Server actions accept ~1 MB bodies by default, so big photos are shrunk in the browser first.
const SHRINK_ABOVE_BYTES = 700 * 1024;
const MAX_EDGE = 1400;

async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || !file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function AnalyzerForm({ aiOnline, error }: { aiOnline: boolean; error: string | null }) {
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearPhoto() {
    if (fileInput.current) fileInput.current.value = "";
    setPhotoName(null);
    setPreviewUrl(null);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setPhotoError(null);
    if (!file) return clearPhoto();
    if (!file.type.startsWith("image/")) {
      clearPhoto();
      return setPhotoError("Choose an image file (JPG, PNG, WebP or GIF).");
    }
    if (file.size > MAX_BYTES) {
      clearPhoto();
      return setPhotoError("That photo is over 5 MB. Choose a smaller image.");
    }
    const small = await shrinkImage(file);
    if (small !== file) {
      try {
        const dt = new DataTransfer();
        dt.items.add(small);
        input.files = dt.files;
      } catch {
        // Keep the original file if the browser blocks replacing it.
      }
    }
    setPhotoName(file.name);
    setPreviewUrl(URL.createObjectURL(small));
  }

  const shownError = photoError ?? error;

  return (
    <form
      action={analyzePurchaseAction}
      data-testid="analyzer-form"
      className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6"
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">Check a purchase</h2>
        <p className="text-sm text-muted-foreground">
          Type what you want to buy, or snap a photo of the product or receipt.
        </p>
      </div>

      {shownError && (
        <p role="alert" data-testid="analyzer-error" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {shownError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1.5">
          <label htmlFor="analyzer-item" className="text-sm font-medium text-foreground">
            Item
          </label>
          <input
            id="analyzer-item"
            name="item"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="Noise-cancelling headphones"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            data-testid="analyzer-item"
            className="block w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="analyzer-price" className="text-sm font-medium text-foreground">
            Price (USD)
          </label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground">
              $
            </span>
            <input
              id="analyzer-price"
              name="price"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="199.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="analyzer-price"
              className="block w-full rounded-xl border border-input bg-background py-2.5 pl-7 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="analyzer-photo" className="text-sm font-medium text-foreground">
          Photo of the product or receipt <span className="font-normal text-muted-foreground">(optional, up to 5 MB)</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="analyzer-photo"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40"
          >
            <ImagePlus size={16} aria-hidden="true" />
            {photoName ? "Change photo" : "Upload photo"}
          </label>
          <input
            ref={fileInput}
            id="analyzer-photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/*"
            onChange={onPhoto}
            data-testid="analyzer-photo"
            className="sr-only"
          />
          {previewUrl && (
            <div className="flex items-center gap-2" data-testid="analyzer-photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Selected product or receipt" className="h-12 w-12 rounded-lg border border-border object-cover" />
              <span className="max-w-[160px] truncate text-xs text-muted-foreground">{photoName}</span>
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="analyzer-vision-note">
          {aiOnline
            ? "Claude will read the item and price from your photo. Anything you type overrides it."
            : "Photo reading is offline right now, so type the item and price. The analysis works the same."}
        </p>
      </div>

      <SubmitButton pendingText="Analyzing…" data-testid="analyzer-submit" className="w-full sm:w-auto">
        Analyze purchase
      </SubmitButton>
    </form>
  );
}
