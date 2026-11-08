"use client";

import { useState } from "react";
import { FlaskConical, ShieldAlert } from "lucide-react";
import { simulatePurchaseAction } from "@/app/app/transactions/actions";
import { SubmitButton } from "@/components/ui";
import { COUNTRIES, FRAUD_EXAMPLE, PURCHASE_CATEGORIES } from "./options";

const FIELD = "field";

export function SimulateForm() {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("shopping");
  const [country, setCountry] = useState("US");

  return (
    <section className="surface space-y-4 p-5" data-testid="simulate-purchase">
      <div>
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical size={16} aria-hidden="true" />
          </span>
          Check a purchase
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Vera scores it against your history. Nothing here moves real money.</p>
      </div>

      <form action={simulatePurchaseAction} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="sim-merchant" className="text-xs font-medium text-muted-foreground">
            Merchant
          </label>
          <input
            id="sim-merchant"
            name="merchant"
            required
            maxLength={80}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Best Buy"
            className={FIELD}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="sim-amount" className="text-xs font-medium text-muted-foreground">
              Amount (USD)
            </label>
            <input
              id="sim-amount"
              name="amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="42.50"
              className={FIELD}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="sim-country" className="text-xs font-medium text-muted-foreground">
              Country
            </label>
            <select id="sim-country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} className={FIELD}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="sim-category" className="text-xs font-medium text-muted-foreground">
            Category
          </label>
          <select id="sim-category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            {PURCHASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SubmitButton pendingText="Scoring…" data-testid="simulate-submit">
            Score this purchase
          </SubmitButton>
          <button
            type="button"
            data-testid="fill-fraud-example"
            onClick={() => {
              setMerchant(FRAUD_EXAMPLE.merchant);
              setAmount(FRAUD_EXAMPLE.amount);
              setCategory(FRAUD_EXAMPLE.category);
              setCountry(FRAUD_EXAMPLE.country);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <ShieldAlert size={15} aria-hidden="true" /> Fill a fraud example
          </button>
        </div>
      </form>
    </section>
  );
}
