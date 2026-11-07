// Service-layer tests against a throwaway SQLite file, in simulated mode. They
// walk the same two workflows Wren tests in the browser, plus workspace isolation.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Guard = typeof import("./guard");
let guard: Guard;
const dir = mkdtempSync(join(tmpdir(), "verafund-test-"));

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
  delete process.env.STRIPE_SECRET_KEY;
  guard = await import("./guard");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits; the OS temp dir cleans it up.
  }
});

async function subByMerchant(ws: string, merchant: string) {
  const { subscriptions } = await guard.getDashboard(ws);
  const sub = subscriptions.find((s) => s.merchant === merchant);
  if (!sub) throw new Error(`no ${merchant}`);
  return sub;
}

describe("W1: price hike blocked, then approved", () => {
  it("declines above the limit, approves the new price, then lets it through", async () => {
    const ws = await guard.createDemoWorkspace();
    const netflix = await subByMerchant(ws, "Netflix");
    expect(netflix.limitCents).toBe(1599);
    expect(netflix.cardProvider).toBe("simulated");

    await guard.simulateCharge(ws, netflix.id, 1899);
    let sub = await subByMerchant(ws, "Netflix");
    expect(sub.lastCharge).toMatchObject({ approved: false, reason: "above_limit" });
    expect(sub.lastCharge!.reasonText).toBe("$18.99 is above your $15.99 limit");
    expect(sub.pendingPriceChange?.id).toBe(sub.lastCharge!.id);

    await guard.approveNewPrice(ws, sub.lastCharge!.id);
    sub = await subByMerchant(ws, "Netflix");
    expect(sub).toMatchObject({ limitCents: 1899, amountCents: 1899, pendingPriceChange: null });

    await guard.simulateCharge(ws, netflix.id, 1899);
    sub = await subByMerchant(ws, "Netflix");
    expect(sub.lastCharge).toMatchObject({ approved: true, reason: null });

    const { timeline } = await guard.getSubscriptionDetail(ws, netflix.id);
    const kinds = timeline.map((t) => (t.kind === "charge" ? (t.charge.approved ? "approved" : "declined") : t.event.type));
    expect(kinds.slice(0, 4)).toEqual(["approved", "limit_changed", "declined", "created"]);
  });

  it("can keep blocking instead, and won't accept a second answer", async () => {
    const ws = await guard.createDemoWorkspace();
    const spotify = await subByMerchant(ws, "Spotify");
    await guard.simulateCharge(ws, spotify.id, 1499);
    const declined = (await subByMerchant(ws, "Spotify")).lastCharge!;

    await guard.keepBlocking(ws, declined.id);
    const sub = await subByMerchant(ws, "Spotify");
    expect(sub).toMatchObject({ limitCents: 1199, pendingPriceChange: null });
    await expect(guard.approveNewPrice(ws, declined.id)).rejects.toThrow(guard.GuardError);
  });

  it("refuses to treat an approved charge as a price change", async () => {
    const ws = await guard.createDemoWorkspace();
    const gym = await subByMerchant(ws, "Planet Fitness");
    await guard.simulateCharge(ws, gym.id, 2499);
    const approved = (await subByMerchant(ws, "Planet Fitness")).lastCharge!;
    await expect(guard.approveNewPrice(ws, approved.id)).rejects.toThrow(guard.GuardError);
    await expect(guard.keepBlocking(ws, approved.id)).rejects.toThrow(guard.GuardError);
  });
});

describe("W2: free trial can't silently convert", () => {
  it("locks the card when the trial ends and declines the conversion charge", async () => {
    const ws = await guard.createDemoWorkspace();
    await guard.addSubscription(ws, {
      merchant: "Calm",
      category: "Wellness",
      amountCents: 1299,
      cycle: "monthly",
      trialDays: 7,
    });
    let calm = await subByMerchant(ws, "Calm");
    expect(calm).toMatchObject({ kind: "trial", status: "trial", cardStatus: "active" });

    await guard.simulateCharge(ws, calm.id, 1299);
    expect((await subByMerchant(ws, "Calm")).lastCharge?.approved).toBe(true);

    await guard.jumpAhead(ws, 8);
    calm = await subByMerchant(ws, "Calm");
    expect(calm).toMatchObject({ status: "trial_ended", cardStatus: "inactive" });
    expect((await subByMerchant(ws, "Adobe Creative Cloud")).status).toBe("trial_ended");

    await guard.simulateCharge(ws, calm.id, 1299);
    calm = await subByMerchant(ws, "Calm");
    expect(calm.lastCharge).toMatchObject({ approved: false, reason: "trial_ended" });
    expect(calm.status).not.toBe("cancelled");

    await expect(guard.setCardPaused(ws, calm.id, false)).rejects.toThrow(/Keep subscription/);

    await guard.keepAfterTrial(ws, calm.id);
    await guard.simulateCharge(ws, calm.id, 1299);
    calm = await subByMerchant(ws, "Calm");
    expect(calm).toMatchObject({ kind: "paid", status: "active", cardStatus: "active" });
    expect(calm.lastCharge?.approved).toBe(true);
  });
});

describe("card controls", () => {
  it("pause, resume and close change what gets through", async () => {
    const ws = await guard.createDemoWorkspace();
    const netflix = await subByMerchant(ws, "Netflix");

    await guard.setCardPaused(ws, netflix.id, true);
    await guard.simulateCharge(ws, netflix.id, 1599);
    expect((await subByMerchant(ws, "Netflix")).lastCharge?.reason).toBe("card_paused");

    await guard.setCardPaused(ws, netflix.id, false);
    await guard.simulateCharge(ws, netflix.id, 1599);
    expect((await subByMerchant(ws, "Netflix")).lastCharge?.approved).toBe(true);

    await guard.markCancelled(ws, netflix.id);
    await guard.simulateCharge(ws, netflix.id, 100);
    const closed = await subByMerchant(ws, "Netflix");
    expect(closed).toMatchObject({ status: "cancelled", cardStatus: "canceled" });
    expect(closed.lastCharge?.reason).toBe("card_closed");
    await expect(guard.setCardPaused(ws, netflix.id, false)).rejects.toThrow(guard.GuardError);
  });
});

describe("workspace isolation", () => {
  it("never lets one demo touch another demo's subscriptions or charges", async () => {
    const a = await guard.createDemoWorkspace();
    const b = await guard.createDemoWorkspace();
    const aNetflix = await subByMerchant(a, "Netflix");
    await guard.simulateCharge(a, aNetflix.id, 1899);
    const aCharge = (await subByMerchant(a, "Netflix")).lastCharge!;

    await expect(guard.simulateCharge(b, aNetflix.id, 100)).rejects.toThrow(guard.GuardError);
    await expect(guard.approveNewPrice(b, aCharge.id)).rejects.toThrow(guard.GuardError);
    await expect(guard.markCancelled(b, aNetflix.id)).rejects.toThrow(guard.GuardError);
    await expect(guard.getSubscriptionDetail(b, aNetflix.id)).rejects.toThrow(guard.GuardError);

    const bNetflix = await subByMerchant(b, "Netflix");
    expect(bNetflix.lastCharge).toBeNull();
    expect((await guard.getActivity(b)).timeline.every((t) => t.kind === "event")).toBe(true);
  });

  it("reports a missing workspace distinctly so the UI can restart the demo", async () => {
    await expect(guard.getDashboard("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      guard.WorkspaceMissingError,
    );
  });
});
