**Seldon QA — Seldon QA: verafund** · 2/2 passed (100%)

> Both test cases passed (2/2). The price-hike approval flow for Netflix works end-to-end: an over-limit charge is correctly declined with a clear explanation, the user can approve the new amount in one click, and that approval persists through a page reload. The free-trial lock flow for Calm also behaves correctly: once the trial period expires the card is locked, the first real charge is declined with an informative reason, and the subscription is never prematurely cancelled. No failures or blocked cases were observed; all user-facing journeys are functioning as intended.

| | Case |
|---|---|
| ✅ | `w2-trial-lock` A free trial's card locks when the trial ends, so the first paid charge is declined |
| ✅ | `w1-price-hike` A price hike above the card limit is declined, then approved by the user |

Run: https://app.seldon.com/experiments/2b720953-c4f9-4462-9ac1-30c8d7625cb4 · target https://verafund.vercel.app · commit 63764c9 (all features) · Nov 7 2026 ~2:25 PM PST
