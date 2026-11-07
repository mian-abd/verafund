// Pure detection logic: no database, no network. Times are fixed so results never
// depend on today's date or the machine's time zone.

import { describe, expect, it } from "vitest";
import {
  applyJevAnswers,
  buildJevRequest,
  categoryForKind,
  confidenceLabel,
  detectRecurring,
  displayMerchant,
  estimateNext,
  isBillCategory,
  isBorderline,
  merchantsMatch,
  normalizeMerchant,
  toDiscovered,
  type DiscoveryCandidate,
  type RawTransaction,
} from "./discovery-core";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

function tx(merchant: string, daysAgo: number, dollars: number, category = "subscriptions", status = "posted"): RawTransaction {
  return { merchant, category, amountCents: -Math.round(dollars * 100), occurredAt: NOW - daysAgo * DAY, status };
}

function monthly(merchant: string, dollars: number, category = "subscriptions", count = 3, lastDaysAgo = 6): RawTransaction[] {
  return Array.from({ length: count }, (_, i) => tx(merchant, lastDaysAgo + 30 * (count - 1 - i), dollars, category));
}

function detect(txs: RawTransaction[], guardedMerchants: string[] = []) {
  return detectRecurring(txs, { now: NOW, guardedMerchants });
}

function one(txs: RawTransaction[], guardedMerchants: string[] = []): DiscoveryCandidate {
  const found = detect(txs, guardedMerchants);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("merchant normalization", () => {
  it("strips punctuation, store numbers and noise words", () => {
    expect(normalizeMerchant("NETFLIX.COM")).toBe("netflix");
    expect(normalizeMerchant("Spotify USA Inc.")).toBe("spotify");
    expect(normalizeMerchant("Hulu, LLC")).toBe("hulu");
    expect(normalizeMerchant("Planet Fitness #1234")).toBe("planet fitness");
    expect(normalizeMerchant("PLANET FITNESS 04821")).toBe("planet fitness");
    expect(normalizeMerchant("AMAZON PRIME*XY12AB34")).toBe("amazon prime");
    expect(normalizeMerchant("APPLE.COM/BILL")).toBe("apple");
    expect(normalizeMerchant("NETFLIX 866-579-7172")).toBe("netflix");
  });

  it("drops a payment-processor prefix before the star", () => {
    expect(normalizeMerchant("PAYPAL *SPOTIFY")).toBe("spotify");
    expect(normalizeMerchant("SQ *Blue Bottle")).toBe("blue bottle");
    expect(normalizeMerchant("GOOGLE *YouTube Premium")).toBe("youtube premium");
  });

  it("keeps meaningful punctuation as words", () => {
    expect(normalizeMerchant("T-Mobile")).toBe("t mobile");
    expect(normalizeMerchant("Disney+")).toBe("disney plus");
    expect(normalizeMerchant("AT&T")).toBe("at and t");
  });

  it("treats different spellings of one merchant as the same key", () => {
    const keys = ["Netflix", "NETFLIX.COM", "netflix inc", "Netflix 1234"].map(normalizeMerchant);
    expect(new Set(keys).size).toBe(1);
  });

  it("builds a readable display name", () => {
    expect(displayMerchant("NETFLIX.COM")).toBe("Netflix");
    expect(displayMerchant("DTE Energy")).toBe("DTE Energy");
    expect(displayMerchant("iCloud+")).toBe("iCloud Plus");
    expect(displayMerchant("DISNEY+")).toBe("Disney Plus");
    expect(displayMerchant("ICLOUD.COM/BILL")).toBe("iCloud");
    expect(displayMerchant("GOOGLE *YOUTUBE PREMIUM")).toBe("YouTube Premium");
    expect(displayMerchant("a".repeat(80)).length).toBeLessThanOrEqual(40);
  });

  it("matches a short name to a longer one, but not unrelated names", () => {
    expect(merchantsMatch("Netflix", "NETFLIX.COM")).toBe(true);
    expect(merchantsMatch("Adobe", "Adobe Creative Cloud")).toBe(true);
    expect(merchantsMatch("Hulu", "Netflix")).toBe(false);
    expect(merchantsMatch("Max", "Maxwell Rentals")).toBe(false);
  });
});

describe("monthly detection", () => {
  it("finds a steady monthly subscription", () => {
    const c = one(monthly("Netflix", 15.99));
    expect(c).toMatchObject({
      merchant: "Netflix",
      category: "Streaming",
      amountCents: 1599,
      cycle: "monthly",
      occurrences: 3,
      lastChargedAt: NOW - 6 * DAY,
      priceChanged: false,
      alreadyGuarded: false,
      source: "rules",
      kind: "streaming",
      group: "subscription",
      previousAmountCents: null,
    });
    expect(c.reason).toBe("3 charges of $15.99 about 30 days apart");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
    expect(confidenceLabel(c.confidence)).toBe("High");
  });

  it("accepts calendar-month wobble (28 to 31 days) as regular", () => {
    const c = one([tx("Spotify", 89, 11.99), tx("Spotify", 61, 11.99), tx("Spotify", 30, 11.99), tx("Spotify", 0, 11.99)]);
    expect(c.occurrences).toBe(4);
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("estimates the next charge as the same day next month", () => {
    const c = one(monthly("Netflix", 15.99)); // last charge 6 days before Nov 7 = Nov 1
    expect(c.nextExpectedAt).toBe(Date.UTC(2026, 11, 1, 12, 0, 0));
  });

  it("clamps month-end dates and rolls a missed charge forward", () => {
    const jan31 = Date.UTC(2026, 0, 31, 12);
    expect(estimateNext(jan31, "monthly", jan31 + 1)).toBe(Date.UTC(2026, 1, 28, 12));
    expect(estimateNext(jan31, "monthly", Date.UTC(2026, 2, 5))).toBeGreaterThanOrEqual(Date.UTC(2026, 2, 5));
  });

  it("scores two charges lower than three", () => {
    const two = one(monthly("Netflix", 15.99, "subscriptions", 2));
    const three = one(monthly("Netflix", 15.99, "subscriptions", 3));
    expect(two.occurrences).toBe(2);
    expect(two.confidence).toBeLessThan(three.confidence);
    expect(two.confidence).toBeGreaterThan(0.6);
  });

  it("scores an uneven interval lower than an even one", () => {
    const even = one([tx("Hulu", 60, 9.99), tx("Hulu", 30, 9.99)]); // 30 days apart
    const stretched = one([tx("Hulu", 55, 9.99), tx("Hulu", 30, 9.99)]); // 25 days apart
    expect(stretched.confidence).toBeLessThan(even.confidence);
  });

  it("merges name variants into one subscription", () => {
    const c = one([tx("NETFLIX.COM", 66, 15.99), tx("Netflix", 36, 15.99), tx("NETFLIX 866-579-7172", 6, 15.99)]);
    expect(c.occurrences).toBe(3);
    expect(c.merchant).toBe("Netflix");
  });

  it("counts a retry or pending+posted duplicate once", () => {
    const c = one([...monthly("Netflix", 15.99), tx("Netflix", 5, 15.99, "subscriptions", "pending")]);
    expect(c.occurrences).toBe(3);
  });
});

describe("yearly detection", () => {
  it("finds an annual subscription from two charges a year apart", () => {
    const c = one([tx("Dropbox", 370, 119.99, "software"), tx("Dropbox", 5, 119.99, "software")]);
    expect(c).toMatchObject({ cycle: "yearly", occurrences: 2, amountCents: 11999, kind: "software", category: "Software" });
    expect(c.reason).toBe("2 charges of $119.99 about a year apart");
    expect(c.nextExpectedAt).toBeGreaterThan(NOW);
    expect(c.nextExpectedAt).toBe(Date.UTC(2027, 10, 2, 12)); // 5 days ago was Nov 2, 2026
  });

  it("does not treat 6 or 7 months apart as recurring", () => {
    expect(detect([tx("Dropbox", 200, 119.99), tx("Dropbox", 10, 119.99)])).toEqual([]);
  });
});

describe("price change", () => {
  it("flags a small hike and says what it went from and to", () => {
    const c = one([tx("Netflix", 96, 15.49), tx("Netflix", 66, 15.49), tx("Netflix", 36, 15.49), tx("Netflix", 6, 15.99)]);
    expect(c.priceChanged).toBe(true);
    expect(c.amountCents).toBe(1599);
    expect(c.previousAmountCents).toBe(1549);
    expect(c.reason).toBe("4 charges about 30 days apart; the price went from $15.49 to $15.99");
  });

  it("compares the latest charge with the median of the earlier ones", () => {
    const c = one([tx("Netflix", 96, 15.49), tx("Netflix", 66, 15.99), tx("Netflix", 36, 15.99), tx("Netflix", 6, 15.99)]);
    expect(c.priceChanged).toBe(false); // median of earlier = 15.99
  });

  it("only flags changes larger than 2%", () => {
    const at = (latest: number) => one([tx("Hulu", 66, 10), tx("Hulu", 36, 10), tx("Hulu", 6, latest)]);
    expect(at(10.2).priceChanged).toBe(false); // exactly 2%
    expect(at(10.3).priceChanged).toBe(true);
    expect(at(9.7).priceChanged).toBe(true);
    expect(at(9.7).reason).toContain("dropped from $10.00 to $9.70");
  });

  it("does not stretch a loose chain to reach a big jump", () => {
    const c = one([tx("Hulu", 66, 10), tx("Hulu", 36, 11), tx("Hulu", 6, 18)]);
    expect(c.occurrences).toBe(2);
    expect(c.amountCents).toBe(1100);
  });

  it("catches a hike bigger than the 15% step tolerance", () => {
    const c = one([tx("Planet Fitness", 66, 24.99), tx("Planet Fitness", 36, 24.99), tx("Planet Fitness", 6, 34.99)]);
    expect(c.occurrences).toBe(3);
    expect(c.priceChanged).toBe(true);
    expect(c.amountCents).toBe(3499);
    expect(c.previousAmountCents).toBe(2499);
  });
});

describe("noise filtering", () => {
  it("ignores blocked charges", () => {
    const c = one([...monthly("Netflix", 15.99), tx("Netflix", 3, 18.99, "subscriptions", "blocked")]);
    expect(c.amountCents).toBe(1599);
    expect(c.priceChanged).toBe(false);
    expect(detect([tx("Netflix", 66, 15.99, "subscriptions", "blocked"), tx("Netflix", 36, 15.99, "subscriptions", "blocked")])).toEqual([]);
  });

  it("ignores transfers and income", () => {
    expect(detect(monthly("Transfer to Savings", 300, "transfer"))).toEqual([]);
    const payroll: RawTransaction[] = [66, 36, 6].map((d) => ({
      merchant: "Campus IT - Payroll",
      category: "income",
      amountCents: 120000,
      occurredAt: NOW - d * DAY,
      status: "posted",
    }));
    expect(detect(payroll)).toEqual([]);
    expect(detect(payroll.map((t) => ({ ...t, amountCents: -t.amountCents })))).toEqual([]); // even if signed as spending
  });

  it("ignores one-off purchases and charges that are not about a month apart", () => {
    expect(detect([tx("Best Buy", 20, 129, "shopping")])).toEqual([]);
    expect(detect([tx("Hulu", 40, 9.99), tx("Hulu", 20, 9.99)])).toEqual([]); // 20 days
    expect(detect([tx("Hulu", 90, 9.99), tx("Hulu", 40, 9.99)])).toEqual([]); // 50 days
  });

  it("ignores charges that are far apart in amount", () => {
    expect(detect([tx("Mystery Co", 66, 10), tx("Mystery Co", 36, 20), tx("Mystery Co", 6, 45)])).toEqual([]);
  });

  it("does not mistake a frequent merchant for a subscription", () => {
    // 20 coffee runs with varying amounts: a pair of them will happen to be ~30 days apart.
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const coffee = Array.from({ length: 20 }, (_, i) => tx("Starbucks", 88 - i * 4 - Math.floor(rand() * 3), 4 + Math.floor(rand() * 4) + 0.25, "food"));
    expect(detect(coffee)).toEqual([]);
  });

  it("drops a subscription that stopped charging long ago", () => {
    expect(detect(monthly("Hulu", 9.99, "subscriptions", 3, 130))).toEqual([]);
  });

  it("lowers confidence when the last charge is overdue", () => {
    const fresh = one(monthly("Hulu", 9.99, "subscriptions", 3, 6));
    const overdue = one(monthly("Hulu", 9.99, "subscriptions", 3, 60));
    expect(overdue.confidence).toBeLessThan(fresh.confidence);
  });

  it("needs identical-looking charges from an unknown merchant in a shopping category", () => {
    // Three Walmart-like trips that happen to land a month apart at similar, but not equal, amounts.
    expect(detect([tx("Walmart", 66, 83.28, "shopping"), tx("Walmart", 36, 86.1, "shopping"), tx("Walmart", 6, 91.2, "shopping")])).toEqual([]);
    // The same three at one price look like a membership.
    expect(one([tx("Granite Studio", 66, 60, "shopping"), tx("Granite Studio", 36, 60, "shopping"), tx("Granite Studio", 6, 60, "shopping")]).occurrences).toBe(3);
  });

  it("does not flag restaurants or rides that repeat", () => {
    expect(detect([tx("United Airlines", 66, 500, "transport"), tx("United Airlines", 36, 500, "transport")])).toEqual([]);
    expect(detect([tx("Chipotle", 66, 12, "food"), tx("Chipotle", 36, 12, "food")])).toEqual([]);
  });
});

describe("subscriptions vs recurring bills", () => {
  const history = [
    ...monthly("Maple Apartments", 875, "housing"),
    ...monthly("DTE Energy", 28, "utilities"),
    ...monthly("Comcast Internet", 57, "utilities"),
    ...monthly("T-Mobile", 45, "utilities"),
    ...monthly("Netflix", 15.99),
  ];

  it("returns bills too, in their own category", () => {
    const found = detect(history);
    const by = Object.fromEntries(found.map((c) => [c.merchant, c]));
    expect(by["Maple Apartments"]).toMatchObject({ group: "bill", kind: "housing", category: "Housing" });
    expect(by["DTE Energy"]).toMatchObject({ group: "bill", kind: "utility_bill", category: "Utilities" });
    expect(by["Comcast Internet"]).toMatchObject({ group: "bill", category: "Internet" });
    expect(by["T-Mobile"]).toMatchObject({ group: "bill", category: "Phone" });
    expect(by["Netflix"]).toMatchObject({ group: "subscription", category: "Streaming" });
  });

  it("lets the category alone tell bills apart from subscriptions", () => {
    const found = detect(history);
    expect(found.filter((c) => isBillCategory(c.category)).map((c) => c.merchant).sort()).toEqual([
      "Comcast Internet",
      "DTE Energy",
      "Maple Apartments",
      "T-Mobile",
    ]);
    expect(isBillCategory("Streaming")).toBe(false);
    expect(isBillCategory("subscriptions")).toBe(false);
  });

  it("trusts a merchant keyword over the bank's category", () => {
    const c = one(monthly("Comcast", 57, "subscriptions"));
    expect(c).toMatchObject({ group: "bill", category: "Internet", kindBasis: "keyword" });
  });

  it("falls back to the transaction category when no keyword matches", () => {
    expect(one(monthly("Zeta Holdings", 30, "utilities"))).toMatchObject({ group: "bill", kindBasis: "category" });
    expect(one(monthly("Zeta Club", 30, "subscriptions"))).toMatchObject({ group: "subscription", kind: "other", kindBasis: "category", category: "Subscription" });
  });

  it("classifies the common subscription kinds", () => {
    const kind = (merchant: string) => one(monthly(merchant, 12)).kind;
    expect(kind("Spotify")).toBe("music");
    expect(kind("Planet Fitness")).toBe("fitness");
    expect(kind("Adobe Creative Cloud")).toBe("software");
    expect(kind("New York Times")).toBe("news");
    expect(kind("Amazon Prime")).toBe("shopping_membership");
    expect(kind("Amazon Prime Video")).toBe("streaming");
    expect(kind("Rent the Runway")).toBe("shopping_membership");
  });
});

describe("already guarded", () => {
  it("matches a guarded subscription by normalized merchant", () => {
    expect(one([...monthly("NETFLIX.COM", 15.99)], ["Netflix"]).alreadyGuarded).toBe(true);
    expect(one(monthly("Netflix", 15.99), ["Hulu"]).alreadyGuarded).toBe(false);
  });

  it("matches a short bank name to a longer guarded one", () => {
    expect(one(monthly("Adobe", 22.99), ["Adobe Creative Cloud"]).alreadyGuarded).toBe(true);
  });
});

describe("public shape", () => {
  it("toDiscovered keeps exactly the interface fields", () => {
    const shaped = toDiscovered(one(monthly("Netflix", 15.99)));
    expect(Object.keys(shaped).sort()).toEqual(
      [
        "alreadyGuarded", "amountCents", "category", "confidence", "cycle", "lastChargedAt", "merchant",
        "nextExpectedAt", "occurrences", "priceChanged", "reason", "source",
      ].sort(),
    );
  });

  it("orders by confidence, then amount", () => {
    const found = detect([...monthly("Netflix", 15.99), ...monthly("Spotify", 11.99, "subscriptions", 2), ...monthly("Hulu", 9.99)]);
    expect(found.map((c) => c.merchant)).toEqual(["Netflix", "Hulu", "Spotify"]);
  });
});

describe("Jev blending", () => {
  const rulesOnly = () => detect([...monthly("Zeta Club", 30), ...monthly("Spotify", 11.99, "subscriptions", 2), ...monthly("Netflix", 15.99)]);

  it("only asks about borderline candidates", () => {
    const found = rulesOnly();
    const names = found.filter(isBorderline).map((c) => c.merchant).sort();
    expect(names).toEqual(["Spotify", "Zeta Club"]); // Netflix: clear kind, high confidence
  });

  it("builds one batched request with a noul and a choice question per candidate", () => {
    const borderline = rulesOnly().filter(isBorderline);
    const req = buildJevRequest(borderline);
    expect(Object.keys(req.questions).sort()).toEqual(["c0_is_subscription", "c0_kind", "c1_is_subscription", "c1_kind"]);
    expect(req.questions.c0_is_subscription.type).toBe("noul");
    const kind = req.questions.c0_kind;
    expect(kind.type).toBe("choice");
    if (kind.type === "choice") {
      expect(Object.keys(kind.criteria)).toEqual([
        "streaming", "music", "fitness", "software", "news", "shopping_membership", "utility_bill", "housing", "other",
      ]);
    }
    expect(req.keys).toEqual(borderline.map((c) => c.key));
    const state = req.state as { candidates: { id: string; merchant: string; amount: string }[] };
    expect(state.candidates.map((c) => c.id)).toEqual(["c0", "c1"]);
    expect(state.candidates.map((c) => c.merchant)).toEqual(borderline.map((c) => c.merchant));
  });

  it("re-labels, raises confidence and marks the source", () => {
    const found = rulesOnly();
    const borderline = found.filter(isBorderline);
    const i = borderline.findIndex((c) => c.merchant === "Zeta Club");
    const before = found.find((c) => c.merchant === "Zeta Club")!;
    const out = applyJevAnswers(found, borderline.map((c) => c.key), {
      [`c${i}_is_subscription`]: { noul: 0.95 },
      [`c${i}_kind`]: { choice: "fitness", confidence: 0.9 },
    });
    const after = out.find((c) => c.merchant === "Zeta Club")!;
    expect(after).toMatchObject({ source: "rules+jev", kind: "fitness", category: "Fitness", group: "subscription" });
    expect(after.confidence).toBeGreaterThan(before.confidence);
    expect(out.find((c) => c.merchant === "Netflix")!.source).toBe("rules"); // not asked
  });

  it("can move a candidate into recurring bills", () => {
    const found = rulesOnly();
    const keys = found.filter(isBorderline).map((c) => c.key);
    const i = keys.indexOf(normalizeMerchant("Zeta Club"));
    const out = applyJevAnswers(found, keys, {
      [`c${i}_is_subscription`]: { noul: 0.05 },
      [`c${i}_kind`]: { choice: "utility_bill", confidence: 0.9 },
    });
    expect(out.find((c) => c.merchant === "Zeta Club")).toMatchObject({ group: "bill", kind: "utility_bill", category: "Utilities" });
  });

  it("drops a candidate Jev is sure is not a subscription, and never adds one", () => {
    const found = detect(monthly("Zeta Club", 30, "shopping"));
    expect(found).toHaveLength(1);
    const out = applyJevAnswers(found, [found[0].key], { c0_is_subscription: { noul: 0 }, c0_kind: { choice: "other", confidence: 0.9 } });
    expect(out).toEqual([]);

    // Answers about merchants the rules never found change nothing.
    const stable = rulesOnly();
    const withGhosts = applyJevAnswers(stable, ["not a candidate", "another one"], {
      c0_is_subscription: { noul: 1 },
      c0_kind: { choice: "streaming" },
      c1_is_subscription: { noul: 1 },
      c1_kind: { choice: "streaming" },
    });
    expect(withGhosts).toEqual(stable);
  });

  it("ignores malformed answers", () => {
    const found = rulesOnly();
    const keys = found.filter(isBorderline).map((c) => c.key);
    const out = applyJevAnswers(found, keys, {
      c0_is_subscription: { noul: 7 },
      c0_kind: { choice: "not-a-kind" },
      c1_is_subscription: { noul: Number.NaN },
    });
    expect(out).toEqual(found);
    expect(out.every((c) => c.source === "rules")).toBe(true);
  });

  it("lets a strong merchant keyword yield only to a confident Jev answer", () => {
    const found = detect(monthly("Netflix", 15.99, "subscriptions", 2)); // keyword: streaming, borderline by score
    const keys = [found[0].key];
    const unsure = applyJevAnswers(found, keys, { c0_is_subscription: { noul: 0.9 }, c0_kind: { choice: "software", confidence: 0.4 } });
    expect(unsure[0].kind).toBe("streaming");
    const sure = applyJevAnswers(found, keys, { c0_is_subscription: { noul: 0.9 }, c0_kind: { choice: "software", confidence: 0.9 } });
    expect(sure[0].kind).toBe("software");
  });

  it("maps kinds to the category stored on the card", () => {
    expect(categoryForKind("streaming", "x")).toBe("Streaming");
    expect(categoryForKind("utility_bill", "t mobile")).toBe("Phone");
    expect(categoryForKind("utility_bill", "dte energy")).toBe("Utilities");
    expect(categoryForKind("other", "x")).toBe("Subscription");
  });
});
