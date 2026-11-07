# Demo script (3 minutes, and the judge drives)

Before the demo:
- Open the production URL in a fresh browser window.
- Make sure the header badge shows the mode you expect.
- Keep the Wren result links in a tab.

## 0:00–0:20: The hook
"Rocket Money charges you a subscription to tell you about subscriptions you've **already paid for**. We think the charge should ask *you* first. VeraFund gives every subscription its own card with a hard price cap, and the card network enforces it."

## 0:20–1:10: Hand them the laptop (W1)
- "Click **Start demo**. Each of these is a real virtual card." In Stripe mode, add: "…issued in Stripe's Issuing sandbox."
- "Netflix just raised its price. Type **18.99** on Netflix and hit **Simulate charge**."
- It's **declined**: "$18.99 is above your $15.99 limit".
- "That decline didn't come from an if-statement in our app. Stripe's spending controls rejected it before any money moved. We store Stripe's own reason as evidence." Only say this in Stripe mode. In simulated mode, say "our decision engine".
- "Now you decide." Click **Approve $18.99 going forward**, then simulate 18.99 again. It's **approved**.

## 1:10–1:50: Free trials (W2)
- "Ever forgotten to cancel a free trial?" Click **Add subscription**, enter Calm, $12.99, free trial 7 days, and save.
- Click **Jump ahead 8 days**. Calm shows **Trial ended: card locked**.
- Simulate 12.99. It's **declined**: "Free trial ended…".
- "And notice we *don't* mark it cancelled. Locking a card isn't cancelling a contract, and we never pretend it is. If you want it, one click keeps it."

## 1:50–2:20: The evidence log
- Open **Details** on Netflix, then the **Evidence log**: what you authorized, what the merchant attempted, what the network decided, and when you changed the policy.
- "If you dispute a charge, this is your paper trail."

## 2:20–2:45: How we know it works
- "Seldon's Wren agent ran both of these flows against this exact build." Show the Wren results.
- "Every demo session is isolated, and money is stored as integer cents. We have 20 automated tests, including workspace isolation."

## 2:45–3:00: Where it goes
"The same app runs on a local SQLite file. Next, we're putting it on an edge device, so your financial data never leaves hardware you own."

---

## Likely judge questions

**"Isn't this just Privacy.com?"**
Privacy-style cards give you limits and pause buttons. We focus on the *subscription decision*: a price hike becomes a question you answer, a trial has an end date that locks the card, and every decision is on the record. Rocket Money is detection after the fact plus a cancellation concierge; we stop the charge first.

**"Does it cancel my subscription?"**
No, and we say so in the UI. Blocking stops charges on that card. You still cancel with the merchant, and "I cancelled with X: close card" records that you did.

**"How do you get my bank data?"**
We don't need it for this flow. You move each subscription onto its own VeraFund card. Bank-statement import to find existing subscriptions is the next step.

**"What if the merchant's name on the charge doesn't match?"**
The engine normalizes merchant descriptors. A hard merchant lock needs Stripe's real-time authorization webhook, because merchant-ID spending controls are in private preview. That's on the roadmap; the price cap and trial lock are native today.

**"Is real money involved?"**
No. This is Stripe's Issuing sandbox (test mode). The app refuses live keys.

**"How would this make money?"**
Card issuers earn interchange on spend, which is how card-control products are typically funded. That keeps it free for users. This is a hypothesis, not a validated model.

