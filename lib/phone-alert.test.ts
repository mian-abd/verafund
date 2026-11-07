import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { heardDecision } from "./call-words";
import { callScript, signCallToken, verifyCallToken } from "./phone-alert";

describe("call tokens", () => {
  beforeEach(() => {
    process.env.PHONE_ALERT_SECRET = "test-secret";
  });
  afterEach(() => {
    delete process.env.PHONE_ALERT_SECRET;
  });

  it("round-trips the workspace and transaction", () => {
    const token = signCallToken("ws-1", "tx-1", 1_000);
    expect(verifyCallToken(token, 2_000)).toEqual({ workspaceId: "ws-1", transactionId: "tx-1" });
  });

  it("rejects an expired token", () => {
    const token = signCallToken("ws-1", "tx-1", 0);
    expect(verifyCallToken(token, 2 * 60 * 60 * 1000)).toBeNull();
  });

  it("rejects a tampered payload or signature", () => {
    const token = signCallToken("ws-1", "tx-1", 1_000);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ w: "ws-2", t: "tx-1", e: 9e15 })).toString("base64url");
    expect(verifyCallToken(`${forged}.${sig}`, 2_000)).toBeNull();
    expect(verifyCallToken(`${payload}.x${sig.slice(1)}`, 2_000)).toBeNull();
    expect(verifyCallToken("garbage", 2_000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signCallToken("ws-1", "tx-1", 1_000);
    process.env.PHONE_ALERT_SECRET = "other";
    expect(verifyCallToken(token, 2_000)).toBeNull();
  });
});

describe("spoken answers", () => {
  it.each([
    ["yes", "yes"],
    ["yeah that was me", "yes"],
    ["it was me", "yes"],
    ["no", "no"],
    ["no that wasn't me", "no"],
    ["it was not me", "no"],
    ["block it", "no"],
    ["yes block it", "no"],
    ["hmm what", null],
  ])("%s -> %s", (text, want) => {
    expect(heardDecision(text)).toBe(want);
  });
});

it("the call script ends with how to answer", () => {
  expect(callScript("Lux Electronics", 64200)).toMatch(/Was this you\? Say yes if it was you, or no and I'll block it\.$/);
});
