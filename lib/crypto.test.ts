import { afterEach, describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./crypto";

describe("secrets at rest", () => {
  afterEach(() => {
    delete process.env.DATA_ENCRYPTION_KEY;
    delete process.env.PHONE_ALERT_SECRET;
  });

  it("round-trips and never stores the plain value", () => {
    process.env.DATA_ENCRYPTION_KEY = "test-key";
    const sealed = sealSecret("access-sandbox-123");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("access-sandbox-123");
    expect(openSecret(sealed)).toBe("access-sandbox-123");
  });

  it("uses a fresh IV each time", () => {
    process.env.DATA_ENCRYPTION_KEY = "test-key";
    expect(sealSecret("same")).not.toBe(sealSecret("same"));
  });

  it("reads values stored before encryption existed", () => {
    expect(openSecret("access-sandbox-legacy")).toBe("access-sandbox-legacy");
  });

  it("rejects a tampered value or a different key", () => {
    process.env.DATA_ENCRYPTION_KEY = "test-key";
    const sealed = sealSecret("access-sandbox-123");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(() => openSecret(tampered)).toThrow();
    process.env.DATA_ENCRYPTION_KEY = "other-key";
    expect(() => openSecret(sealed)).toThrow();
  });
});
