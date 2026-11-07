**Seldon QA — Seldon QA: w** · 2/2 passed (100%)

> Both test cases passed in this run — 2 of 2 green. The price-hike flow is solid end-to-end: an over-limit charge is correctly declined with the right message, the user can approve a new limit in one click, subsequent charges are approved under that updated limit, and the state survives a page reload. The trial-lock flow is equally clean: when a free trial expires the card locks automatically, the first real charge is declined with a clear explanation, and a one-click path to convert to paid is presented — all without incorrectly marking the subscription as cancelled. No failures or blocked cases to report.

| | Case |
|---|---|
| ✅ | `w1-price-hike` A price hike above the card limit is declined, then approved by the user |
| ✅ | `w2-trial-lock` A free trial's card locks when the trial ends, so the first paid charge is declined |

Run: https://app.seldon.com/experiments/ee15284d-6a46-40e0-99ff-12b49114f117 · target https://verafund.vercel.app (Turso, simulated payments) · commit 298919e · Nov 7 2026 ~1:12 PM PST
