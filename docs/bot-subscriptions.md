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

