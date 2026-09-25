# Bot sessions

- Sign in again in a new tab or a newly launched app window. Only an ordinary reload restores the current tab's session. Browsers that report duplicated tabs as reloads may copy sessionStorage; normal new-tab launches start unauthenticated.
- Log out after 30 minutes without trusted pointer, keyboard, input, wheel or touch activity. Show a warning for the final minute.
- Focus, visibility changes, timer ticks and background requests never extend the local idle deadline. They recheck it against wall-clock time, including after sleep.
- Tokens live in sessionStorage, with an in-memory fallback when storage is unavailable. They are never written to localStorage. The server accepts signed version-2 bearer tokens only, valid for at most 30 minutes; the old shared cookie is ignored and cleared on login.
- Active tabs renew only after real activity. Each tab has its own session and deadline. Failed renewal retries without extending the local deadline.
- Logout clears credentials and private UI state immediately, aborts file reads and chat requests, and ignores responses from earlier sessions. Saved conversations remain in the database. Unsent drafts and attachments are cleared.
- Tokens are stateless: discarding them logs this tab out, but an already copied token remains valid until its short expiry. Server-side revocation is outside this change.

Run `node --test tests/session.test.mjs` for idle-clock, reload/new-tab, storage fallback, authentication and renewal coverage. Validate the production build before deployment. Existing users must log in once again after this migration.

