# Bot subscriptions — draft implementation, not enabled

Offer: EUR 13 including tax per month, initial 12 months (EUR 156), then continuing monthly. An early cancellation ends on the first anniversary. After that, notice is one calendar month from receipt. Statutory withdrawal and exceptional termination require a separate flow and must not be refused by the ordinary cancellation calculation.

Implemented: versioned contract policy, Dutch calendar-date handling, anchored billing periods, a service-role-only contract table, authenticated status/cancellation endpoint and conditional cancellation persistence. Duplicate cancellation must preserve the original date. Paid access and contract obligation are separate; a 12-month commitment does not grant unpaid access.

`BOT_SUBSCRIPTIONS_ENABLED` must remain unset. No live migration has been run. No existing entitlement has been changed. The new endpoint is deliberately unavailable by default. It is not wired into the UI yet.

## Verified configuration

- Systeme.io concept funnel 7643956, order step 25595872, page 45042182, deactivated.
- Saved monthly plan: EUR 13, every 1 month, no trial, tax inclusive.
- No native minimum-term setting was shown in its subscription form.
- Mollie has an existing active dossier webhook; payment.paid deliveries returned HTTP 200. This proves delivery, not correct entitlement processing.
- Mollie payment metadata from an existing purchase contains `sio_order_item_id` and `sio_payment_id`; the classic webhook belongs to Systeme.io and must not be overwritten.

## Required before activation

1. Verify a test purchase of this specific plan and bind its immutable Systeme.io order item to the Mollie customer/subscription. Never grant access based only on EUR 13, a free-text product name or browser success redirect.
2. Build and test Mollie payment reconciliation, refunds/chargebacks and out-of-order deliveries; fetch current provider state server-side. No new subscriptions may be created by the bot: Systeme.io owns collection.
3. Persist cancellation immediately, then schedule collection termination for the recorded end date. The worker must process pending requests, retry failures and confirm provider state before reporting that collection has stopped. It must not cancel the provider subscription immediately when notice is given during the initial year.
4. Handle final partial billing/refunds when one-month notice ends between invoice dates. Never extend the contract to the next invoice date to avoid a partial period.
5. Provide subscription-management login to expired/non-paying accounts without granting paid chat access. Current app login denies expired bot access, so this is a launch blocker.
6. Add user-facing status/cancel UI, terms acceptance evidence, withdrawal route, purchase/confirmation emails and a complete test-mode lifecycle.
7. Apply SQL only after verifying the existing codes primary key/type; configure server-side provider credentials without putting them in source, browser storage or chat. Enable only after provider and database integration tests pass.

## Proposed checkout wording

€13 per maand inclusief btw. Je sluit een abonnement af voor 12 maanden en betaalt maandelijks (totaal €156 voor het eerste jaar). Daarna loopt het abonnement door voor €13 per maand en kun je op ieder moment opzeggen met een opzegtermijn van één maand. Je kunt tijdens het eerste jaar alvast opzeggen voor het einde van dat jaar. Je wettelijke rechten, waaronder de toepasselijke bedenktijd, blijven gelden.

This text is a draft, not a substitute for completed terms/withdrawal implementation.

## Purchase intake added (still disabled)

`api/systeme-sale.js` is preview-only and requires `BOT_PURCHASE_INTAKE_ENABLED=true`, a separately provisioned `SYSTEME_WEBHOOK_SECRET`, and exact `SYSTEME_BOT_FUNNEL_ID`, `SYSTEME_BOT_STEP_ID`, `SYSTEME_BOT_PRICE_PLAN_ID`. Only the first two IDs are currently verified (7643956, 25595872). Never use fixture plan ID 123 or infer plan identity from the displayed price/name.

The endpoint checks Systeme normalized HMAC, stores minimal immutable purchase evidence through `bot_record_purchase`, and does not change access. The draft `supabase/purchase-inbox.sql` is for an isolated staging database, not the existing customer database. SQL has not been executed or integration-tested. Delivery event headers are unsigned and are routing hints only.

`firstPaidPeriod` compares an authenticated sale with a payment fetched from Mollie, checks exact order-item identity, test mode, first-payment status, amount, reversals and payment date. It returns a candidate only; no first-purchase access transaction or reconciliation worker is wired yet. Missing reversal fields deliberately require review until actual provider responses are verified. No subscription is created by this code.

Next dependencies: isolated staging Supabase credentials; actual immutable price-plan ID; signed Systeme webhook configuration; supported Systeme-to-Mollie test-purchase route. Mollie test API works independently, but this does not establish that Systeme checkout can use test mode. Verify that separately before suggesting a free end-to-end purchase. Production launch additionally needs provider subscription mapping, acceptance evidence, atomic access provisioning, renewals/reversals, cancellation worker and UI.

References: https://developer.systeme.io/docs/webhooks and https://developer.systeme.io/docs/webhooks-events-new-sale

## Isolated purchase storage (1 October 2026)

The purchase intake now requires `BOT_STAGING_SUPABASE_PROJECT_REF` and
`BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY`, scoped to the subscription Preview branch.
It no longer uses `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` for writes.
The staging project must be separate from both the bot and shared account projects.
Both known production project references, reuse of the production key, and a target
matching `SUPABASE_URL` or `BOT_AUTH_URL` are rejected before a network request.
Requests are limited to the purchase-inbox RPC, refuse redirects, and time out after
10 seconds. The webhook still grants no access and starts no collection.

Verified in the Supabase dashboard on 1 October: the organization has two projects
and creating another free project is blocked by the two-project limit. Neither
existing project was paused or modified. A separate hosted staging database has
not been provisioned; database integration and an actual test purchase remain unverified.
Local automated tests use simulated database responses, not a real Supabase instance.

### Later update: third project no longer required for database tests

An isolated test schema was installed in the existing bot project on 1 October.
The real Supabase smoke test passed with a NOLOGIN role and all fixture rows rolled
back. Local PGlite tests now additionally execute real PostgreSQL SQL and check
permissions. See `docs/testing-with-two-projects.md` for the verified scope and
remaining connection work. The webhook is still disabled and not connected to
this schema; the earlier staging-project guard remains in place.


