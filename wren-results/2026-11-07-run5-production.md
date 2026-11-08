**Seldon QA — Seldon QA: verafund** · 3/3 passed (100%)

> All 3 of 3 test cases passed — the core subscription-protection journeys are working correctly. Price-hike detection and user approval flow work end-to-end: a charge above the set limit is declined, the user can raise the limit with one tap, and that decision persists after a reload. The free-trial lock behaves as designed: when a trial ends the card locks and the first paid charge is declined, with a clear explanation and an option to keep the subscription rather than a silent cancellation. Bulk-guarding subscriptions found in transaction history also works: flagged rows are detected, the guard action completes with a confirmation banner, and both subscriptions appear with correct limits after reload. No failures or blocked cases; there are no headline risks to report at this time.

| | Case |
|---|---|
| ✅ | `w5-find-subscriptions` Subscriptions found in the transaction history can be guarded in one click |
| ✅ | `w1-price-hike` A price hike above the card limit is declined, then approved by the user |
| ✅ | `w2-trial-lock` A free trial's card locks when the trial ends, so the first paid charge is declined |

Run: https://app.seldon.com/experiments/7c47d8d6-1416-4e29-ace4-0b6a877c8de4 · target https://verafund.vercel.app · commit d55de52 (Purchase Analyzer upgrade, Lithic adapter) · Nov 7 2026 ~5:35 PM PST
