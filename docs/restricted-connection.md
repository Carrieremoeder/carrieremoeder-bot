# Restricted test connection

Implemented: `BOT_TEST_STORAGE_MODE=restricted-postgres` routes the signed sale
handler to the installed `bot_payment_test.record_purchase` function using `pg`.
There is no fallback to the app's privileged key. Only Preview, the bot project,
the exact test-role username and the dashboard-verified Supabase hosts are accepted.
TLS certificate verification is mandatory; URL query parameters cannot override it.
Only synthetic `.invalid` email addresses are accepted. Each connection checks
identity, elevated privileges, role memberships and inherited access before writing.
Writes use a transaction, parameters, bounded waits and sanitized errors.

## Verified and not yet verified

- Verified locally with PostgreSQL/PGlite: signed handler → restricted adapter →
  test function → one persisted row for duplicate delivery. Invalid signatures,
  conflicting identities, production targets and later unsafe grants fail closed.
- The test schema and SQL smoke tests were verified in hosted Supabase previously.
- Hosted pg authentication, TLS and pooler behavior remain unverified: the test role
  still has NOLOGIN and no password. The webhook remains disabled.
- No test-role password, signing secret or live billing settings were created.

## Activation configuration (Preview branch only)

1. Account owner enables password login for `bot_payment_test_runner` and sets a
   unique password. All its other role flags stay off; do not grant it other roles.
2. Account owner stores the URI as sensitive `BOT_TEST_DATABASE_URL` in Vercel
   Preview, branch `codex/bot-year-subscription`. Use the SAME new test-role password,
   percent-encoded; never use or reset the postgres administrator password.

   `postgresql://bot_payment_test_runner.ejtfgvlaygrcthjihwoa:PERCENT_ENCODED_TEST_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`

3. Set `BOT_TEST_STORAGE_MODE=restricted-postgres` on the same Preview branch.
   Redeploy and test the actual connection before enabling intake.
4. Configure `SYSTEME_WEBHOOK_SECRET`, verified funnel/step/price-plan IDs, and signed
   delivery. Funnel 7643956 and step 25595872 are verified; the immutable price-plan
   ID is still unverified. Do not substitute a fixture ID or match only price/name.
5. Enable `BOT_PURCHASE_INTAKE_ENABLED=true` only for that Preview after the above
   tests. Production stays disabled. Synthetic intake does not grant chat access.

## Checkout investigation, 1 October 2026

The concept funnel still contains a EUR 13 monthly subscription. Its settings show
Mollie selected and no test-mode option in the inspected funnel/payment settings.
No sale setting was changed. Systeme.io's official test-purchase guide describes
an actual purchase followed by a refund; its specific unsupported test-mode remark
mentions Stripe, so it does not prove Mollie test-mode support or absence.
Do not claim a free end-to-end Systeme purchase is available. A real purchase
requires the owner's payment action and can incur fees. Mollie API test payments
can separately test the adapter but do not establish the Systeme-to-Mollie mapping.

Sources:
- https://help.systeme.io/article/151-how-to-make-a-test-purchase
- https://node-postgres.com/features/ssl
- https://supabase.com/docs/guides/database/postgres/roles
