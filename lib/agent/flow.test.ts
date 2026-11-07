// End-to-end tests of the agent against a throwaway SQLite file, simulated payments, and no
// network: no Anthropic, Jev or Ollama, so every route here is a preset or the keyword fallback.
// They check the safety model: propose first, nothing runs until that exact action id is
// confirmed, once only, within five minutes, scoped to one workspace.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The conversation path and discovery live elsewhere; they are stubbed so this stays offline.
vi.mock("../vera-chat", () => ({
  askVera: vi.fn(async (_ws: string, q: string) => ({ text: `ANSWER: ${q}`, ai: false })),
}));
vi.mock("../discovery", () => ({
  discoverSubscriptions: vi.fn(async () => []),
  guardDiscovered: vi.fn(async () => 0),
}));

type Flow = typeof import("./flow");
type Guard = typeof import("../guard");
let flow: Flow;
let guard: Guard;
let discovery: typeof import("../discovery");
let vera: typeof import("../vera-chat");
const dir = mkdtempSync(join(tmpdir(), "verafund-agent-"));
const SAVED: Record<string, string | undefined> = {};
const ENV = ["ANTHROPIC_API_KEY", "TYPESAFE_API_KEY", "OLLAMA_URL", "LLM_PROVIDER", "AGENT_LLM_PROVIDER", "STRIPE_SECRET_KEY"];

beforeAll(async () => {
  for (const k of ENV) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
  process.env.DATABASE_URL = `file:${join(dir, "agent.db").replace(/\\/g, "/")}`;
  guard = await import("../guard");
  flow = await import("./flow");
  discovery = await import("../discovery");
  vera = await import("../vera-chat");
});

afterAll(() => {
  for (const k of ENV) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits.
  }
});

beforeEach(() => {
  vi.mocked(vera.askVera).mockClear();
});

async function dbs() {
  const { getDb } = await import("../db/client");
  const schema = await import("../db/schema");
  return { db: await getDb(), ...schema };
}

async function sub(ws: string, merchant: string) {
  const d = await guard.getDashboard(ws);
  const s = d.subscriptions.find((x) => x.merchant === merchant);
  if (!s) throw new Error(`no ${merchant}`);
  return s;
}

async function notificationsOf(ws: string) {
  const { db, notifications } = await dbs();
  return db.select().from(notifications).where(eq(notifications.workspaceId, ws));
}

async function actionRow(ws: string, id: string) {
  const { db, agentActions } = await dbs();
  const [row] = await db.select().from(agentActions).where(and(eq(agentActions.id, id), eq(agentActions.workspaceId, ws)));
  return row;
}

async function propose(ws: string, text: string, opts: { voice?: boolean } = {}) {
  const reply = await flow.handleAgentMessage(ws, text, opts);
  if (reply.kind !== "confirm") throw new Error(`expected confirm, got ${JSON.stringify(reply)}`);
  return reply;
}

describe("cancel Netflix: propose, read back, confirm, evidence", () => {
  it("stores a pending action with the read-back and changes nothing until confirmed", async () => {
    const ws = await guard.createDemoWorkspace();
    const reply = await propose(ws, "Vera, cancel Netflix");
    expect(reply.tool).toBe("cancel_subscription");
    expect(reply.summary).toBe(
      "Netflix is $15.99 a month. I'll close its card so they can't charge you again and draft a cancellation message. Should I go ahead?",
    );

    const row = await actionRow(ws, reply.actionId);
    expect(row).toMatchObject({ status: "pending", tool: "cancel_subscription", channel: "chat", result: null });
    expect((await sub(ws, "Netflix")).status).toBe("active");
    expect(await notificationsOf(ws)).toHaveLength(0);
    expect(vera.askVera).not.toHaveBeenCalled();
  });

  it("closes the card on yes, records the result, logs evidence and notifies", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");

    const reply = await flow.confirmFromButton(ws, actionId, "yes");
    expect(reply).toMatchObject({ kind: "done", ok: true, refresh: true });
    if (reply.kind !== "done") return;
    expect(reply.text).toMatch(/closed the Netflix card/i);
    expect(reply.text).not.toMatch(/subscription (?:is|has been) cancell?ed/i);
    expect(reply.draft).toMatch(/Please cancel my Netflix subscription/);

    expect(await sub(ws, "Netflix")).toMatchObject({ status: "cancelled", cardStatus: "canceled" });
    expect(await actionRow(ws, actionId)).toMatchObject({ status: "executed" });
    const { timeline } = await guard.getSubscriptionDetail(ws, (await sub(ws, "Netflix")).id);
    expect(timeline.some((t) => t.kind === "event" && t.event.type === "cancelled")).toBe(true);

    const notes = await notificationsOf(ws);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Vera closed the Netflix card");
    expect(notes[0].body).toMatch(/You confirmed in the app/);
  });

  it("says 'by voice' in the notification when a spoken yes confirmed it", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix", { voice: true });
    const reply = await flow.handleVoiceTranscript(ws, "yeah do it", actionId);
    expect(reply.kind).toBe("done");
    expect((await notificationsOf(ws))[0].body).toMatch(/You confirmed by voice/);
    expect((await actionRow(ws, actionId)).channel).toBe("voice");
  });

  it("runs once even if the confirm button is hit twice at the same time", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Spotify");
    const results = await Promise.all([flow.confirmFromButton(ws, actionId, "yes"), flow.confirmFromButton(ws, actionId, "yes")]);
    expect(results.filter((r) => r.kind === "done" && r.refresh)).toHaveLength(1);
    expect(await notificationsOf(ws)).toHaveLength(1);
    const { policyEvents, db } = await dbs();
    const events = await db.select().from(policyEvents).where(eq(policyEvents.workspaceId, ws));
    expect(events.filter((e) => e.type === "cancelled")).toHaveLength(1);
  });

  it("a second confirm after it ran reports the earlier result instead of running again", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Spotify");
    await flow.confirmFromButton(ws, actionId, "yes");
    const again = await flow.confirmFromButton(ws, actionId, "yes");
    expect(again).toMatchObject({ kind: "done", refresh: false });
    expect(await notificationsOf(ws)).toHaveLength(1);
  });

  it("no cancels the request and leaves the card alone", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");
    const reply = await flow.confirmFromButton(ws, actionId, "no");
    expect(reply).toMatchObject({ kind: "cancelled", status: "cancelled" });
    expect((await actionRow(ws, actionId)).status).toBe("cancelled");
    expect((await sub(ws, "Netflix")).status).toBe("active");
    // and a late yes on the cancelled request does nothing
    const late = await flow.confirmFromButton(ws, actionId, "yes");
    expect(late.kind).toBe("cancelled");
    expect((await sub(ws, "Netflix")).status).toBe("active");
  });
});

describe("expiry and isolation", () => {
  it("a pending action older than five minutes can't be confirmed", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");
    const { db, agentActions } = await dbs();
    await db.update(agentActions).set({ createdAt: Date.now() - 6 * 60_000 }).where(eq(agentActions.id, actionId));

    const reply = await flow.confirmFromButton(ws, actionId, "yes");
    expect(reply).toMatchObject({ kind: "cancelled", status: "expired" });
    expect((await actionRow(ws, actionId)).status).toBe("expired");
    expect((await sub(ws, "Netflix")).status).toBe("active");
    expect(await notificationsOf(ws)).toHaveLength(0);
  });

  it("a spoken yes to an expired action does nothing either", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix", { voice: true });
    const { db, agentActions } = await dbs();
    await db.update(agentActions).set({ createdAt: Date.now() - 6 * 60_000 }).where(eq(agentActions.id, actionId));
    const reply = await flow.handleVoiceTranscript(ws, "yes", actionId);
    expect(reply).toMatchObject({ kind: "cancelled", status: "expired" });
    expect((await sub(ws, "Netflix")).status).toBe("active");
  });

  it("another workspace can't confirm, cancel or hear about this action", async () => {
    const a = await guard.createDemoWorkspace();
    const b = await guard.createDemoWorkspace();
    const { actionId } = await propose(a, "cancel Netflix");
    await expect(flow.confirmFromButton(b, actionId, "yes")).rejects.toThrow(/doesn't exist/);
    await expect(flow.confirmFromButton(b, actionId, "no")).rejects.toThrow(/doesn't exist/);
    const spoken = await flow.handleVoiceTranscript(b, "yes", actionId);
    expect(spoken.kind).toBe("clarify");
    expect((await sub(a, "Netflix")).status).toBe("active");
    expect((await sub(b, "Netflix")).status).toBe("active");
    expect((await flow.getAgentOverview(b)).actions).toHaveLength(0);
    expect((await flow.getAgentOverview(a)).pending?.actionId).toBe(actionId);
  });

  it("a newer request withdraws the older one that was waiting", async () => {
    const ws = await guard.createDemoWorkspace();
    const first = await propose(ws, "cancel Netflix");
    const second = await propose(ws, "pause Spotify");
    expect((await actionRow(ws, first.actionId)).status).toBe("cancelled");
    expect((await actionRow(ws, second.actionId)).status).toBe("pending");
    expect((await flow.getAgentOverview(ws)).pending?.actionId).toBe(second.actionId);
  });
});

describe("typed and spoken replies", () => {
  it("a typed 'yes' never executes: it points at the button", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");
    const reply = await flow.handleAgentMessage(ws, "yes");
    expect(reply).toMatchObject({ kind: "clarify", actionId });
    expect(reply.kind === "clarify" && reply.text).toMatch(/tap/i);
    expect((await sub(ws, "Netflix")).status).toBe("active");
    expect((await actionRow(ws, actionId)).status).toBe("pending");
  });

  it("a typed 'no' cancels the waiting request", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");
    expect(await flow.handleAgentMessage(ws, "no")).toMatchObject({ kind: "cancelled" });
    expect((await actionRow(ws, actionId)).status).toBe("cancelled");
  });

  it("voice: 'no wait' cancels, an unclear reply asks again, a clear yes runs it", async () => {
    const ws = await guard.createDemoWorkspace();
    const first = await propose(ws, "pause Spotify", { voice: true });
    expect(await flow.handleVoiceTranscript(ws, "no wait", first.actionId)).toMatchObject({ kind: "cancelled" });
    expect((await sub(ws, "Spotify")).cardStatus).toBe("active");

    const second = await propose(ws, "pause Spotify", { voice: true });
    const unclear = await flow.handleVoiceTranscript(ws, "hmm I'm not sure", second.actionId);
    expect(unclear).toMatchObject({ kind: "clarify", actionId: second.actionId });
    expect((await actionRow(ws, second.actionId)).status).toBe("pending");
    const yes = await flow.handleVoiceTranscript(ws, "yes please", second.actionId);
    expect(yes).toMatchObject({ kind: "done", ok: true });
    expect((await sub(ws, "Spotify")).cardStatus).toBe("inactive");
  });

  it("voice: a different request while a read-back is waiting is handled as a new request", async () => {
    const ws = await guard.createDemoWorkspace();
    const first = await propose(ws, "cancel Netflix", { voice: true });
    const reply = await flow.handleVoiceTranscript(ws, "actually pause Spotify instead", first.actionId);
    expect(reply).toMatchObject({ kind: "confirm", tool: "pause_card" });
    expect((await actionRow(ws, first.actionId)).status).toBe("cancelled");
    expect((await sub(ws, "Netflix")).status).toBe("active");
  });
});

describe("clarify instead of guessing", () => {
  it("an unknown merchant gets a question, not a pending action", async () => {
    const ws = await guard.createDemoWorkspace();
    const reply = await flow.handleAgentMessage(ws, "cancel Hulu");
    expect(reply.kind).toBe("clarify");
    expect(reply.kind === "clarify" && reply.text).toMatch(/couldn't find .*Hulu.*Netflix/);
    expect((await flow.getAgentOverview(ws)).actions).toHaveLength(0);
  });
});

describe("other actions", () => {
  it("pause then resume a card", async () => {
    const ws = await guard.createDemoWorkspace();
    await flow.confirmFromButton(ws, (await propose(ws, "pause Spotify")).actionId, "yes");
    expect((await sub(ws, "Spotify")).cardStatus).toBe("inactive");
    await flow.confirmFromButton(ws, (await propose(ws, "resume Spotify")).actionId, "yes");
    expect((await sub(ws, "Spotify")).cardStatus).toBe("active");
  });

  it("approve the new price raises the limit using the real pending charge", async () => {
    const ws = await guard.createDemoWorkspace();
    const netflix = await sub(ws, "Netflix");
    await guard.simulateCharge(ws, netflix.id, 1899);
    const reply = await propose(ws, "approve it");
    expect(reply.summary).toContain("$18.99");
    await flow.confirmFromButton(ws, reply.actionId, "yes");
    expect(await sub(ws, "Netflix")).toMatchObject({ limitCents: 1899, pendingPriceChange: null });
  });

  it("keep blocking leaves the limit and records the answer", async () => {
    const ws = await guard.createDemoWorkspace();
    const netflix = await sub(ws, "Netflix");
    await guard.simulateCharge(ws, netflix.id, 1899);
    await flow.confirmFromButton(ws, (await propose(ws, "keep blocking Netflix")).actionId, "yes");
    expect(await sub(ws, "Netflix")).toMatchObject({ limitCents: 1599, pendingPriceChange: null });
  });

  it("keep Adobe after the trial", async () => {
    const ws = await guard.createDemoWorkspace();
    await flow.confirmFromButton(ws, (await propose(ws, "keep Adobe after the trial")).actionId, "yes");
    expect(await sub(ws, "Adobe Creative Cloud")).toMatchObject({ kind: "paid", status: "active" });
  });

  it("create a new guarded card", async () => {
    const ws = await guard.createDemoWorkspace();
    const reply = await propose(ws, "create a card for Hulu with a $12 limit");
    expect(reply.summary).toMatch(/Hulu.*\$12\.00/);
    await flow.confirmFromButton(ws, reply.actionId, "yes");
    expect(await sub(ws, "Hulu")).toMatchObject({ limitCents: 1200, cardStatus: "active", status: "active" });
  });

  it("set a budget", async () => {
    const ws = await guard.createDemoWorkspace();
    await flow.confirmFromButton(ws, (await propose(ws, "set my food budget to $300")).actionId, "yes");
    const { db, budgets } = await dbs();
    const rows = await db.select().from(budgets).where(and(eq(budgets.workspaceId, ws), eq(budgets.category, "food")));
    expect(rows).toHaveLength(1);
    expect(rows[0].limitCents).toBe(30000);
  });

  it("add to a goal, but never past its target", async () => {
    const ws = await guard.createDemoWorkspace();
    const tooMuch = await flow.handleAgentMessage(ws, "add $5000 to my emergency fund");
    expect(tooMuch.kind).toBe("clarify");
    await flow.confirmFromButton(ws, (await propose(ws, "put $50 in my laptop fund")).actionId, "yes");
    const { db, goals } = await dbs();
    const [goal] = await db.select().from(goals).where(and(eq(goals.workspaceId, ws), eq(goals.name, "New Laptop Fund")));
    expect(goal.savedCents).toBe(45000 + 5000);

  });

  it("the target check lives in the SQL: two writes that together overshoot can't both land", async () => {
    const ws = await guard.createDemoWorkspace();
    const services = await import("./services");
    const { db, goals } = await dbs();
    const [trip] = await db.select().from(goals).where(and(eq(goals.workspaceId, ws), eq(goals.name, "Spring Break Trip")));
    const remaining = trip.targetCents - trip.savedCents; // $460.00
    const results = await Promise.allSettled([
      services.addToGoal(ws, trip.id, remaining - 1000),
      services.addToGoal(ws, trip.id, remaining - 1000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [after] = await db.select().from(goals).where(eq(goals.id, trip.id));
    expect(after.savedCents).toBeLessThanOrEqual(after.targetCents);
    // another workspace's goal id can't be touched through this one
    const other = await guard.createDemoWorkspace();
    await expect(services.addToGoal(other, trip.id, 100)).rejects.toThrow(/no longer exists/);
  });

  it("pay debt can't take the balance below zero", async () => {
    const ws = await guard.createDemoWorkspace();
    expect((await flow.handleAgentMessage(ws, "pay $9999 on my credit card")).kind).toBe("clarify");
    await flow.confirmFromButton(ws, (await propose(ws, "pay $100 on my credit card")).actionId, "yes");
    const { db, debts } = await dbs();
    const [debt] = await db.select().from(debts).where(and(eq(debts.workspaceId, ws), eq(debts.name, "Discover it Student")));
    expect(debt.balanceCents).toBe(68000 - 10000);
  });

  it("answers the fraud alert: not me blocks the charge and leaves a notification", async () => {
    const ws = await guard.createDemoWorkspace();
    const { db, transactions, accounts } = await dbs();
    const [checking] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, ws), eq(accounts.type, "checking")));
    const txId = randomUUID();
    await db.insert(transactions).values({
      id: txId,
      workspaceId: ws,
      accountId: checking.id,
      merchant: "Binance",
      category: "shopping",
      amountCents: -45000,
      occurredAt: Date.now() + 1000,
      description: "Card purchase in NG",
      status: "flagged",
      riskScore: 82,
      riskSignals: "[]",
      subscriptionId: null,
      createdAt: Date.now(),
    });
    const reply = await propose(ws, "no that wasn't me");
    expect(reply.summary).toMatch(/\$450\.00 charge at Binance.*block it/);
    await flow.confirmFromButton(ws, reply.actionId, "yes");
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    expect(tx.status).toBe("blocked");
    expect((await notificationsOf(ws)).map((n) => n.kind)).toContain("fraud_blocked");
  });

  it("answers the fraud alert: that was me posts it", async () => {
    const ws = await guard.createDemoWorkspace();
    const { db, transactions, accounts } = await dbs();
    const [checking] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, ws), eq(accounts.type, "checking")));
    const txId = randomUUID();
    await db.insert(transactions).values({
      id: txId,
      workspaceId: ws,
      accountId: checking.id,
      merchant: "Delta Air Lines",
      category: "shopping",
      amountCents: -60000,
      occurredAt: Date.now() + 1000,
      description: null,
      status: "flagged",
      riskScore: 80,
      riskSignals: "[]",
      subscriptionId: null,
      createdAt: Date.now(),
    });
    await flow.confirmFromButton(ws, (await propose(ws, "yes that was me")).actionId, "yes");
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    expect(tx.status).toBe("posted");
    expect(tx.riskScore).toBe(24);
  });

  it("with no flagged charge, a fraud answer is a clarification", async () => {
    const ws = await guard.createDemoWorkspace();
    expect((await flow.handleAgentMessage(ws, "that wasn't me")).kind).toBe("clarify");
  });
});

describe("memory runs without confirmation", () => {
  it("remember, recall, forget", async () => {
    const ws = await guard.createDemoWorkspace();
    const saved = await flow.handleAgentMessage(ws, "Vera, remember that Sarah is my trusted contact.");
    expect(saved).toMatchObject({ kind: "done", ok: true });
    expect((await flow.getAgentOverview(ws)).memories.map((m) => m.fact)).toEqual(["Sarah is my trusted contact"]);

    const recall = await flow.handleAgentMessage(ws, "what do you remember?");
    expect(recall.kind === "answer" && recall.text).toContain("Sarah is my trusted contact");
    expect(vera.askVera).not.toHaveBeenCalled();

    const gone = await flow.handleAgentMessage(ws, "forget about Sarah");
    expect(gone).toMatchObject({ kind: "done", ok: true });
    expect((await flow.getAgentOverview(ws)).memories).toHaveLength(0);
    expect((await flow.handleAgentMessage(ws, "forget about Sarah")).kind === "done").toBe(true); // nothing left: says so, no crash
  });

  it("memories are per workspace", async () => {
    const a = await guard.createDemoWorkspace();
    const b = await guard.createDemoWorkspace();
    await flow.handleAgentMessage(a, "remember that my pharmacy is CVS");
    expect((await flow.getAgentOverview(b)).memories).toHaveLength(0);
  });
});

describe("discovery", () => {
  it("find_subscriptions runs without confirmation and degrades gracefully", async () => {
    const ws = await guard.createDemoWorkspace();
    vi.mocked(discovery.discoverSubscriptions).mockRejectedValueOnce(new Error("not implemented"));
    const broken = await flow.handleAgentMessage(ws, "find my subscriptions");
    expect(broken).toMatchObject({ kind: "done", ok: false });

    vi.mocked(discovery.discoverSubscriptions).mockResolvedValueOnce([
      { merchant: "Hulu", category: "Streaming", amountCents: 799, cycle: "monthly", occurrences: 3, lastChargedAt: 1, nextExpectedAt: 2, confidence: 0.9, reason: "3 charges", source: "rules", alreadyGuarded: false, priceChanged: false },
    ]);
    const found = await flow.handleAgentMessage(ws, "find my subscriptions");
    expect(found.kind === "done" && found.text).toMatch(/Hulu \$7\.99 a month.*guard/);
  });

  it("guard them all is a confirmable action that calls guardDiscovered with the listed merchants", async () => {
    const ws = await guard.createDemoWorkspace();
    vi.mocked(discovery.discoverSubscriptions).mockResolvedValue([
      { merchant: "Hulu", category: "Streaming", amountCents: 799, cycle: "monthly", occurrences: 3, lastChargedAt: 1, nextExpectedAt: 2, confidence: 0.9, reason: "x", source: "rules", alreadyGuarded: false, priceChanged: false },
      { merchant: "Netflix", category: "Streaming", amountCents: 1599, cycle: "monthly", occurrences: 3, lastChargedAt: 1, nextExpectedAt: 2, confidence: 0.9, reason: "x", source: "rules", alreadyGuarded: true, priceChanged: false },
    ]);
    vi.mocked(discovery.guardDiscovered).mockResolvedValueOnce(1);
    const reply = await propose(ws, "guard them all");
    expect(discovery.guardDiscovered).not.toHaveBeenCalled();
    await flow.confirmFromButton(ws, reply.actionId, "yes");
    expect(discovery.guardDiscovered).toHaveBeenCalledWith(ws, ["Hulu"]);
    vi.mocked(discovery.discoverSubscriptions).mockResolvedValue([]);
  });
});

describe("conversation goes to askVera", () => {
  it("questions and chat are answered, not turned into actions", async () => {
    const ws = await guard.createDemoWorkspace();
    for (const q of ["How do I cancel Netflix?", "Can I afford a $300 trip?", "tell me a joke", "I'm worried about money"]) {
      const reply = await flow.handleAgentMessage(ws, q);
      expect(reply).toMatchObject({ kind: "answer" });
    }
    expect(vera.askVera).toHaveBeenCalledTimes(4);
    expect((await flow.getAgentOverview(ws)).actions).toHaveLength(0);
  });

  it("persists action turns to the shared conversation", async () => {
    const ws = await guard.createDemoWorkspace();
    const { actionId } = await propose(ws, "cancel Netflix");
    await flow.confirmFromButton(ws, actionId, "yes");
    const { db, advisorMessages } = await dbs();
    const rows = (await db.select().from(advisorMessages).where(eq(advisorMessages.workspaceId, ws))).sort((x, y) => x.createdAt - y.createdAt);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(rows[0].content).toBe("cancel Netflix");
    expect(rows[1].content).toMatch(/Should I go ahead\?/);
    expect(rows[3].content).toMatch(/Done\. I closed the Netflix card/);
  });

  it("logs the routing decision as rules/agent_intent for a preset", async () => {
    const ws = await guard.createDemoWorkspace();
    await propose(ws, "cancel Netflix");
    const { db, decisions } = await dbs();
    const rows = await db.select().from(decisions).where(eq(decisions.workspaceId, ws));
    expect(rows.some((r) => r.purpose === "agent_intent" && r.engine === "rules" && r.output.includes("preset"))).toBe(true);
  });
});
