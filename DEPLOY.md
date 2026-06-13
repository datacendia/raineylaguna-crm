# Deploying the CRM to Railway

Railway will run **three** Railway services in one project:
1. **Postgres** (managed)
2. **Redis** (managed)
3. **Web** (Next.js app — this repo)
4. **Worker** (BullMQ worker — same repo, different start command)

---

## 1. One-time setup

### a. Create a Railway account
https://railway.com → sign up with GitHub.

### b. Push this repo to GitHub
The CRM lives at `c:\Users\User\crm`. Initialize a git repo and push:

```powershell
cd c:\Users\User\crm
git init
git add .
git commit -m "Initial CRM"
# create empty repo on github.com/datacendia/raineylaguna-crm (private!)
git remote add origin git@github.com:datacendia/raineylaguna-crm.git
git branch -M main
git push -u origin main
```

> ⚠️ **Private repo.** This project contains seeded leads and outreach scripts.
> Do **not** push `.env.local` (it's in `.gitignore`).

### c. Install Railway CLI (optional but recommended)
```powershell
npm i -g @railway/cli
railway login
```

---

## 2. Provision the project

In the Railway dashboard:

1. **New Project → Deploy from GitHub repo** → pick `raineylaguna-crm`.
   This creates **service 1: Web**.
2. **+ New → Database → Add PostgreSQL.** Railway provisions it and sets a `DATABASE_URL` automatically.
3. **+ New → Database → Add Redis.** Railway provisions it and sets a `REDIS_URL` automatically.
4. **+ New → GitHub Repo → same repo.** This creates **service 2: Worker**.
   - In its Settings → Deploy → **Start Command:** `npm run worker`
   - In its Variables, click "Add Reference" and pull in `DATABASE_URL` + `REDIS_URL` from the databases.

---

## 3. Set environment variables

On **both** the Web and Worker services, set:

| Variable | Value |
|---|---|
| `CRM_COOKIE_SECRET` | a random 64-char string (e.g. from `openssl rand -hex 32`) |
| `DATABASE_URL` | reference to Postgres service |
| `REDIS_URL` | reference to Redis service |
| `NODE_ENV` | `production` |

**Optional:** set `GOOGLE_PAGESPEED_API_KEY` on the Web service to raise the
Digital Presence Audit quota (it falls back to keyless PageSpeed Insights if
unset). See `src/lib/env.ts` for the full set of optional integration keys.

The Web service additionally needs a public domain — Railway auto-creates `*.up.railway.app`. Add a custom domain like `crm.raineylaguna.com` in Settings → Networking → Custom Domain, then point a CNAME from your DNS to the Railway-provided target.

---

## 4. Run the schema migration (first deploy only)

After the Web service is up, open Railway's "Run a Command" UI on it and run:

```bash
npm run migrate
```

This applies `database/crm-schema.sql` to the Postgres instance.

(Optional) Seed the 330 demo leads:
```bash
npm run seed
```

### Create your admin user

Auth is **per-user** (the `users` table) — there is no shared password. Create
the first user from Railway's "Run a Command" UI on the Web service:

```bash
npm run user:create -- "you@raineylaguna.com" "Your Name" "a-strong-password"
```

Re-run for each additional user. (Locally, the same script works with
`DATABASE_URL` set in `.env.local`.)

---

## 5. Verify

- Open `https://crm.raineylaguna.com/login` (or the `*.up.railway.app` URL).
- Log in with the email + password of a user you created via `npm run user:create`.
- Navigate to **Batch Outreach** and schedule a small test batch (e.g. 3 leads).
- The Worker logs in Railway should show events being marked Sent at the scheduled times.

---

## 6. Run the Digital Presence Audit

The auditor scores every lead's website 0–100 (Google PageSpeed Insights +
on-page heuristics) and writes `digital_health_score`, `audit_findings`, and
`audited_at`.

### Option A: Railway Cron Service (recommended)

Run discovery + audit automatically on Railway as a scheduled cron job:

1. In Railway dashboard, click **+ New → GitHub Repo** → select `raineylaguna-crm`.
2. Name it **"Audit Cron"**.
3. In Settings → Deploy → **Start Command:** `npm run audit:full`
4. In Variables, click "Add Reference" and pull in `DATABASE_URL` from Postgres.
5. Set `GOOGLE_PLACES_API_KEY` (or `GOOGLE_PAGESPEED_API_KEY`) as a variable.
6. Go to Settings → Cron → **Add Cron Job**:
   - Schedule: `0 2 * * *` (runs daily at 2 AM UTC)
   - Command: `npm run audit:full`
7. Deploy the service.

Each run first sweeps all 43 Lima districts × 11 niches via Google Places to
discover **new businesses** (`npm run discover`), then audits every lead with a
website that hasn't been audited yet (`npm run audit`). Both steps are
idempotent and resumable — discovery dedupes on `google_place_id`, and the
auditor only touches rows where `audited_at IS NULL`. Safe to re-run.

> **Just audit, no discovery?** Use `npm run audit` instead.
> **Just discovery?** Use `npm run discover`.

### Option B: Local Script (manual)

For one-off audits from your laptop:

1. Create a **`.env.local`** in the repo root with:
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@HOST.proxy.rlwy.net:PORT/railway
   GOOGLE_PLACES_API_KEY=AIza...
   ```
2. Run:
   ```powershell
   npx tsx scripts/audit-sites.ts --with-website --concurrency 12
   ```

> The in-app **Run audit** button (lead detail page) instead needs
> `GOOGLE_PLACES_API_KEY` set on the Railway **Web** service Variables.

---

## Cost estimate

- Postgres: ~$5/mo (Hobby plan)
- Redis: ~$5/mo
- Web service: usage-based, typically ~$3–5/mo at low traffic
- Worker service: usage-based, typically ~$2–3/mo

**Total: ~$15–20/month** for the full stack.

The first $5/month is included on the free Trial plan.
