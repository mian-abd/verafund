import { describe, expect, it } from "vitest";
import { sniffImageMediaType } from "./image";
import { createRateLimiter, sharedLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit per key, then reports when to retry", () => {
    let now = 1_000_000;
    const limiter = createRateLimiter(3, 3_600_000, () => now);
    expect(limiter.take("ws-a")).toEqual({ ok: true });
    now += 60_000;
    expect(limiter.take("ws-a")).toEqual({ ok: true });
    expect(limiter.take("ws-a")).toEqual({ ok: true });
    const blocked = limiter.take("ws-a");
    expect(blocked.ok).toBe(false);
    // The oldest hit was 60 s ago, so the slot frees in 3540 s.
    if (!blocked.ok) expect(blocked.retryAfterSec).toBe(3540);
  });

  it("keeps workspaces separate", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
    expect(limiter.take("b").ok).toBe(true);
  });

  it("frees a slot once the window has passed", () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    limiter.take("a");
    limiter.take("a");
    expect(limiter.take("a").ok).toBe(false);
    now = 1001;
    expect(limiter.take("a").ok).toBe(true);
  });

  it("does not count rejected attempts", () => {
    let now = 0;
    const limiter = createRateLimiter(1, 1000, () => now);
    limiter.take("a");
    now = 500;
    limiter.take("a");
    limiter.take("a");
    now = 1001; // only the first accepted hit mattered
    expect(limiter.take("a").ok).toBe(true);
  });
});

describe("sharedLimiter", () => {
  it("returns the same limiter for the same name", () => {
    expect(sharedLimiter("test-shared", 5, 1000)).toBe(sharedLimiter("test-shared", 5, 1000));
    expect(sharedLimiter("test-shared-2", 5, 1000)).not.toBe(sharedLimiter("test-shared", 5, 1000));
  });
});

describe("sniffImageMediaType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const text = (s: string) => Uint8Array.from(Array.from(s).map((c) => c.charCodeAt(0)));

  it("recognises the four accepted formats", () => {
    expect(sniffImageMediaType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(sniffImageMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffImageMediaType(text("GIF89a......"))).toBe("image/gif");
    expect(sniffImageMediaType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects everything else", () => {
    expect(sniffImageMediaType(text("<html><body>not an image</body></html>"))).toBeNull();
    expect(sniffImageMediaType(text("%PDF-1.7"))).toBeNull();
    expect(sniffImageMediaType(text("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
    expect(sniffImageMediaType(bytes())).toBeNull();
    expect(sniffImageMediaType(bytes(0xff, 0xd8))).toBeNull();
  });
});
