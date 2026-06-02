# Rainey Laguna CRM

Lead management system for Rainey Laguna Studios. Manages 1,000+ SMB leads across Lima's 5 districts.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set `.env.local` (see `.env.example` for the full, annotated list):
```
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/raineylaguna
CRM_COOKIE_SECRET=<32+ random characters>
# Recommended
REDIS_URL=redis://localhost:6379              # BullMQ queue + distributed rate limiter
CRM_LEAD_INTAKE_SECRET=<shared with raineylaguna-next>
# Outreach (optional; each degrades gracefully when unset)
ANTHROPIC_API_KEY=...                          # AI draft generation
RESEND_API_KEY=...                             # email send
RESEND_FROM="Rainey Laguna <hola@raineylaguna.com>"
TWILIO_ACCOUNT_SID=...                          # WhatsApp send
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

> **Note.** Authentication moved from a single `CRM_PASSWORD_HASH` env var
> to a per-user model backed by the `users` table. Use `npm run user:create`
> (step 4) to provision admins; do not set `CRM_PASSWORD_HASH` — it is no
> longer read.

3. Run database migrations:
```bash
npm run migrate
```
This applies every file in `database/migrations/` against `DATABASE_URL`
(idempotent). Against a Railway-managed Postgres after deploy, run the
same command from a one-off shell — see `DEPLOY.md`.

4. Create your first admin user:
```bash
npm run user:create -- you@example.com "Your Name" "your-secure-password"
```

5. Seed initial leads (~330 from the Lima report):
```bash
npm run seed
```

6. Start development server:
```bash
npm run dev
```

7. (Optional) Start the BullMQ outreach worker in a separate terminal:
```bash
npm run worker
```

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run lint        # eslint .
npm run test:e2e    # playwright test (starts the dev server)
```

CI runs lint, typecheck, test, and build on every PR via
`.github/workflows/ci.yml`.

## Background jobs

Run as separate Railway services / cron schedules (all read `DATABASE_URL`):

```bash
npm run worker              # BullMQ outreach worker (real Email/WhatsApp sends)
npm run draft-outreach-cron # Mon/Wed/Fri AI-draft generation for cold leads
npm run digest-email        # Monday 09:00 Lima digest email (needs DIGEST_EMAIL_TO + Resend)
npm run sync-sereno         # Sereno customer cross-reference sync
```

> **Note for Railway deploys.** The `Procfile` `web` and `worker` lines do **not**
> auto-spawn two processes on Railway — Railway ignores Procfile process types.
> The worker must be added as a **separate Railway service** pointing at the
> same repo with `Start Command: npm run worker`. Step-by-step in `DEPLOY.md`
> §2 ("Provision the project").

## Features

- **Authentication**: Per-user admin accounts with optional TOTP 2FA, 30-day rolling sessions, and a per-IP login rate limiter (Redis-backed, in-process fallback).
- **Lead Management**: Import, filter, tag, soft-delete/restore, and CSV-export leads. Smart priority score (`src/lib/priority-score.ts`, env-tunable via `CRM_PRIORITY_WEIGHTS`).
- **Pipeline View**: Kanban (Lead → Contacted → Audited → Proposal → Closed); swipeable on mobile.
- **Outreach**: Real sends via a unified dispatcher — Email (Resend) + WhatsApp (Twilio); Instagram DM / LinkedIn as manual channels. Quiet-hours scheduling (09:00–18:00 Lima). Delivery/read tracking via Twilio StatusCallback; reply tracking via an inbound-email webhook.
- **AI drafts**: Claude-generated outreach drafts with a global review queue at `/dashboard/drafts` (edit, real Send, Discard).
- **Audits**: Automated digital-health audit + a manual Website Audit Workbench (8 dimensions, weighted scoring) persisted per lead.
- **Sereno cross-reference**: A sync matches vigia customer emails to leads and badges converted ones.
- **Digest**: Weekly Monday digest page + an auto-email cron.
- **Video Audits**: Track Loom video audits and conversions.
- **Health**: `GET /api/health` reports DB, required-env, deployed git SHA, and a service-presence map.

## Routes

- `/login` - Login page (password + optional TOTP)
- `/dashboard` - Main dashboard
- `/dashboard/leads` - Lead list with filters, tags, Sereno badge, CSV export
- `/dashboard/leads/[id]/audit-workbench` - Manual Website Audit Workbench
- `/dashboard/pipeline` - Pipeline kanban view (mobile-friendly)
- `/dashboard/drafts` - Global AI-draft review queue
- `/dashboard/digest` - Weekly Monday digest
- `/dashboard/outreach` - Outreach tracking
- `/dashboard/batch` - Batch outreach scheduling
- `/dashboard/video-audits` - Video audit management
- `/dashboard/security` - TOTP 2FA enrolment

## API Endpoints

- `POST /api/auth/login` - Authentication (rate-limited; TOTP-aware)
- `GET /api/leads` - Fetch leads with filters (excludes soft-deleted)
- `POST /api/leads` - Create new lead
- `PATCH /api/leads/[id]` - Update a lead; `{ restore: true }` un-deletes
- `DELETE /api/leads/[id]` - Soft-delete (`?hard=true` to purge)
- `GET /api/leads/export` - Stream a filtered CSV of leads
- `GET|POST|DELETE /api/leads/[id]/tags` - Manage lead tags
- `GET|PUT /api/leads/[id]/manual-audit` - Manual audit snapshot (score recomputed server-side)
- `POST /api/leads/[id]/audit` - Run the automated digital-health audit
- `GET|POST|PATCH /api/leads/[id]/draft-outreach` - Per-lead AI draft
- `GET /api/drafts` - Global pending-draft queue; `POST /api/drafts/[id]/send` delivers
- `POST /api/import` - Import CSV leads
- `GET|POST /api/outreach` - Outreach events
- `POST /api/batch` - Schedule a batch outreach run
- `GET|POST /api/video-audits` - Video audits
- `POST /api/webhooks/twilio` - Twilio StatusCallback (delivery/read)
- `POST /api/webhooks/inbound-email` - Inbound-email reply tracking
- `GET /api/health` - Liveness + dependency + service-presence probe
