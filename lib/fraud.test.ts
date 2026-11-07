import { describe, expect, it } from "vitest";
import {
  hourOfDay,
  median,
  parseRiskSignals,
  scorePurchase,
  severityOf,
  spokenMerchant,
  veraFraudScript,
  type FraudContext,
  type HistoryTx,
  type PurchaseInput,
} from "./fraud";

const HOUR = 3_600_000;
const DAY = 86_400_000;
// 2:00 PM in Los Angeles (PST, UTC-8).
const NOW = Date.UTC(2026, 10, 7, 22, 0, 0);

function tx(merchant: string, category: string, dollars: number, daysAgo: number, status: HistoryTx["status"] = "posted"): HistoryTx {
  return { merchant, category, amountCents: -Math.round(dollars * 100), occurredAt: NOW - daysAgo * DAY, status, };
}

function baselineHistory(): HistoryTx[] {
  const rows: HistoryTx[] = [];
  const food = [25, 32, 18, 41, 27, 36, 22, 30];
  food.forEach((d, i) => rows.push(tx(i % 2 ? "Kroger" : "Trader Joe's", "food", d, 3 + i * 4)));
  [12, 15, 9, 14].forEach((d, i) => rows.push(tx("Starbucks", "food", d, 2 + i * 5)));
  [42, 38, 45].forEach((d, i) => rows.push(tx("Shell", "transport", d, 6 + i * 9)));
  [60, 80, 95].forEach((d, i) => rows.push(tx("Amazon", "shopping", d, 8 + i * 10)));
  rows.push(tx("Maple Apartments", "housing", 875, 20));
  rows.push({ merchant: "Campus IT - Payroll", category: "income", amountCents: 120000, occurredAt: NOW - 5 * DAY, status: "posted" });
  rows.push({ merchant: "Transfer to Savings", category: "transfer", amountCents: -30000, occurredAt: NOW - 9 * DAY, status: "posted" });
  return rows;
}

const ctx = (over: Partial<FraudContext> = {}): FraudContext => ({
  history: baselineHistory(),
  checkingBalanceCents: 185_000,
  ...over,
});

const purchase = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  merchant: "Kroger",
  amountCents: 3_000,
  category: "food",
  country: "US",
  at: NOW,
  ...over,
});

const names = (r: ReturnType<typeof scorePurchase>) => r.signals.map((s) => s.signal);

describe("severity", () => {
  it("is low below 40, medium 40-69, high 70+", () => {
    expect(severityOf(0)).toBe("low");
    expect(severityOf(39)).toBe("low");
    expect(severityOf(40)).toBe("medium");
    expect(severityOf(69)).toBe("medium");
    expect(severityOf(70)).toBe("high");
    expect(severityOf(100)).toBe("high");
  });
});

describe("scorePurchase", () => {
  it("scores an ordinary purchase at a known merchant as low risk with no signals", () => {
    const r = scorePurchase(purchase(), ctx());
    expect(r.score).toBe(0);
    expect(r.severity).toBe("low");
    expect(r.signals).toEqual([]);
  });

  it("flags the demo fraud purchase as high risk with several explainable signals", () => {
    const r = scorePurchase(
      purchase({ merchant: "CryptoVault-International.xyz", amountCents: 125_000, category: "crypto", country: "RU" }),
      ctx(),
    );
    expect(r.severity).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(names(r)).toEqual(
      expect.arrayContaining(["amount_far_above_typical", "new_merchant", "category_mismatch", "foreign_country", "round_high_amount", "amount_vs_balance"]),
    );
    for (const s of r.signals) {
      expect(s.points).toBeGreaterThan(0);
      expect(s.detail.length).toBeGreaterThan(10);
    }
  });

  it("caps the score at 100 and sorts signals by points", () => {
    const r = scorePurchase(
      purchase({ merchant: "X", amountCents: 500_000, category: "wire transfer", country: "KP", at: NOW - 14 * HOUR }),
      ctx(),
    );
    expect(r.score).toBe(100);
    const pts = r.signals.map((s) => s.points);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
  });

  describe("amount_far_above_typical", () => {
    it("fires for a purchase many times the category median", () => {
      const r = scorePurchase(purchase({ amountCents: 40_000 }), ctx());
      expect(names(r)).toContain("amount_far_above_typical");
    });
    it("does not fire for a modest purchase", () => {
      const r = scorePurchase(purchase({ amountCents: 6_000 }), ctx());
      expect(names(r)).not.toContain("amount_far_above_typical");
    });
    it("falls back to overall spending when the category has no history", () => {
      const r = scorePurchase(purchase({ category: "travel", amountCents: 90_000, merchant: "Kroger" }), ctx());
      const s = r.signals.find((x) => x.signal === "amount_far_above_typical");
      expect(s?.detail).toContain("no history in travel");
    });
    it("stays quiet with too little history to judge", () => {
      const r = scorePurchase(purchase({ amountCents: 900_000 }), ctx({ history: [tx("Kroger", "food", 20, 1)] }));
      expect(names(r)).not.toContain("amount_far_above_typical");
    });
  });

  describe("new_merchant", () => {
    it("fires for a merchant never seen", () => {
      expect(names(scorePurchase(purchase({ merchant: "Shady Shop" }), ctx()))).toContain("new_merchant");
    });
    it("matches merchants ignoring case and punctuation", () => {
      expect(names(scorePurchase(purchase({ merchant: "TRADER JOES" }), ctx()))).not.toContain("new_merchant");
    });
    it("does not trust a merchant whose earlier charge was flagged or blocked", () => {
      const history = [...baselineHistory(), tx("Shady Shop", "shopping", 20, 1, "flagged"), tx("Shady Shop", "shopping", 20, 2, "blocked")];
      expect(names(scorePurchase(purchase({ merchant: "Shady Shop" }), ctx({ history })))).toContain("new_merchant");
    });
    it("trusts a merchant once the user confirmed it (posted)", () => {
      const history = [...baselineHistory(), tx("Shady Shop", "shopping", 20, 1, "posted")];
      expect(names(scorePurchase(purchase({ merchant: "Shady Shop" }), ctx({ history })))).not.toContain("new_merchant");
    });
  });

  describe("velocity", () => {
    const recent = (n: number) =>
      Array.from({ length: n }, (_, i) => tx("Kroger", "food", 20, 0)).map((t, i) => ({ ...t, occurredAt: NOW - (i + 1) * 5 * 60_000 }));
    it("does not fire for one earlier charge", () => {
      expect(names(scorePurchase(purchase(), ctx({ history: [...baselineHistory(), ...recent(1)] })))).not.toContain("velocity");
    });
    it("fires for several charges within the hour", () => {
      const r = scorePurchase(purchase(), ctx({ history: [...baselineHistory(), ...recent(3)] }));
      const s = r.signals.find((x) => x.signal === "velocity");
      expect(s?.points).toBe(12);
    });
    it("scores more for a burst", () => {
      const r = scorePurchase(purchase(), ctx({ history: [...baselineHistory(), ...recent(5)] }));
      expect(r.signals.find((x) => x.signal === "velocity")?.points).toBe(20);
    });
    it("ignores charges older than the window", () => {
      const old = recent(4).map((t) => ({ ...t, occurredAt: t.occurredAt - 3 * HOUR }));
      expect(names(scorePurchase(purchase(), ctx({ history: [...baselineHistory(), ...old] })))).not.toContain("velocity");
    });
  });

  describe("unusual_hour", () => {
    it("fires at 3 AM on the app's clock", () => {
      const threeAm = Date.UTC(2026, 10, 7, 11, 0, 0); // 3:00 AM PST
      expect(hourOfDay(threeAm)).toBe(3);
      expect(names(scorePurchase(purchase({ at: threeAm }), ctx()))).toContain("unusual_hour");
    });
    it("fires just after midnight (hour 24 quirk)", () => {
      const midnight = Date.UTC(2026, 10, 7, 8, 5, 0); // 12:05 AM PST
      expect(hourOfDay(midnight)).toBe(0);
      expect(names(scorePurchase(purchase({ at: midnight }), ctx()))).toContain("unusual_hour");
    });
    it("does not fire in the afternoon", () => {
      expect(names(scorePurchase(purchase(), ctx()))).not.toContain("unusual_hour");
    });
    it("honours a custom time zone", () => {
      // 22:00 UTC is 3:00 AM in Karachi (UTC+5).
      expect(hourOfDay(NOW, "Asia/Karachi")).toBe(3);
      expect(names(scorePurchase(purchase(), ctx({ timeZone: "Asia/Karachi" })))).toContain("unusual_hour");
    });
  });

  describe("category_mismatch", () => {
    it("fires for crypto and wire transfer", () => {
      expect(names(scorePurchase(purchase({ category: "crypto" }), ctx()))).toContain("category_mismatch");
      expect(names(scorePurchase(purchase({ category: "Wire Transfer" }), ctx()))).toContain("category_mismatch");
    });
    it("weighs crypto above gambling", () => {
      const a = scorePurchase(purchase({ category: "crypto" }), ctx()).signals.find((s) => s.signal === "category_mismatch");
      const b = scorePurchase(purchase({ category: "gambling" }), ctx()).signals.find((s) => s.signal === "category_mismatch");
      expect(a!.points).toBeGreaterThan(b!.points);
    });
    it("does not fire when the user already spends in that category", () => {
      const history = [...baselineHistory(), tx("Coinbase", "crypto", 50, 4), tx("Coinbase", "crypto", 40, 9)];
      expect(names(scorePurchase(purchase({ category: "crypto", merchant: "Coinbase" }), ctx({ history })))).not.toContain("category_mismatch");
    });
    it("ignores ordinary categories", () => {
      expect(names(scorePurchase(purchase({ category: "shopping" }), ctx()))).not.toContain("category_mismatch");
    });
  });

  describe("foreign_country", () => {
    it("does not fire for the home country, any case", () => {
      expect(names(scorePurchase(purchase({ country: "us" }), ctx()))).not.toContain("foreign_country");
    });
    it("fires for a foreign country and more for a high-risk one", () => {
      const ca = scorePurchase(purchase({ country: "CA" }), ctx()).signals.find((s) => s.signal === "foreign_country");
      const ru = scorePurchase(purchase({ country: "RU" }), ctx()).signals.find((s) => s.signal === "foreign_country");
      expect(ca?.points).toBe(20);
      expect(ru?.points).toBe(28);
      expect(ru?.detail).toContain("Russia");
    });
    it("respects a different home country", () => {
      expect(names(scorePurchase(purchase({ country: "CA" }), ctx({ homeCountry: "CA" })))).not.toContain("foreign_country");
    });
  });

  describe("round_high_amount", () => {
    it("fires for $1,250 and $500", () => {
      expect(names(scorePurchase(purchase({ amountCents: 125_000 }), ctx()))).toContain("round_high_amount");
      expect(names(scorePurchase(purchase({ amountCents: 50_000 }), ctx()))).toContain("round_high_amount");
    });
    it("does not fire for small round amounts or odd large ones", () => {
      expect(names(scorePurchase(purchase({ amountCents: 10_000 }), ctx()))).not.toContain("round_high_amount");
      expect(names(scorePurchase(purchase({ amountCents: 123_456 }), ctx()))).not.toContain("round_high_amount");
    });
  });

  describe("amount_vs_balance", () => {
    it("fires when the amount exceeds the balance", () => {
      const r = scorePurchase(purchase({ amountCents: 200_000 }), ctx());
      expect(r.signals.find((s) => s.signal === "amount_vs_balance")?.points).toBe(20);
    });
    it("scales with the share of the balance", () => {
      expect(scorePurchase(purchase({ amountCents: 100_000 }), ctx()).signals.find((s) => s.signal === "amount_vs_balance")?.points).toBe(15);
      expect(scorePurchase(purchase({ amountCents: 50_000 }), ctx()).signals.find((s) => s.signal === "amount_vs_balance")?.points).toBe(8);
    });
    it("ignores small purchases and a missing balance", () => {
      expect(names(scorePurchase(purchase({ amountCents: 5_000 }), ctx({ checkingBalanceCents: 6_000 })))).not.toContain("amount_vs_balance");
      expect(names(scorePurchase(purchase({ amountCents: 100_000 }), ctx({ checkingBalanceCents: null })))).not.toContain("amount_vs_balance");
    });
  });

  it("scores a plausible new-merchant purchase as medium or low, not high", () => {
    const r = scorePurchase(purchase({ merchant: "Best Buy", category: "shopping", amountCents: 24_900 }), ctx());
    expect(r.severity).not.toBe("high");
  });

  it("does not mutate its inputs", () => {
    const c = ctx();
    const before = JSON.stringify(c);
    scorePurchase(purchase({ merchant: "Z", amountCents: 125_000, category: "crypto", country: "RU" }), c);
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe("helpers", () => {
  it("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("parseRiskSignals tolerates null, junk and bad entries", () => {
    expect(parseRiskSignals(null)).toEqual([]);
    expect(parseRiskSignals("not json")).toEqual([]);
    expect(parseRiskSignals('{"a":1}')).toEqual([]);
    expect(parseRiskSignals('[{"signal":"a","points":3,"detail":"x"},{"nope":1}]')).toEqual([{ signal: "a", points: 3, detail: "x" }]);
  });

  it("spokenMerchant shortens domain-style names only", () => {
    expect(spokenMerchant("CryptoVault-International.xyz")).toBe("CryptoVault");
    expect(spokenMerchant("Coca-Cola")).toBe("Coca-Cola");
    expect(spokenMerchant("Trader Joe's")).toBe("Trader Joe's");
  });

  it("veraFraudScript reads naturally", () => {
    expect(veraFraudScript("CryptoVault-International.xyz", 125_000)).toBe(
      "Hi, it's Vera. A $1,250 charge at CryptoVault just tried to go through. That's not like you. Was this you?",
    );
    expect(veraFraudScript("Kroger", 1_899)).toContain("$18.99");
  });
});
