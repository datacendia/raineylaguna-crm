# Chapter 07 — Configuration & Setup Reference

**Who this is for:** the founder and anyone technical who manages the Railway
deployment. This is the only chapter in the handbook that assumes you can read a
terminal, edit environment variables, and use the Railway dashboard.

**What you'll do:** look up every environment variable (the named settings that
control how the apps behave), learn where to set each one, turn on the
connection that sends website leads into the CRM, configure Twilio (WhatsApp)
and Resend (email), understand the scheduled jobs (crons) and their timing, and
follow a short deploy/runbook.

Two separate apps are in play:

- **CRM** — `raineylaguna-crm` (this repo). The internal sales/outreach system.
- **Site** — `raineylaguna-next`. The public marketing website.

They are deployed as **separate Railway projects/services** and each has its own
set of environment variables. A few variables intentionally appear on both — those
are the bridge between them, and they must match.

> ⚠️ If something looks wrong: every variable the CRM reads is listed in one place,
> `src/lib/env.ts` (the `ENV_KEYS` array). The site's variables live in its own
> `src/lib/env.ts` (a Zod schema). If a variable isn't in those files, the app does
> not read it — check for a typo before assuming it's missing.

---

## How configuration works (read this first)

Each app loads its environment variables through a single file so there's one
source of truth.

- **CRM** (`raineylaguna-crm/src/lib/env.ts`): exposes a `serverEnv` object.
  Unset variables come back as `undefined`, and each consumer decides what to do
  (throw, return a 503, or run in a reduced "degraded" mode). It does **not**
  crash at boot for a missing optional key.
- **Site** (`raineylaguna-next/src/lib/env.ts`): validates everything with Zod
  **at boot**. If a required-shape value is wrong (e.g. a malformed URL), the
  server process crashes on start with a clear error in the Railway logs. There's
  an escape hatch, `SKIP_ENV_VALIDATION=1`, used only by CI/Docker builds where
  the real values aren't present yet.

"Degraded mode" is a term you'll see below. It means: the feature is switched off
gracefully instead of erroring. For example, if email isn't configured, outreach
email events stay **Pending** rather than failing.

**Where you set variables:** Railway dashboard → pick the service → **Variables**
tab → add or edit. For values that come from another Railway service (like the
database URL), use **Add Reference** instead of pasting a literal value. After
changing variables, the service redeploys automatically.

---

## CRM environment variables

Grouped by purpose. "Required" means the relevant feature throws or returns an
error if it's unset; "optional" means the feature degrades gracefully.

### Database & queue

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `DATABASE_URL` | **Required (boot)** | Postgres connection string. Everything reads/writes here. | Railway → reference the Postgres service on **both Web and Worker** |
| `REDIS_URL` | Optional* | Redis connection for the BullMQ job queue. Falls back to `localhost:6379` in dev. | Railway → reference the Redis service on **both Web and Worker** |

\* `REDIS_URL` is effectively required in production — the outreach worker needs
a real Redis. The fallback is a dev convenience only.

### Auth & cookie

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `CRM_COOKIE_SECRET` | **Required (boot)** | 32+ random bytes used to sign the login cookie. | Railway → Web and Worker |

There is **no shared password.** Users live in the database (the `users` table)
and are created with `npm run user:create` (see the runbook below). The old
`CRM_PASSWORD_HASH` is **deprecated** — if it's still in Railway, remove it.

Generate a cookie secret with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Lead intake bridge (site → CRM)

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `CRM_LEAD_INTAKE_SECRET` | Optional (but needed to accept site leads) | Shared secret the public lead endpoint checks. When unset, `POST /api/leads/public` returns **503**. | Railway → CRM **Web** |
| `CRM_INBOUND_EMAIL_SECRET` | Optional | Shared secret for `POST /api/leads/from-email` (the Cloudflare Email Worker that turns inbound emails into leads). | Railway → CRM **Web** |

The matching value on the site side is also called `CRM_LEAD_INTAKE_SECRET`. See
[Turning on the site → CRM connection](#turning-on-the-site--crm-connection) below.

### AI-drafted outreach (Anthropic)

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Required for drafting | Powers the lead draft-outreach endpoint and the draft-outreach cron. The drafter throws if unset. | Railway → CRM **Web** (and the cron service if separate) |
| `ANTHROPIC_MODEL` | Optional | Model override. Falls back to the code default (`claude-3-5-sonnet-20241022`). | Railway → same place |

The draft cron has three extra tuning knobs (read by the cron script; not in the
`ENV_KEYS` proxy): `DRAFT_CRON_MAX_LEADS` (default 25), `DRAFT_CRON_MIN_AGE_DAYS`
(default 7), and `DRAFT_CRON_DRY_RUN` (default false).

### Twilio / WhatsApp (outreach sending)

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | Required for WhatsApp send | Twilio account ID. | Railway → CRM **Worker** (the worker does the sending) |
| `TWILIO_AUTH_TOKEN` | Required for WhatsApp send | Twilio auth token. | Railway → Worker |
| `TWILIO_WHATSAPP_FROM` | Required for WhatsApp send | The WhatsApp sender, e.g. `whatsapp:+14155238886`. | Railway → Worker |
| `TWILIO_TEMPLATE_SID` | Required for production outbound | Approved message template ID. Needed because outbound-to-leads has no 24h customer-initiated window. | Railway → Worker |
| `CRM_PUBLIC_BASE_URL` | Recommended | Public HTTPS origin (e.g. `https://crm.raineylaguna.com`). Used to build Twilio delivery `StatusCallback` URLs. | Railway → Web and Worker |
| `TWILIO_STATUS_CALLBACK_TOKEN` | Recommended | Shared secret in the status-callback path. The delivery webhook returns **401** without it. | Railway → Web |

If **any** of the four core Twilio values are missing, the worker leaves WhatsApp
events as **Pending** with a note explaining the missing config (degraded mode) —
it does not crash. With all four set, it sends and marks events **Sent**.

### Resend / email (outreach sending)

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `RESEND_API_KEY` | Required to send email | Resend API key. | Railway → CRM **Worker** |
| `RESEND_FROM` | Required to send email | Verified sender, e.g. `Rainey Laguna <hola@raineylaguna.com>`. | Railway → Worker |

If either is unset, the dispatcher leaves Email events **Pending** (same degraded
contract as Twilio). Nothing breaks; email just doesn't go out.

### Google / PageSpeed (Digital Presence Audit & discovery)

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Required for discovery; audit fallback | Used by the discovery/backfill scripts, and as the audit route's PageSpeed fallback key. The in-app "Run audit" button needs this on the **Web** service. | Railway → CRM Web and/or the Audit Cron service |
| `GOOGLE_PAGESPEED_API_KEY` | Optional | Audit prefers this key; if unset it falls back to `GOOGLE_PLACES_API_KEY`, then to keyless PageSpeed (lower quota). | Railway → CRM Web |

### Sereno (vigia) customer cross-reference sync

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `VIGIA_CUSTOMERS_URL` | Required for sync | Read-only vigia endpoint that returns customer emails. | Railway → wherever `npm run sync-sereno` runs |
| `VIGIA_SYNC_SECRET` | Required for sync | Bearer secret presented to `VIGIA_CUSTOMERS_URL`. | Railway → same place |

This sync cross-references existing Sereno (vigia) customers against CRM leads so
you don't pitch someone who's already a customer.

### Digest auto-email

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `DIGEST_EMAIL_TO` | Required for the digest email | Comma-separated recipients of the weekly digest. | Railway → the digest cron service |

The digest also reads `DIGEST_DRY_RUN` (default false) — set it to `true` to
render and log the email without actually sending. The digest send itself uses
the Resend variables above.

### Scoring, build & runtime metadata

| Variable | Required? | What it does | Where to set |
|---|---|---|---|
| `CRM_PRIORITY_WEIGHTS` | Optional | Partial JSON deep-merged over the default lead-scoring weights. Server-side only. | Railway → CRM Web |
| `NEXT_PUBLIC_GIT_SHA` | Optional | Deployed git SHA shown by `/api/health` as `version`. | Leave unset on Railway |
| `RAILWAY_GIT_COMMIT_SHA` | Auto | Injected by Railway for repo-linked services; the health-version fallback. | Auto |
| `NODE_ENV` | Recommended | Set to `production` in prod. | Railway → Web and Worker |

---

## Site (raineylaguna-next) environment variables

These are validated by Zod at boot. A bad-shape value (e.g. a non-URL where a URL
is expected) **crashes the site on start** with a `KEY: message` error in the
Railway logs.

### Lead intake bridge (site → CRM)

| Variable | Required? | What it does |
|---|---|---|
| `CRM_PUBLIC_API` | Optional | URL of the CRM that receives public contact-form submissions. **If blank, the form runs in log-only stub mode** (it logs instead of sending). |
| `CRM_LEAD_INTAKE_SECRET` | Optional (min 8 chars) | Signs the request to the CRM's `/api/leads/public`. Must match the CRM's value. |

### Instant audit (/auditoria)

| Variable | Required? | What it does |
|---|---|---|
| `PAGESPEED_INSIGHTS_API_KEY` | Optional | Google PageSpeed key. Falls back to local heuristics if absent. |

### 60-Second Site generator (/proto)

| Variable | Required? | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Required (unless stub) | Must start with `sk-ant-`. Powers `/api/proto/generate`; returns 500 if unset and not stubbed. |
| `ANTHROPIC_MODEL` | Optional | Model override; defaults to `claude-3-5-sonnet-20241022`. |
| `PROTO_STUB_MODE` | Optional | `1`/`true` → skip the Anthropic call, return a deterministic stub (good for local dev). |
| `META_GRAPH_TOKEN` / `META_IG_USER_ID` | Optional | Meta Graph API access, gated on Meta app approval. |

### Proto store (Postgres)

| Variable | Required? | What it does |
|---|---|---|
| `DATABASE_URL` | Optional | Postgres for proto-site persistence. If unset, falls back to a local JSON file (`./.proto-store.json`) — fine for dev, not durable on Railway. |
| `PG_SSL_REJECT_UNAUTHORIZED` | Optional | Set `false`/`0` if Postgres uses a self-signed cert. Defaults to true. |

### Anti-bot, WhatsApp inbound, internal bypass

| Variable | Required? | What it does |
|---|---|---|
| `TURNSTILE_SECRET` | Optional (prod: set it) | Cloudflare Turnstile server secret. When unset, verification is a no-op so dev forms still submit. |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | Optional | Public Turnstile sitekey for the audit/lead forms. |
| `WHATSAPP_VERIFY_TOKEN` | Optional (min 16) | Echoed during Meta's webhook GET verification. Unset → webhook 503s. |
| `WHATSAPP_APP_SECRET` | Optional (min 16) | Meta App Secret; verifies the `X-Hub-Signature-256` HMAC on inbound POSTs. Unset → POST rejected. |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional | Business sender's phone-number ID; path segment in outbound `/messages` calls. |
| `WHATSAPP_ACCESS_TOKEN` | Optional | Long-lived token (scope `whatsapp_business_messaging`) for outbound calls. |
| `AUDIT_INTERNAL_TOKEN` | Optional (min 32) | Lets server-to-server callers invoke `/api/audit` without Turnstile. Unset → no bypass (public Turnstile flow still works). |

### Gated playbook & observability

| Variable | Required? | What it does |
|---|---|---|
| `PLAYBOOK_USER` / `PLAYBOOK_PASSWORD` | Optional | HTTP Basic Auth for the internal `/playbook` doc. Either unset → route 503s. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | Optional | Server-side Sentry error monitoring. |
| `NEXT_PUBLIC_SENTRY_DSN` / `_ENVIRONMENT` / `_RELEASE` | Optional | Browser-side Sentry. |
| `NEXT_PUBLIC_SERENO_API` | Optional | Sereno live-brief API root (used by `<SerenoBrief>`). |
| `NEXT_PUBLIC_CAL_BOOKING` | Optional | Cal.com booking URL for the audit/contact CTA. |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Optional | Cloudflare Web Analytics beacon token. |
| `RAILWAY_GIT_COMMIT_SHA` | Auto | Injected by Railway; Sentry release fallback. |
| `SKIP_ENV_VALIDATION` | CI only | `1` to bypass Zod validation during stubbed builds. |

> 📷 Screenshot: the Railway Variables tab for the CRM Web service, showing the
> grouped variables filled in.

---

## Turning on the site → CRM connection

This is the single most important integration. When it's on, a visitor who
submits the public contact form on the marketing site creates a lead in the CRM.

It is controlled by **two variables that must agree across both apps:**

1. On the **site** (`raineylaguna-next`), set:
   - `CRM_PUBLIC_API` = the CRM's public URL, e.g. `https://crm.raineylaguna.com`
     (locally: `http://localhost:3001` or wherever the CRM runs).
   - `CRM_LEAD_INTAKE_SECRET` = a long random string (8+ chars).

2. On the **CRM** (`raineylaguna-crm`), set:
   - `CRM_LEAD_INTAKE_SECRET` = **the exact same string** as on the site.

Step by step:

1. Generate one strong random secret:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. In Railway, open the **site** service → **Variables** → set `CRM_PUBLIC_API`
   to the CRM URL and `CRM_LEAD_INTAKE_SECRET` to that secret.
3. In Railway, open the **CRM Web** service → **Variables** → set
   `CRM_LEAD_INTAKE_SECRET` to the **same** secret.
4. Let both services redeploy.
5. Submit a test contact form on the live site and confirm a new lead appears in
   the CRM Leads list.

> ⚠️ If something looks wrong: if `CRM_PUBLIC_API` is **blank** on the site, the
> form silently runs in **log-only stub mode** — it never reaches the CRM. If the
> two `CRM_LEAD_INTAKE_SECRET` values **don't match**, the CRM's
> `/api/leads/public` returns **503** and the lead is rejected. Check both
> services. See [Troubleshooting](06-troubleshooting.md).

---

## Setting up Twilio (WhatsApp)

WhatsApp sending happens in the **Worker** service. All four core values must be
present or the worker degrades (events stay Pending).

1. Create a Twilio account and enable the WhatsApp messaging product.
2. From the Twilio console, copy your **Account SID** → set `TWILIO_ACCOUNT_SID`
   on the CRM Worker service.
3. Copy your **Auth Token** → set `TWILIO_AUTH_TOKEN`.
4. Set `TWILIO_WHATSAPP_FROM` to your WhatsApp sender in the form
   `whatsapp:+<number>` (the sandbox is `whatsapp:+14155238886`).
5. **For production**, apply for WhatsApp message-template approval at Meta and
   set the approved template ID as `TWILIO_TEMPLATE_SID`. This is required because
   outbound-to-leads has no 24-hour customer-initiated window. **Allow 5–10 days**
   for approval.
6. Set `CRM_PUBLIC_BASE_URL` (your public CRM origin) and
   `TWILIO_STATUS_CALLBACK_TOKEN` (a random secret) so Twilio can post delivery
   status back to the CRM. Without the token, the callback webhook returns 401.
7. Redeploy the Worker. Schedule a tiny test batch and watch the Worker logs mark
   events **Sent**.

> 📷 Screenshot: Twilio console showing Account SID and Auth Token (redact the
> token).

---

## Setting up Resend (email)

Email sending also happens in the **Worker** service.

1. Create a Resend account and verify your sending domain (e.g.
   `raineylaguna.com`).
2. Create an API key → set `RESEND_API_KEY` on the CRM Worker service.
3. Set `RESEND_FROM` to a **verified** sender string, e.g.
   `Rainey Laguna <hola@raineylaguna.com>`.
4. Redeploy the Worker. Without both values, Email events stay **Pending** (no
   error).

The weekly digest email also uses Resend, so configuring it here enables the
digest too (you still need `DIGEST_EMAIL_TO`).

---

## Scheduled jobs (crons)

These are the recurring jobs. Each maps to an npm script in `package.json`. On
Railway, schedule them via **Settings → Cron** on a service whose **Start
Command** is that script (and which has the variables that script needs).

| Job | Script (`npm run …`) | Suggested schedule | What it does |
|---|---|---|---|
| **outreach-drain** | `outreach-drain` | frequent (e.g. every few minutes) | Drains due outreach events from the queue and dispatches them (WhatsApp via Twilio, email via Resend). Complements the always-on `worker`. |
| **draft-outreach-cron** | `draft-outreach-cron` | daily | Uses Anthropic to draft outreach for eligible leads. Honors `DRAFT_CRON_MAX_LEADS`, `DRAFT_CRON_MIN_AGE_DAYS`, `DRAFT_CRON_DRY_RUN`. Needs `ANTHROPIC_API_KEY`. |
| **digest-email** | `digest-email` | weekly (Monday) | Renders and emails the weekly digest to `DIGEST_EMAIL_TO`. `DIGEST_DRY_RUN=true` logs without sending. Uses Resend. |
| **discovery / audit** | `discover`, `audit`, or `audit:full` | daily (`0 2 * * *`) | `discover` sweeps Lima districts × niches via Google Places for new businesses; `audit` scores each lead's website 0–100 and writes `digital_health_score`, `audit_findings`, `audited_at`; `audit:full` runs both. All idempotent and safe to re-run. Needs `GOOGLE_PLACES_API_KEY`. |
| **sync-sereno** | `sync-sereno` | daily/weekly | Cross-references Sereno (vigia) customers against CRM leads. Needs `VIGIA_CUSTOMERS_URL` + `VIGIA_SYNC_SECRET`. |

The two **always-on** processes (not crons) are defined in the `Procfile`:
`web: npm start` and `worker: npm run worker`.

> ⚠️ If something looks wrong: a cron that fails usually shows the reason in that
> service's Railway logs — most often a missing variable (the script throws) or a
> credential the integration rejected. Cross-check the relevant group above. See
> [Troubleshooting](06-troubleshooting.md).

---

## Deploy & runbook

The CRM runs as a multi-service Railway project. The canonical step-by-step is in
the repo's `DEPLOY.md`; the essentials:

**Services in the project:**
1. **Postgres** (managed) — provides `DATABASE_URL`.
2. **Redis** (managed) — provides `REDIS_URL`.
3. **Web** — the Next.js app (`Start Command: npm start`).
4. **Worker** — same repo (`Start Command: npm run worker`).
5. Optional cron services for the jobs above (each with its own Start Command).

**Build & health:** `railway.json` uses the Nixpacks builder, restarts
`ON_FAILURE` (up to 10 retries), and health-checks `/api/health`. That endpoint
also reports the deployed `version` (git SHA).

**First deploy (one-time):**

1. Provision Web + Postgres + Redis + Worker in Railway (see `DEPLOY.md` §2).
2. Set the variables on **both Web and Worker**: `CRM_COOKIE_SECRET`,
   `DATABASE_URL` (reference), `REDIS_URL` (reference), `NODE_ENV=production`.
3. From Railway's "Run a Command" on the Web service, apply the schema:
   `npm run migrate` (and optionally `npm run seed`).
4. Create your first login user (no shared password exists):
   `npm run user:create -- "you@raineylaguna.com" "Your Name" "a-strong-password"`
   Re-run for each additional user.
5. Add a custom domain (e.g. `crm.raineylaguna.com`) in Settings → Networking and
   point a CNAME at the Railway target.

**Verify:** open `/login`, sign in, schedule a small Batch Outreach, and confirm
the Worker logs mark events Sent.

**Routine deploy:** push to `main`; Railway rebuilds the linked services. If a
service won't boot, check its logs — the site fails fast with a `KEY: message`
env error, and the CRM throws from whichever consumer needed a missing key.

> ⚠️ If something looks wrong: never commit real secrets. `.env.local` is
> gitignored; use `.env.example` only as a template. Rotate
> `CRM_LEAD_INTAKE_SECRET`, `TWILIO_STATUS_CALLBACK_TOKEN`, and API keys on both
> apps together so the pairs stay in sync.

---

## Related chapters

- [Troubleshooting](06-troubleshooting.md) — what to do when a feature is silent
  or a cron fails.
- [Outreach & Messaging](04-outreach-messaging.md) — the WhatsApp/email sending these settings power.
- [Leads, Pipeline & Cities](03-leads-and-pipeline.md) — what the site → CRM bridge feeds.
