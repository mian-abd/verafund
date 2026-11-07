# Wren test scripts

**The fastest way is the CLI.** `seldon.yml` already holds W1 and W2 (W3 and W4 are marked `skip: true`). On Windows the CLI runs in Docker:

```bash
bash scripts/seldon.sh validate     # free: checks the file, the target and your plan
bash scripts/seldon.sh run --wait   # costs 1 simulation per case (2 for W1 and W2)
bash scripts/seldon.sh report       # verdicts for the last run
```

Make sure https://verafund.vercel.app/api/health returns `"ok":true` before you spend simulations.

To use the web app instead, paste each script below into Wren as its own test. Replace `<APP_URL>` with the production URL. Every run starts its own isolated demo workspace, so runs never interfere with each other and can be repeated.

To be prize-eligible, run **W1 and W2 against the final build**, and rerun both after the last deploy.

---

## W1: Price hike is blocked, then approved

> Go to <APP_URL>. Click the "Start demo" button in the middle of the page.
> You should land on a page titled "Guarded subscriptions" that lists Netflix, Spotify, Planet Fitness and Adobe Creative Cloud.
> In the Netflix section, check that it says "limit $15.99".
> In the Netflix section, clear the "Charge amount for Netflix" field, type 18.99, and click "Simulate charge".
> Verify that the Netflix section now shows "Declined" and the text "$18.99 is above your $15.99 limit".
> Click the button "Approve $18.99 going forward".
> Verify that the Netflix section now says "limit $18.99".
> In the Netflix section, make sure the charge amount field contains 18.99, then click "Simulate charge" again.
> Verify that the Netflix section now shows "Approved" and "Within your $18.99 limit".
> Reload the page. Verify that Netflix still says "limit $18.99" and its last charge still shows "Approved".
> Click "Details" in the Netflix section. Verify that the "Evidence log" shows a declined $18.99 charge, a line saying the limit was raised from $15.99 to $18.99, and an approved $18.99 charge.

## W2: Free trial can't silently convert to paid

> Go to <APP_URL>. Click the "Start demo" button in the middle of the page.
> Click "Add subscription". Enter "Calm" as the merchant and 12.99 as the price, and leave the billing cycle on Monthly. Check the "Free trial" checkbox, leave the trial length at 7 days, and click "Save subscription".
> Verify that a Calm section appears and its status starts with "Trial".
> At the top of the page, click "Jump ahead 8 days". Verify that the demo date now says "(+8 days)".
> Verify that the Calm section's status now says "Trial ended: card locked".
> In the Calm section, make sure the charge amount is 12.99 and click "Simulate charge".
> Verify that the Calm section shows "Declined" and text containing "Free trial ended".
> Reload the page. Verify that Calm still shows "Trial ended: card locked" and the declined charge.
> Verify that the Calm section does NOT say "Cancelled".

---

## Optional extra tests (only if time allows)

**W3: Keep blocking a price hike**
> Start a demo. Simulate a 14.99 charge on Spotify. Verify that it shows "Declined" with "$14.99 is above your $11.99 limit". Click "Keep blocking". Verify that Spotify still says "limit $11.99" and the approve button is gone. Reload and verify the same.

**W4: Pause and close a card**
> Start a demo. In the Planet Fitness section click "Pause card", then simulate a 24.99 charge, and verify it says "Declined" with "Card is paused". Click "Resume card", simulate 24.99 again, and verify "Approved". Click "Details", click "I cancelled with Planet Fitness: close card", simulate 24.99, and verify "Declined" with "Card closed".

## Notes for whoever runs Wren
- The header badge shows **"Stripe Issuing · sandbox"** when real Stripe test mode is on, or **"Simulated · no payment network"** otherwise. Note which mode each run used.
- If a charge in Stripe mode says "Stripe sandbox Issuing balance is too low", add a test top-up in the Stripe dashboard and rerun.
- Save every run's result link or recording for the submission.
