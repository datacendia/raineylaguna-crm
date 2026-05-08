# Rainey Laguna CRM

Lead management system for Rainey Laguna Studios. Manages 1,000+ SMB leads across Lima's 5 districts.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set `.env.local`:
```
CRM_COOKIE_SECRET=<32+ random characters>
CRM_LEAD_INTAKE_SECRET=<shared with raineylaguna-next>
DATABASE_URL=postgresql://user:password@localhost:5432/raineylaguna
REDIS_URL=redis://localhost:6379
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
npm run lint        # next lint
```

CI runs all four (lint, typecheck, test, build) on every PR via
`.github/workflows/ci.yml`.

> **Note for Railway deploys.** The `Procfile` `web` and `worker` lines do **not**
> auto-spawn two processes on Railway — Railway ignores Procfile process types.
> The worker must be added as a **separate Railway service** pointing at the
> same repo with `Start Command: npm run worker`. Step-by-step in `DEPLOY.md`
> §2 ("Provision the project").

## Features

- **Authentication**: Password-protected admin section
- **Lead Management**: Import, filter, and manage leads
- **Pipeline View**: Kanban-style pipeline (Lead → Contacted → Audited → Proposal → Closed)
- **Outreach Tracking**: Log email, Instagram, WhatsApp, LinkedIn outreach
- **Video Audits**: Track Loom video audits and conversions
- **CSV Import**: Bulk import leads from research data

## Routes

- `/login` - Login page
- `/dashboard` - Main dashboard
- `/dashboard/leads` - Lead list with filters
- `/dashboard/pipeline` - Pipeline kanban view
- `/dashboard/outreach` - Outreach tracking
- `/dashboard/video-audits` - Video audit management

## API Endpoints

- `POST /api/auth/login` - Authentication
- `GET /api/leads` - Fetch leads with filters
- `POST /api/leads` - Create new lead
- `POST /api/import` - Import CSV leads
- `POST /api/outreach` - Log outreach event
- `GET /api/outreach` - Fetch outreach events
- `POST /api/video-audits` - Add video audit
- `GET /api/video-audits` - Fetch video audits
