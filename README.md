# VeraFund

**Subscriptions that ask before they charge.**

Rocket Money-style apps tell you about a subscription charge after it's already gone through. VeraFund gives every subscription its own virtual card with a hard per-charge limit, so charges are checked *before* they land:

- **Price hikes wait for you.** A charge above the limit is declined. You see the evidence, then either approve the new price or keep blocking it.
- **Free trials can't quietly convert.** A trial card locks the day the trial ends, so the first paid charge is declined unless you choose to keep the subscription.
- **Everything is on the record.** For every charge you can see what you authorized, what the merchant attempted, and what the card network decided.

Blocking a card stops charges on that card. It does **not** cancel your contract with the merchant, and the UI says so.

## How enforcement works

| Policy | Stripe Issuing (sandbox) | Simulated mode |
|---|---|---|
| Price cap | `spending_controls.spending_limits` with `interval: per_authorization`. Stripe declines before any webhook runs | Same rule, run by the local decision engine |
| Trial lock | The card is set to `inactive` when the trial ends | The card status is set locally |
| Pause / close | `inactive` / `canceled` | Set locally |
| Charge | `POST /v1/test_helpers/issuing/authorizations`. The decision and `request_history.reason` are stored as evidence | `decide()` in `lib/engine.ts` |

The header always shows which mode is running: **Stripe Issuing · sandbox** or **Simulated · no payment network**. Only test-mode keys are accepted.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000, SQLite file verafund.db, simulated mode
npm test           # decision engine unit tests
```

Copy `.env.example` to `.env.local` to point at Turso and/or a Stripe sandbox.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `libsql://…` (Turso) or `file:…`. Defaults to `file:verafund.db` locally. **Required on Vercel.** |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `STRIPE_SECRET_KEY` | Stripe **sandbox** key (`sk_test_…`). Leave empty for simulated mode |
| `STRIPE_CARDHOLDER_ID` | Optional existing sandbox cardholder. Otherwise one is created on first use |

**Stripe sandbox checklist:** enable Issuing, add a **test top-up** to the Issuing balance (otherwise every authorization is declined for insufficient funds), and make sure no old real-time authorization endpoint is configured.

`GET /api/health` reports database reachability and the payments mode.

## Self-host (Docker, Jetson)

One container, with the SQLite file on a volume and no cloud database. Stripe is optional; without it the app runs in simulated mode.

```bash
docker build -t verafund .
docker run -d --name verafund -p 3000:3000 -v verafund-data:/data --restart unless-stopped verafund
```

Then open `http://<host-ip>:3000`. The image sets `COOKIE_SECURE=false` so the demo session works over plain HTTP on a LAN. Set it to `true` behind HTTPS.

**Jetson (JetPack 6) with Docker 28 or newer:** the L4T kernel has no iptables `raw` table, so bridge networking fails with "Unable to enable DIRECT ACCESS FILTERING". Use host networking for both steps:

```bash
docker build --network=host -t verafund .
docker run -d --name verafund --network host -v verafund-data:/data --restart unless-stopped verafund
``` To build an arm64 image on a PC: `docker buildx build --platform linux/arm64 -t verafund:arm64 --load .`

## Demo workflows (used for Wren QA)

**W1: Price hike blocked, then approved.** Start demo → simulate an $18.99 charge on Netflix (limit $15.99) → it's declined, with "$18.99 is above your $15.99 limit" → click "Approve $18.99 going forward" → simulate $18.99 again → it's approved → reload, and the limit and both charges persist.

**W2: Free trial can't silently convert.** Start demo → Add subscription "Calm", $12.99 monthly, free trial 7 days → the status shows "Trial" → click "Jump ahead 8 days" → the status shows "Trial ended: card locked" → simulate $12.99 → it's declined with "Free trial ended…" → reload, and it persists. Calm is not marked cancelled.

Every visitor gets an isolated demo workspace, held in a cookie. "Reset demo" starts a fresh one.

## Stack

Next.js 15 (App Router, server actions) · Tailwind CSS v4 · Drizzle ORM on libSQL (Turso in the cloud, SQLite file on edge devices) · Stripe Issuing sandbox · Vitest.

```
app/            pages, server actions (app/actions.ts), /api/health
components/     UI (subscription panels, virtual card, timeline)
lib/engine.ts   pure approve/decline decision engine (+ tests)
lib/guard.ts    workspace-scoped service layer
lib/payments/   Stripe sandbox and simulated adapters
lib/db/         Drizzle schema and libSQL client (schema is created on first use)
```

