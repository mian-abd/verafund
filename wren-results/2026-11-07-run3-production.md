**Seldon QA — Seldon QA: verafund** · 2/2 passed (100%)

> All 2 of 2 tests passed with no failures or blocked cases. The two core subscription protection journeys — price-hike enforcement and free-trial lock — both behaved exactly as intended. When Netflix raised its price above the user's set limit, the charge was correctly declined with a clear explanation, the user could approve the new amount in one step, and that approval persisted through a page reload. Separately, when a free trial ended, the card was locked as expected so the subscription could not silently convert to paid, and the account remained active rather than cancelled. No headline risks identified; the product is in good shape across these journeys.

| | Case |
|---|---|
| ✅ | `w2-trial-lock` A free trial's card locks when the trial ends, so the first paid charge is declined |
| ✅ | `w1-price-hike` A price hike above the card limit is declined, then approved by the user |

Run: https://app.seldon.com/experiments/8870c720-5154-463b-b397-4d3c3b86d020 · target https://verafund.vercel.app · commit 579f584 (new landing page, Vera on every page) · Nov 7 2026 ~3:15 PM PST
