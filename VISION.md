# VeraFund: what we're building

**In one line:** a personal financial firewall. Nothing charges you without a rule you agreed to, and your financial data can live on hardware you control.

## The problem
Recurring charges are designed to be forgotten. Prices creep up, free trials convert silently, and cancelled services keep billing. Today's tools, like Rocket Money, find these charges **after** the money has left. They also ask you to hand your bank login to a cloud aggregator.

## What we ship at this hackathon (Seldon "Ship Happens", Nov 7 2026)
**VeraFund Guard**: the first and most concrete piece of the firewall.
- **One virtual card per subscription**, with a hard per-charge limit set to the price you agreed to.
- **Decide before the charge.** A charge above the limit is declined, then you choose: approve the new price, or keep blocking it.
- **Free trials can't quietly convert.** The card locks the day the trial ends.
- **Evidence log**: what you authorized, what the merchant attempted, what the card network decided.
- **Honest by design**: blocking ≠ cancelling, the UI says which mode is running, and only sandbox keys are accepted.

Two workflows are verified by Wren, Seldon's QA agent: **price hike → blocked → approved**, and **trial → locked → conversion declined**.

## The long-term product: three layers

| Layer | What it does | Status |
|---|---|---|
| **1. Control** | Cards with programmable policies: price caps, trial locks, pause and close, merchant lock | **Built today.** Native Stripe enforcement in sandbox, plus a simulated fallback. Merchant lock needs Stripe's real-time authorization webhook (next) |
| **2. Intelligence** | Find every subscription from statement files, flag price changes and duplicate charges, track trials, answer "what am I paying for?" in plain language, always citing the transactions | Next 2–4 weeks. Deterministic detection first; a local LLM only explains, it never decides |
| **3. Sovereignty** | The whole stack runs on a box you own: local SQLite, a local model, no inbound ports, an air-gap mode, encryption at rest, signed offline updates | Started. The same app already runs from a single Docker image on a local SQLite file. The Jetson is the reference device |

The architecture already supports layer 3. One codebase runs on Turso in the cloud and on a SQLite file on the edge. Payments and the LLM sit behind adapter interfaces (`stripe | simulated`, and later `claude | ollama | none`).

## Why the edge (and who it's for)
- **Privacy-maximalist users and self-hosters** come first. They already run home servers, will install it themselves, and give fast feedback.
- **Cleared defense personnel.** Financial issues are one of the most common concerns in security clearance cases (SEAD-4, Guideline F). A private early-warning tool that never shares bank credentials with an aggregator is a strong story. It must never be framed as employers monitoring employees.
- **Organizations later:** defense contractors and health systems, where every new SaaS vendor triggers a slow security review. Software that never phones home removes much of that friction. These are long sales cycles.
- **Health tech** is our weakest segment until we name a concrete buyer, for example clinic billing teams that handle patient payment data.

## Hardware
- **The Jetson is the reference appliance, not the product.** The software must run on any Linux box.
- **Our board:** a Jetson Orin-family device on JetPack 6 (Ubuntu 22.04), reachable over USB-C at `192.168.55.1`. The exact model is still to be confirmed.
- **The GPU is only for language work:** Q&A, statement OCR, explanations. Detection is CPU work.

## Roadmap

| When | Milestone |
|---|---|
| **Today** | Guard live on a public URL. Wren W1 and W2 passing on the final build. Same Docker image running on the Jetson |
| Week 1 | Jetson bring-up: NVMe boot, Docker with GPU runtime, Ollama with a 3B–7B model. Measure tokens/s, power and latency |
| Weeks 2–4 | Statement import (OFX/QFX/CSV/PDF). Subscription discovery. Local Q&A with read-only SQL tools and row citations. An eval set of 100 questions |
| Month 2 | Security posture: LUKS + SQLCipher, deny-all egress mode, hash-chained decision ledger, SBOM, signed offline updates |
| Month 3 | 30 user interviews across the three segments, and 3 pilot installs. Success = still used after 4 weeks without us |

## Honest constraints
- **Cards need an issuer** (Stripe Issuing), which is a cloud service. In air-gap mode, cards are optional and the intelligence layer still works.
- **The ingestion paradox:** an isolated box still needs bank data. We start with statement file imports.
- **Hardware brings support burden.** Ship as an app first, and as hardware only when people ask for it.
- **This is not financial advice.** The LLM explains and cites; deterministic rules decide.

## How this maps to the hackathon judging
- **Best overall product:** two real workflows that a judge can drive and that Wren has verified.
- **Most original reinvention:** "decide before the charge", versus Rocket Money's "tell you after".
- **People's choice:** everyone has been burned by a free trial. The trial-lock demo lands in 20 seconds.
