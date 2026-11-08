// Credential check, sign-up validation, and the display name that UserMenu shows.
// The DB is only opened by the display-name test, against a throwaway SQLite file.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type Auth = typeof import("./auth");
type Guard = typeof import("./guard");
let auth: Auth;
let guard: Guard;
const dir = mkdtempSync(join(tmpdir(), "verafund-auth-test-"));

beforeAll(async () => {
  delete process.env.DEMO_LOGIN_EMAIL;
  delete process.env.DEMO_LOGIN_PASSWORD;
  process.env.DATABASE_URL = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
  delete process.env.STRIPE_SECRET_KEY;
  auth = await import("./auth");
  guard = await import("./guard");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits.
  }
});

afterEach(() => {
  delete process.env.DEMO_LOGIN_EMAIL;
  delete process.env.DEMO_LOGIN_PASSWORD;
});

describe("checkCredentials", () => {
  it("uses the documented defaults", () => {
    expect(auth.DEMO_EMAIL).toBe("demo@verafund.app");
    expect(auth.DEMO_PASSWORD).toBe("vera2026");
  });

  it("accepts the demo login", () => {
    expect(auth.checkCredentials("demo@verafund.app", "vera2026")).toBe(true);
  });

  it("ignores case and surrounding spaces in the email, but not in the password", () => {
    expect(auth.checkCredentials("  Demo@VeraFund.APP ", "vera2026")).toBe(true);
    expect(auth.checkCredentials("demo@verafund.app", "Vera2026")).toBe(false);
    expect(auth.checkCredentials("demo@verafund.app", " vera2026")).toBe(false);
  });

  it("rejects a wrong password, a wrong email, and both", () => {
    expect(auth.checkCredentials("demo@verafund.app", "wrong-password")).toBe(false);
    expect(auth.checkCredentials("someone@else.com", "vera2026")).toBe(false);
    expect(auth.checkCredentials("someone@else.com", "nope")).toBe(false);
  });

  it("handles passwords of any length without throwing", () => {
    expect(auth.checkCredentials("demo@verafund.app", "")).toBe(false);
    expect(auth.checkCredentials("demo@verafund.app", "v")).toBe(false);
    expect(auth.checkCredentials("demo@verafund.app", "vera2026".repeat(500))).toBe(false);
  });

  it("rejects missing or non-string values", () => {
    expect(auth.checkCredentials(null, null)).toBe(false);
    expect(auth.checkCredentials(undefined, "vera2026")).toBe(false);
    expect(auth.checkCredentials("demo@verafund.app", undefined)).toBe(false);
    expect(auth.checkCredentials(42, 42)).toBe(false);
  });

  it("can be overridden from the environment", async () => {
    process.env.DEMO_LOGIN_EMAIL = "Judge@Example.com";
    process.env.DEMO_LOGIN_PASSWORD = "s3cret-pass";
    vi.resetModules();
    const custom = await import("./auth");
    expect(custom.checkCredentials("judge@example.com", "s3cret-pass")).toBe(true);
    expect(custom.checkCredentials("demo@verafund.app", "vera2026")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases, and returns empty for non-strings", () => {
    expect(auth.normalizeEmail("  Jane.Doe@Example.COM  ")).toBe("jane.doe@example.com");
    expect(auth.normalizeEmail(undefined)).toBe("");
    expect(auth.normalizeEmail(7)).toBe("");
  });
});

describe("validateSignUp", () => {
  const good = { name: "Jane Doe", email: "jane@example.com", password: "longenough1" };

  it("accepts a valid form and trims the name", () => {
    expect(auth.validateSignUp({ ...good, name: "  Jane Doe  " })).toEqual({ ok: true, name: "Jane Doe" });
  });

  it("requires a name of 1 to 60 characters", () => {
    expect(auth.validateSignUp({ ...good, name: "   " })).toEqual({ ok: false, error: "Enter your name." });
    expect(auth.validateSignUp({ ...good, name: "x".repeat(61) })).toEqual({
      ok: false,
      error: "Keep your name to 60 characters or fewer.",
    });
    expect(auth.validateSignUp({ ...good, name: "x".repeat(60) }).ok).toBe(true);
  });

  it("requires a plausible email", () => {
    for (const email of ["", "nope", "a@b", "a b@c.com", "@c.com", "a@.com"]) {
      expect(auth.validateSignUp({ ...good, email })).toEqual({ ok: false, error: "Enter a valid email address." });
    }
    expect(auth.validateSignUp({ ...good, email: "  JANE@Example.com " }).ok).toBe(true);
  });

  it("requires a password of at least 8 characters", () => {
    expect(auth.validateSignUp({ ...good, password: "short7!" })).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
    expect(auth.validateSignUp({ ...good, password: undefined }).ok).toBe(false);
    expect(auth.validateSignUp({ ...good, password: "exactly8" }).ok).toBe(true);
  });
});

describe("display name (what UserMenu shows)", () => {
  it("reads the seeded name, and sign-up can rename it for that workspace only", async () => {
    const a = await guard.createDemoWorkspace();
    const b = await guard.createDemoWorkspace();
    expect(await auth.getDisplayName(a)).toBe("Alex Chen");
    await auth.setDisplayName(a, "Jane Doe");
    expect(await auth.getDisplayName(a)).toBe("Jane Doe");
    expect(await auth.getDisplayName(b)).toBe("Alex Chen");
    expect(await auth.getDisplayName("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
