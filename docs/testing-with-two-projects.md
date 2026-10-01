# Payment testing with the existing two projects

The bot and dossier app already use two Supabase projects. A third project is
not a product requirement. Do not upgrade, pause, delete or merge either project
as part of payment testing.

## Available now: offline application flow

Run `node --test tests/*.test.mjs tests/*.test.js`.
`purchaseFlow.test.mjs` connects the actual sale handler, signature verification,
purchase storage adapter, Mollie reader and first-period verifier. It replaces
network access with synthetic responses and an in-memory purchase inbox.
It covers duplicate delivery, tampering, open-to-paid transitions, month-end
dates, refunds, chargebacks, wrong purchases and live-mode rejection.

This verifies component compatibility; it does NOT verify PostgreSQL transactions,
provider payload formats, webhook delivery, checkout, automatic access or renewals.
The inbox simulation must not be treated as validation of purchase-inbox.sql.

## Hosted test zone installed and verified (1 October 2026)

`supabase/payment-test-zone.sql` was applied to the existing bot project.
It creates only `bot_payment_test` and the NOLOGIN `bot_payment_test_runner` role.
Preflight checks reject inherited data/schema privileges and callable application
functions before committing any change. Existing privileges were not changed.
The schema was not exposed through the Data API. The test table accepts only
synthetic `.invalid` email addresses. The write function is SECURITY INVOKER.

`supabase/verify-payment-test-zone.sql` passed in the actual Supabase SQL editor:
duplicate/conflicting purchase checks, rejection of real email addresses, denied
reads of `public.codes`, `public.chat` and `auth.users`, and denied evidence updates.
Result: PASS, role can login = false, remaining smoke-test rows = 0.
Supabase's administrator needed temporary membership to SET ROLE; that membership
and all smoke-test rows were rolled back together. No credentials were created.

Local PostgreSQL tests use PGlite (development dependency) to execute the migration,
verify grants/RLS, exercise the hosted verification script, and prove the entire
migration rolls back when inherited privileges make isolation unsafe. PGlite is
not a hosted Supabase replacement and does not exercise concurrent connections.

The automated webhook is NOT connected to this zone yet. `purchaseStore.js` still
refuses production projects. The next implementation step is an adapter using a
restricted server-side connection or a reviewed, narrowly scoped gateway. Do not
enable LOGIN or reuse the production service key as a shortcut. Actual Mollie and
Systeme.io checkout tests, concurrent delivery, and access provisioning remain open.

## Design constraints for connecting a hosted runner

Use a dedicated `bot_payment_test` schema inside the existing BOT project, with
synthetic data only. Keep it out of Data API exposed schemas initially. Do not
run the existing public-schema purchase-inbox migration against production.

A schema by itself is not a security boundary for a privileged service key.
Before wiring a hosted runner, create a dedicated database role with no membership
in production roles, no BYPASSRLS and grants only on the test schema. Verify its
effective permissions against public, auth and storage, including inherited PUBLIC
grants and SECURITY DEFINER functions. Do not revoke shared privileges blindly:
the existing app may rely on them. Use that restricted role through a server-only
database connection; never give a test runner the production service-role key.

Acceptance checks before activation:
- runner cannot read or write live customer, code, conversation or auth tables;
- runner cannot invoke any production function that exposes or changes that data;
- duplicate/conflicting purchase delivery is tested against PostgreSQL itself;
- Mollie access uses a test key, makes no real charge and never changes the
  existing Systeme.io payment connection;
- actual Systeme.io checkout support for test mode is established separately;
- synthetic test records never cause emails or paid bot access.

If effective isolation cannot be demonstrated without changing production-wide
permissions, keep tests offline. Do not weaken the current purchaseStore checks:
that adapter intentionally accepts only a separate staging project. An audited
restricted-role adapter is required before this proposed shared-project route
can replace it. The isolated schema is installed; no login credentials have been created.

## Validation

All 61 automated tests pass, including eight real PostgreSQL checks. The hosted
Supabase verification also passed. A local frontend build was attempted but is
unverified: esbuild 0.18.20 crashes while traversing an inaccessible Windows parent
directory. No frontend source was changed in this test-zone update. Check the
Preview deployment build before merging; this branch remains a draft.

## Sources checked 1 October 2026

- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api
- https://docs.mollie.com/reference/testing
