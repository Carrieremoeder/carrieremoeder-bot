# Email accounts

The bot uses the same Supabase Auth account provider as the dossier app. Only its public anon key is used for account actions. The existing bot Supabase project and its service key remain responsible for bot entitlements and conversations.

## Deployment

1. Apply `supabase/email-accounts.sql` to the **bot** project. It adds a stable account identifier without changing conversation codes.
2. Associate existing bot access with the customer's verified purchase email. Never infer paid access from an Auth account alone. For old records, the first verified login binds `auth_user_id` with a conditional update. Ambiguous matches fail closed.
3. In the shared Auth provider, allow the exact redirect `https://bot.carrieremoeder.com/` while retaining the dossier redirects. Email templates must use `{{ .ConfirmationURL }}` (or the supplied redirect for token-hash callbacks). Keep SMTP configured.
4. Use the same account credentials in both apps. A password reset changes the shared Carrièremoeder account password. Access to each product is checked independently.

The UI supports login, signup, email confirmation, recovery links and setting a new password. Supabase verifies credentials and confirmed-email ownership. The bot exchanges that identity for its existing short-lived per-tab token; provider access and refresh tokens from login are never returned to the browser. Recovery credentials arrive only via the provider's link and are removed from the visible URL on mount.

Legacy code login remains only for unmigrated accounts. After an account binds to Auth, its old code/password route cannot sign in. Existing 30-minute inactivity logout and new-tab login requirements stay in effect. `access_until` is also checked on protected API requests.

Account creation is not a purchase. An active row in `codes`, with a matching verified email for initial linking or a matching stable Auth identifier afterwards, is required. This change does not install a payment processor or subscription webhook.

Tests: `node --test tests/*.test.mjs`. Before launch, test delivery of signup and recovery emails and complete the flows with a user-controlled mailbox. No customer passwords should be collected by the development agent.

Optional provider overrides: `BOT_AUTH_URL` and `BOT_AUTH_PUBLIC_KEY` must be set together. Default public configuration is in `lib/accountProvider.js`.

