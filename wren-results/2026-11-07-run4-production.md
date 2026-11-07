**Seldon QA — Seldon QA: verafund** · 3/3 passed (100%)

> All 3 of 3 test cases passed. The core subscription-protection journeys are solid end-to-end: detected price increases are surfaced clearly and can be guarded in a single action with limits correctly applied to each subscription; a charge above the user's set limit is properly declined with an explanatory message and the limit updates correctly when the user approves the new price, persisting across page reloads; and a free-trial card locks as expected when the trial ends, declining the first paid charge with a clear reason while keeping the cancellation option visible. No failures or blocked cases to report — the product is in a healthy state across all tested scenarios.

| | Case |
|---|---|
| ✅ | `w5-find-subscriptions` Subscriptions found in the transaction history can be guarded in one click |
| ✅ | `w1-price-hike` A price hike above the card limit is declined, then approved by the user |
| ✅ | `w2-trial-lock` A free trial's card locks when the trial ends, so the first paid charge is declined |

Run: https://app.seldon.com/experiments/a38d433c-b701-4a9f-8991-5397f3ae5079 · target https://verafund.vercel.app · commit ea66d29 (Vera actions, subscription discovery, phone fraud alerts) · Nov 7 2026 ~4:55 PM PST
