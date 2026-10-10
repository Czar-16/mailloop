# Mailloop

Personalized job outreach from your own Gmail. Production domain: **https://mailloop.in**.

Create templates, import contacts, preview emails for up to 15 recipients, attach a resume, and track delivery and replies. Every message has one recipient; Mailloop never batches through CC or BCC.

## Run locally

Requirements: Node.js 24 LTS, npm 11.19.0 (matching CI), Docker Compose, and a Google OAuth web client with Gmail API enabled.

1. Keep your existing `.env`, or copy `.env.example` to `.env` for a fresh checkout. Fill in the missing secrets; never commit `.env`.
2. Run `npm ci` (generates Prisma Client).
3. Run `docker compose up -d postgres`.
4. Run `npm run db:deploy` to apply checked-in migrations. No database reset is needed.
5. Run `npm run dev` on the host at **http://localhost:3000**.
6. In a second terminal, run `npm run inngest:dev`. Keep `INNGEST_DEV=1` locally so events go to the local Inngest dev server.
7. Sign in, save a template and contacts, optionally upload a PDF in Settings, and send from Compose.

Docker runs PostgreSQL only. The database is exposed on **localhost:5433** to avoid the existing host listener at 5432. The `mailloop_postgres_data` volume is preserved. Do not run `docker compose down -v` unless you intend to erase the database.

The original scaffold, schema, generated-client path, and initial migration are retained. Prisma's configuration is now named `prisma.config.ts`. All three Prisma packages are pinned to **7.10.0**; do not upgrade them or use `prisma db push` to bypass migration history.

## Environment

| Variable                                            | Purpose                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                      | Local: `postgresql://mailloop:mailloop@localhost:5433/mailloop`; production: managed PostgreSQL URL |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Docker database configuration                                                                 |
| `AUTH_URL`                                          | `http://localhost:3000` locally; **`https://mailloop.in`** in production                            |
| `AUTH_SECRET`                                       | Auth.js session encryption secret; generate with `openssl rand -base64 32`                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | Google OAuth web client credentials                                                                 |
| `TOKEN_ENCRYPTION_KEY`                              | Separate 32-byte AES-GCM key, encoded as 64 hexadecimal characters                                  |
| `INNGEST_DEV`                                       | `1` for local development only; unset in production                                                 |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`          | Production Inngest event publishing and callback signature verification                             |
| `BLOB_READ_WRITE_TOKEN`                             | Token for a **private** Vercel Blob store; required in production                                   |

Generate the token encryption key once:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep this key backed up securely. Changing it makes existing refresh tokens unreadable; key rotation requires decrypting/re-encrypting existing tokens or reconnecting every account. It is independent of `AUTH_SECRET`.

Secrets are never sent as client props or returned by actions. Logs and Inngest events/step outputs contain no OAuth tokens, email bodies, or raw MIME messages.

## Google OAuth

Enable Gmail API and configure a **Web application** OAuth client. Add these exact authorized redirect URIs:

- Local: `http://localhost:3000/api/auth/callback/google`
- Production: **`https://mailloop.in/api/auth/callback/google`**

Use `http://localhost:3000` and `https://mailloop.in` as the corresponding origins. Configure the consent screen and add your Gmail account as a test user during development. Request `openid`, `email`, `profile`, `gmail.send`, and `gmail.readonly`.

Mailloop requests offline access and consent. Google returns a refresh token, which is encrypted before storing it. If a later login omits the token, the saved token remains intact. Settings offers reconnection for revoked/expired permission. Do not automatically link existing users based only on matching email addresses; users are bound to Google's stable account ID.

`gmail.readonly` is a restricted scope. Before making the app broadly available, complete Google's applicable OAuth verification/security assessment requirements, verify **mailloop.in**, and provide public privacy policy and terms URLs that describe your actual operation. OAuth consent in Testing can produce short-lived refresh authorization; see Google's documentation for exceptions and production requirements.

Sources: [Auth.js Google provider](https://authjs.dev/reference/core/providers/google), [Google Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## Features and behavior

- **Templates:** Plain-text name, subject, and body, with a reference example and cursor insertion buttons. Supported placeholders are `{{name}}`, `{{company}}`, and `{{role}}`. Unknown/incomplete placeholders are rejected. Missing company values become empty text; every recipient needs a job role. Paste your portfolio, GitHub, LinkedIn, or other links directly into the message. You can include multiple links. Use full URLs because emails are sent as plain text. Both template and Compose previews display the complete personalized message, including paragraphs and URLs. The complete example includes sample links and a signature to replace; attach the resume in Compose or remove the attachment sentence.
- **Contacts:** Save 1–5 preferred roles at first use or in Settings. Contacts require an editable name, email, and job role; company is optional. Email-derived names are suggestions and generic addresses need correction. Import comma/semicolon/newline email lists, CSV/TSV, or a CSV file with an `email` header. Optional columns are `name`, `company`, and `jobRole` (or `role`). Imports accept up to 1,000 rows / 1 MB, support quoted CSV, and provide editable, paginated previews and a bulk role selector. Correct unresolved names and roles before saving; duplicates are skipped. Emails are trimmed and lowercased; Gmail dot/plus aliases are not collapsed. Legacy Tag/Notes data remains in the database, and roles are backfilled from the latest nonempty campaign role when available.
- **Compose:** Select 1–15 recipients and one template. Each recipient starts with their contact's job role, with batch-only overrides, saved shortcuts, filtering, and Apply Role to Selected. Preview each recipient separately. Contacts already sent/replied show local Last Sent timestamps and are skipped unless explicitly selected for resending. Queued and uncertain deliveries cannot be overridden.
- **Links and resume attachment:** Paste URLs directly into templates. Upload a resume PDF (up to 5 MiB) in Settings, then select “Attach Resume” in Compose; attachment defaults off. Mentioning a PDF in the message does not attach it. Both MIME type and PDF header are checked. Local uploads are stored under ignored `uploads/`; production uses private Blob with authenticated direct uploads, avoiding Vercel's function request-body limit. The server validates the uploaded file before activating it. Only the authenticated owner's current resume can be downloaded. Queued messages retain the chosen PDF and complete rendered message after later edits. Migration `20261008020000_inline_template_links` replaces every body `{{link}}` occurrence (including whitespace variants and archived templates) with the owner’s saved URL, then removes the saved-link column. Where no URL exists, the placeholder stays visible and preview/sending report “Replace {{link}} with a URL directly in your message.” Queued and historical snapshots remain unchanged.
- **History:** Sends redirect to `History?campaign=<id>` with queued, sent, failed, cancelled, and delivery-review counts. Progress refreshes every 5 seconds while visible and active. Approximate remaining ranges include all outstanding sends for that user and the persisted next-send delay; retries and service delays can extend them. Completion comes from delivery states rather than a countdown. Recipient/company/role/template snapshots, filters, pagination, and automatic refresh are preserved. Sent Today uses a UTC calendar day; the quota uses the rolling last 24 hours.
- **Appearance:** Geist typography, restrained blue accents, matching light/dark tokens, and locally remembered Light/Dark/System choices. System is the default; the theme is applied before first paint. Explicit switches use brief opacity transitions and respect reduced motion. The account avatar menu contains account details, Settings, and Sign Out with keyboard and outside-click support.
- **Replies:** Inngest schedules checks every 8 hours (00:00, 08:00, and 16:00 UTC). Scheduled checks include never-checked threads and threads last checked more than eight hours ago; History can queue a manual check anytime, bypassing that cutoff. Each run processes up to 50 least-recently checked threads, with one durable step per thread. Larger histories rotate across runs. Only a later message from the original recipient counts; self messages and identified automatic responses are ignored. Forwarded/new-thread replies cannot be matched reliably.
- **Quota:** Up to 500 successful sends in 24 hours plus outstanding queue reservations and uncertain attempts. Mailloop cannot reserve quota for emails you send outside the app; Gmail may impose additional account limits.
- **Cancellation:** History can cancel an individual ready email or the queued portion of a batch, with confirmation and a Cancelled filter. The user-row lock serializes cancellation with delivery claims. Sent, actively sending, and uncertain messages cannot be stopped. Cancelled sends release quota reservations, finish campaign progress without claiming successful delivery, and release superseded PDFs once no remaining send needs them.
- **Export and account deletion:** Settings downloads a private, uncached JSON export from `/api/account/export` with version/timestamp, profile/preferences, contacts, templates, campaign/message history, and attachment metadata. Credentials and storage locations are excluded; download the current PDF separately. Typed-email confirmation sets `deletionRequestedAt`, cancels ready sends, and signs out immediately. Session validation, OAuth reconnect, campaign creation, uploads, and workers reject disabled accounts. The one-minute maintenance job retries cleanup after a 15-minute drain period: attempt Google revocation, delete owned local/private Blob PDFs (including unactivated uploads), then delete campaigns before templates/attachments and the account. A failed cleanup retains the disabled account for retry. Signed Blob completion callbacks also remove late uploads for disabled or missing accounts. OAuth, Gmail, Blob, and local request reads have bounded timeouts; sleeping send jobs recheck the account on wake. Deleting Mailloop does not delete Gmail or recipient copies.
- **Follow-up reminders:** Default to 7 days; Settings also offers Off, 3, or 14 days. History computes a paginated due list on each load using the latest successful send, matching contact IDs and immutable recipient addresses. Replies, pending/uncertain deliveries, archived contacts, and an existing shortlist request suppress reminders. Each row shows its reply-check time; Check Replies remains manual. Add to shortlist reuses the existing follow-up flow; Compose is always the approval step.
- **Public policies:** `/privacy` and `/terms` are public and linked at sign-in, the landing footer, and Settings. The operator is Czar16; support is `czar16dev@proton.me`. Review their wording and actual production provider/retention practices before launch.
- **Contact/template removal:** Contacts/templates are archived so queued emails and history survive. Resume replacement/removal affects new campaigns; queued messages retain their original version. Superseded files are deleted only when no queued/uncertain send requires them.

## How sending works

`src/lib/campaigns.ts` locks the user row in a short transaction, revalidates ownership/duplicates/quota, and snapshots each rendered message, recipient, template name, and attachment. An idempotency key makes repeated submission of the same campaign return its original result.

Each `Send` row acts as a durable outbox entry. `src/lib/inngest.ts` publishes one event per recipient using only `userId` and `sendId`. A one-minute dispatcher retries pending publishing. Event IDs and database delivery state protect against duplicate execution.

The worker serializes active delivery steps per user. It checks `nextSendAt` in the database and uses `step.sleepUntil` instead of blocking a request. After each attempt it persists a random 20–60-second delay; separate campaigns share the same pacing. Inngest concurrency alone would not suffice because sleeping releases the execution slot.

`src/lib/gmail.ts` builds UTF-8 MIME with exactly one `To` address and an optional PDF, then sends the base64url-encoded message through Gmail API. The maintained MIME composer is installed as `gmail-mime`, separating it from Auth.js's unused optional Nodemailer provider dependency.

Delivery is **not exactly once** across Gmail and PostgreSQL: they cannot share a transaction. Before the Gmail call, the worker records its attempt and stable Message-ID. After an ambiguous timeout/crash, it searches Gmail Sent for that Message-ID instead of resending. Unconfirmed attempts remain reserved and blocked, with a History error; manual and scheduled reply checks also retry reconciliation. If Gmail cannot confirm delivery, inspect Gmail Sent and investigate the stored attempt before any administrator clears it. Confirmed 429 and temporary rate-limit 403 rejections receive bounded exponential backoff; confirmed permanent failures release their reservation.

Trade-offs: JWT sessions avoid additional Auth.js session tables; plain-text templates avoid a rich-text editor; private Blob avoids public URLs and ephemeral production disk; the MIME library handles Unicode and multipart encoding rather than handwritten MIME; authenticated routes use request-time rendering rather than caching user-specific data.

## Code map

| File                                               | Responsibility                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/auth.ts`                                      | Google OAuth, verified identity, JWT session callbacks                        |
| `src/lib/crypto.ts`                                | AES-256-GCM encryption with a fresh nonce and authentication tag              |
| `src/lib/db.ts`                                    | Shared Prisma 7 client with PostgreSQL driver adapter                         |
| `src/lib/session.ts`                               | Session + database user validation                                            |
| `src/lib/validation.ts`, `src/lib/imports.ts`      | Shared validation, placeholders, CSV parsing                                  |
| `src/lib/actions.ts`, `src/lib/campaigns.ts`       | Authenticated CRUD, imports, campaign snapshots, quota reservations           |
| `src/lib/inngest.ts`, `src/lib/gmail.ts`           | Durable dispatch, pacing, delivery reconciliation, Gmail MIME/reply detection |
| `src/lib/storage.ts`, `src/lib/resume-actions.ts`  | Private PDFs, version retention, authenticated activation/removal             |
| `src/lib/account.ts`, `src/lib/launch-actions.ts`  | Explicit data export, deletion drain/cleanup, authenticated launch controls   |
| `src/lib/cancellation.ts`, `src/lib/follow-ups.ts` | Serialized cancellation and paginated manual follow-up reminders              |
| `src/app/(app)`                                    | Protected Compose, Templates, Contacts, History, and Settings                 |
| `DESIGN.md`, `src/app/globals.css`                 | Design source of truth and Tailwind v4/shadcn-compatible tokens               |

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm run build
npx prisma migrate status
```

Database/browser tests require the **local** database with checked-in migrations. Tests create and delete only UUID-scoped fixtures. Gmail calls are mocked in database tests. Browser tests use a separate server on port 3100, signed test-session cookies, fake refresh tokens, and an unreachable Inngest event endpoint; they never send real emails. Test artifacts are ignored.

Browser checks run desktop Chrome and mobile emulation with axe accessibility scans. Set `CHROME_PATH` when needed, or install Playwright's browser with `npx playwright install chromium`.

For a real smoke test, sign in with a user-controlled Google test account and send to another address you control. Verify the PDF, Gmail Sent message, reply detection, and reconnection. Real OAuth consent, Gmail delivery, and production Blob need valid external configuration and are not simulated by passing automated tests.

## Deploy to Vercel

1. Connect this repository and configure a managed PostgreSQL database. Keep local Docker out of production.
2. Set production environment variables, including **`AUTH_URL=https://mailloop.in`**, separate secrets, and a **private** Blob store token. Do not set `INNGEST_DEV` in production.
3. Back up the production database, then run `npm run db:deploy` against the production database as a controlled release step, then build with `npm run build`. Prisma Client is generated during installation; retain dev dependencies for the build/migration stage.
4. Connect Inngest to **`https://mailloop.in/api/inngest`** and configure the event/signing keys. After deploying schedule changes, re-register the Inngest functions to activate the new cron. Auth.js entrypoints and service callbacks use provider verification; all user actions remain session-authenticated and user-scoped.
5. Add **mailloop.in** in Vercel Domains and configure the DNS records shown by Vercel. Complete Google production consent configuration using the callback above.
6. Review the public policies and confirm production hosting, PostgreSQL, private Blob, Inngest, and backup-retention practices. Configure Google consent with `https://mailloop.in/`, `https://mailloop.in/privacy`, `https://mailloop.in/terms`, and the production callback. Complete applicable Google OAuth verification/security assessment requirements for restricted Gmail access before broad launch.
7. Verify sign-in, a controlled individual email with a PDF, private PDF access, signature-protected Inngest callbacks, reply detection, cancellation, export, reconnection, and deletion with accounts you control. Verify backups and monitor disabled accounts awaiting cleanup as well as failed sends, uncertain deliveries, and pending dispatch before inviting beta users. Do not log message contents or credentials.

Useful references: [Private Blob](https://vercel.com/docs/vercel-blob/private-storage), [Blob client uploads](https://vercel.com/docs/vercel-blob/client-upload), [Inngest concurrency](https://www.inngest.com/docs/durable-execution/flow-control/concurrency).

## Dependency audit

Prisma remains exactly 7.10.0 as required. The current `npm audit --omit=dev` reports four high-severity findings in Prisma CLI tooling and its `@prisma/config`, `deepmerge-ts`, and `mysql2` dependencies. The app uses PostgreSQL through `@prisma/adapter-pg`; it does not use the MySQL driver or accept user-provided Prisma configuration. Keep the CLI in the build/migration environment and track the upstream advisories. Do not run `npm audit fix --force`, which proposes changing the required Prisma version.

## Launch migration and cleanup operations

`20261010010000_launch_controls` adds `SendStatus.CANCELLED`, `Send.cancelledAt`, `User.deletionRequestedAt`, and `User.followUpDays` (default 7, constrained to 0/3/7/14). It is additive and preserves existing send history. Keep Prisma at 7.10.0 and apply migrations before deploying the new queries.

Register the updated existing Inngest functions after deployment; `maintenance` performs deletion cleanup and storage retries. A deletion request is durable even if Inngest is temporarily unavailable. Ensure maintenance remains scheduled every minute. Accounts disabled longer than the drain window should be investigated for revocation/storage failures; restart maintenance after fixing configuration. Retention of provider-managed backups/logs must be established with your actual providers rather than assumed from application cleanup. Automated tests use mocked Gmail/revocation and local storage; production Blob cleanup and real OAuth still need the controlled live checks above.
