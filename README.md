# VeraFund

**Subscriptions that ask before they charge.** VeraFund gives every subscription its own virtual card with a hard price cap. Price hikes wait for your approval, free trials lock before they convert, and suspicious charges are flagged with a plain-English reason. Vera, the built-in assistant, answers money questions by text or by voice.

**Live:** https://verafund.vercel.app · **QA:** core flows verified by Seldon's Wren agent (see `wren-results/`)

| Area | What it does |
|---|---|
| **Subscription Guard** | One card per subscription with a per-charge limit. Above-limit charges are declined; you approve the new price or keep blocking. Trial cards lock when the trial ends. Every decision is logged as evidence. |
| **Fraud detection** | An 8-signal, explainable risk score for every purchase, optional Jev triage, and Vera asking "was this you?" before anything is settled. |
| **Overview** | Net worth, income vs spending, category breakdown, budgets, upcoming bills inferred from history, 30-day cash-flow forecast, card optimizer. |
| **Banks** | Plaid Link (sandbox) imports accounts and transactions. Loans and credit lines count as debt. Incremental sync. |
| **Goals & Debt** | Savings goals with the monthly amount needed, avalanche vs snowball payoff planner, editable budgets. |
| **Vera** | A chat on every page (and a full Advisor page) grounded in your real data, plus hands-free "Call Vera" with an ElevenLabs voice. |
| **Purchase Analyzer** | Type a price or upload a photo: hours of work it costs, budget impact, and how many weeks it delays each goal. |

Blocking a card stops charges on that card. It does **not** cancel your contract with the merchant, and the UI says so.

---

## Architecture

```mermaid
flowchart LR
  user([Browser]) --> app

  subgraph app[Next.js 15 app · server components + server actions]
    pages[Pages: Overview · Subscriptions · Transactions · Goals · Banks · Analyzer · Advisor]
    engine[Guard decision engine<br/>lib/engine.ts]
    fraud[Fraud engine<br/>lib/fraud.ts]
    vera[Vera<br/>lib/vera-chat.ts]
  end

  app --> db[(libSQL<br/>Turso in the cloud<br/>SQLite file on device)]
  engine --> pay{Payments adapter}
  pay --> stripe[Stripe Issuing sandbox]
  pay --> sim[Simulated adapter]
  fraud --> jev[TypeSafe Jev<br/>typed decisions]
  vera --> claude[Claude<br/>answers + photo reading]
  vera --> eleven[ElevenLabs<br/>voice]
  pages --> plaid[Plaid sandbox<br/>bank import]
```

**Principle: rules decide, AI explains, you approve.** Card limits and fraud scoring are deterministic and unit-tested. Jev and Claude rank, classify and explain, but never move money on their own.

## How a subscription charge is decided

```mermaid
sequenceDiagram
  autonumber
  participant M as Merchant
  participant G as Guard engine
  participant N as Card network (Stripe sandbox or simulated)
  participant L as Evidence log
  participant V as Vera
  actor U as You

  M->>G: charge $18.99 on the Netflix card
  G->>G: check policy: limit $15.99, card status, trial end, merchant
  G->>N: authorize (per_authorization spending limit)
  N-->>G: declined (spending_controls)
  G->>L: record decision + reason "$18.99 is above your $15.99 limit"
  G->>V: notify (bell + optional voice)
  V->>U: "Netflix tried to charge $18.99. Approve the new price?"
  alt you approve
    U->>G: Approve $18.99 going forward
    G->>N: raise limit to $18.99
    G->>L: record "limit raised from $15.99 to $18.99"
  else you keep blocking
    U->>G: Keep blocking
    G->>L: record "kept the $15.99 limit"
  end
```

Free trials follow the same path: when the trial ends the card is set to inactive, so the first paid charge is declined with "Free trial ended".

## How a suspicious purchase is handled

```mermaid
flowchart TD
  p[New purchase] --> s[Score 8 independent signals]
  s --> s1[amount vs category history]
  s --> s2[new merchant]
  s --> s3[velocity]
  s --> s4[unusual hour]
  s --> s5[risky category]
  s --> s6[foreign country]
  s --> s7[round high amount]
  s --> s8[amount vs checking balance]
  s1 & s2 & s3 & s4 & s5 & s6 & s7 & s8 --> score{Risk 0-100}
  score -->|below 70| posted[Posted]
  score -->|70 or more| flagged[Flagged]
  flagged --> jev["Jev: likely-fraud probability and fraud type<br/>evidence only, never decides"]
  flagged --> ask["Vera asks: was this you?"]
  ask -->|Yes| ok[Posted, merchant trusted]
  ask -->|No| blocked[Blocked + notification]
```

## Bank connection (Plaid)

```mermaid
sequenceDiagram
  actor U as You
  participant A as VeraFund
  participant P as Plaid
  U->>A: Connect a bank
  A->>P: /link/token/create
  A-->>U: open Plaid Link
  U->>P: pick bank, sign in (sandbox: user_good / pass_good)
  P-->>A: public_token
  A->>P: /item/public_token/exchange
  A->>P: /accounts/get + /transactions/sync
  A->>A: store accounts, transactions, cursor
  A-->>U: "14 accounts, N transactions imported"
```

## Deployment

```mermaid
flowchart LR
  subgraph cloud[Cloud]
    vercel[Vercel<br/>Next.js] --> turso[(Turso)]
  end
  subgraph edge[Your hardware · NVIDIA Jetson Orin Nano]
    docker[Docker container<br/>same app, standalone build] --> sqlite[(SQLite file<br/>/data/verafund.db)]
    docker --> ollama[Ollama on the GPU<br/>qwen2.5:3b · localhost only]
  end
  vercel -. same code .- docker
  cloud --> apis[Claude · Jev · ElevenLabs · Plaid · Stripe]
  edge --> apis2[Jev · Plaid]
```

The database layer is libSQL, so the same code talks to Turso in the cloud or to a local SQLite file on the Jetson.

### Private mode (on-device AI)

With `LLM_PROVIDER=ollama`, Vera's language model runs on the Jetson's GPU instead of the cloud, and the header shows **On-device AI**. Photo reading turns off, because it needs Claude and private mode keeps photos on the device.

Measured on a Jetson Orin Nano 8GB (JetPack 6.0, 15 W mode) with `python3 scripts/llm-bench.py`:

| Model | Decode | Prompt processing | Cold load | GPU | Board power | Tool choice |
|---|---|---|---|---|---|---|
| qwen2.5:3b (Q4_K_M) | **14.1 tokens/s** | 488 tokens/s | 14.7 s | 84% | 10.8 W | 3/3 correct, ~3 s each |

A spoken answer of about 60 words takes roughly 5 seconds to generate, and choosing an action ("cancel my Netflix" → `cancel_subscription(merchant: "Netflix")`) takes about 3 seconds.

## Data model

```mermaid
erDiagram
  WORKSPACE ||--o{ SUBSCRIPTION : has
  SUBSCRIPTION ||--o{ CHARGE : "attempts"
  SUBSCRIPTION ||--o{ POLICY_EVENT : "changes"
  WORKSPACE ||--o{ ACCOUNT : has
  ACCOUNT ||--o{ TRANSACTION : records
  WORKSPACE ||--o{ GOAL : saves
  WORKSPACE ||--o{ DEBT : owes
  WORKSPACE ||--o{ BUDGET : sets
  WORKSPACE ||--o{ NOTIFICATION : receives
  WORKSPACE ||--o{ ADVISOR_MESSAGE : "chats"
  WORKSPACE ||--o{ PLAID_ITEM : links
  SUBSCRIPTION {
    int limit_cents
    string card_status
    int trial_ends_at
  }
  CHARGE {
    int amount_cents
    bool approved
    string reason_text
    string provider_reason
  }
  TRANSACTION {
    int amount_cents
    string status
    int risk_score
    string risk_signals
  }
```

Money is stored as integer cents everywhere. Every visitor gets an isolated workspace (cookie), so demo sessions never collide.

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000, local SQLite file, simulated payments
npm test         # 135 unit + integration tests
```

Copy `.env.example` to `.env.local` and add what you need:

| Variable | Used for |
|---|---|
| `DATABASE_URL` / `TURSO_DATABASE_URL` + token | Turso (otherwise `file:verafund.db`) |
| `STRIPE_SECRET_KEY` (+ `STRIPE_FINANCIAL_ACCOUNT`) | Stripe Issuing sandbox (test keys only); empty = simulated |
| `ANTHROPIC_API_KEY` | Vera's answers and photo reading (rule-based fallback without it) |
| `TYPESAFE_API_KEY` | Jev fraud triage (skipped without it) |
| `ELEVENLABS_API_KEY` | Vera's voice (browser voice without it) |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Bank connections |
| `LLM_PROVIDER`, `OLLAMA_URL`, `OLLAMA_MODEL` | Private mode: `ollama`, `http://127.0.0.1:11434`, `qwen2.5:3b` |

## Self-host on a Jetson (or any Docker host)

```bash
docker build --network=host -t verafund .
docker run -d --name verafund --network host --env-file verafund.env \
  -v verafund-data:/data --restart unless-stopped verafund
```

`--network=host` is needed on JetPack 6 with Docker 28+, whose kernel lacks the iptables `raw` table. The app is then at `http://<jetson-ip>:3000` and stores everything in `/data/verafund.db` on the device.

For private mode, run Ollama on the GPU (bound to localhost so nothing else on the network can use it), then add `LLM_PROVIDER=ollama` and `OLLAMA_URL=http://127.0.0.1:11434` to `verafund.env`:

```bash
docker run -dit --name ollama --runtime nvidia --network host --restart unless-stopped \
  -e OLLAMA_HOST=127.0.0.1:11434 -v ~/ollama-models:/data/models/ollama/models \
  -v ~/ollama-logs:/data/logs dustynv/ollama:r36.3.0
docker exec ollama ollama pull qwen2.5:3b
python3 scripts/llm-bench.py qwen2.5:3b
```

## Quality

- `lib/*.test.ts`: decision engine, service layer (both core workflows, workspace isolation), fraud engine, payoff math, insights, purchase analysis.
- `seldon.yml`: Wren scripts for the price-hike and free-trial workflows. Results are in `wren-results/`. Run `bash scripts/seldon.sh run --wait`.

## Project layout

```
app/                 pages, server actions, API routes (/api/health, /api/vera/*)
components/          UI: landing, guard, overview, transactions, goals, banks, advisor, VeraDock
lib/engine.ts        subscription decision engine
lib/fraud.ts         fraud scoring        lib/jev.ts      Jev client
lib/guard.ts         subscription service lib/finance.ts  shared finance reads
lib/plaid.ts         bank import          lib/vera-chat.ts Vera conversation
lib/payments/        Stripe + simulated adapters
lib/db/              Drizzle schema and libSQL client
```
