// Stripe sandbox helper. Reads STRIPE_SECRET_KEY from .env.local (or the environment)
// and never prints it.
//   node scripts/stripe-sandbox.mjs check          account, Issuing access, Issuing balance
//   node scripts/stripe-sandbox.mjs topup 5000     add $5,000 of TEST funds to the Issuing balance

import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";

function loadKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  if (!existsSync(".env.local")) return "";
  // Also reads a commented-out key, so the helper works while the app runs in simulated mode.
  const match = readFileSync(".env.local", "utf8").match(/^#?\s*STRIPE_SECRET_KEY=(.+)$/m);
  return match ? match[1].trim() : "";
}

const key = loadKey();
if (!key.startsWith("sk_test_")) {
  console.error("Need a sandbox key (sk_test_...) in STRIPE_SECRET_KEY or .env.local");
  process.exit(1);
}
const stripe = new Stripe(key);
const [command = "check", arg] = process.argv.slice(2);

async function issuingBalance() {
  const balance = await stripe.balance.retrieve();
  return (balance.issuing?.available ?? []).map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency}`).join(", ") || "none";
}

if (command === "check") {
  const account = await stripe.accounts.retrieve();
  console.log(`account ${account.id} · country ${account.country}`);
  console.log(`capabilities ${JSON.stringify(account.capabilities ?? {})}`);
  try {
    const holders = await stripe.issuing.cardholders.list({ limit: 1 });
    console.log(`issuing: enabled (cardholders listed: ${holders.data.length})`);
  } catch (err) {
    console.log(`issuing: NOT available (${err.code ?? err.type}): ${err.message}`);
  }
  console.log(`issuing balance: ${await issuingBalance()}`);
  // Newer sandboxes issue cards from a v2 financial account; it must be "open" before cards can be created.
  try {
    const accounts = await stripe.v2.moneyManagement.financialAccounts.list();
    for (const fa of accounts.data) {
      const usd = fa.balance?.available?.usd?.value ?? 0;
      console.log(`financial account ${fa.id} · ${fa.type} · status ${fa.status} · available ${(usd / 100).toFixed(2)} usd`);
    }
    if (!accounts.data.length) console.log("financial accounts: none");
  } catch (err) {
    console.log(`financial accounts: unavailable (${err.message})`);
  }
} else if (command === "topup") {
  const dollars = Number(arg ?? 5000);
  const topup = await stripe.topups.create({
    amount: Math.round(dollars * 100),
    currency: "usd",
    destination_balance: "issuing",
    description: "VeraFund demo test funds",
  });
  console.log(`top-up ${topup.id} · status ${topup.status}`);
  console.log(`issuing balance: ${await issuingBalance()}`);
} else if (command === "probe") {
  // End-to-end smoke test of the enforcement the app relies on, then closes the card.
  const holder = await stripe.issuing.cardholders.create({
    name: "VeraFund Probe",
    type: "individual",
    status: "active",
    individual: {
      first_name: "Vera",
      last_name: "Probe",
      card_issuing: { user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" } },
    },
    billing: { address: { line1: "123 Main Street", city: "San Francisco", state: "CA", postal_code: "94111", country: "US" } },
  });
  const card = await stripe.issuing.cards.create({
    cardholder: holder.id,
    currency: "usd",
    type: "virtual",
    status: "active",
    spending_controls: { spending_limits: [{ amount: 1599, interval: "per_authorization" }] },
    metadata: { purpose: "verafund-probe" },
  });
  console.log(`card ${card.id} status ${card.status}`);
  for (const amount of [1599, 1899]) {
    const auth = await stripe.testHelpers.issuing.authorizations.create({
      card: card.id,
      amount,
      merchant_data: { name: "Netflix" },
    });
    console.log(`$${(amount / 100).toFixed(2)} → approved=${auth.approved} reason=${auth.request_history.at(-1)?.reason ?? "none"}`);
  }
  await stripe.issuing.cards.update(card.id, { status: "inactive" });
  const paused = await stripe.testHelpers.issuing.authorizations.create({ card: card.id, amount: 100, merchant_data: { name: "Netflix" } });
  console.log(`inactive card $1.00 → approved=${paused.approved} reason=${paused.request_history.at(-1)?.reason ?? "none"}`);
  await stripe.issuing.cards.update(card.id, { status: "canceled" });
  console.log("probe card canceled");
} else {
  console.error(`unknown command ${command}`);
  process.exit(1);
}
