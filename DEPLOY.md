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
| `CRM_PASSWORD_HASH` | bcrypt hash from `npm run hash -- "your-password"` |
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

---

## 5. Verify

- Open `https://crm.raineylaguna.com/login` (or the `*.up.railway.app` URL).
- Log in with the password whose hash you stored in `CRM_PASSWORD_HASH`.
- Navigate to **Batch Outreach** and schedule a small test batch (e.g. 3 leads).
- The Worker logs in Railway should show events being marked Sent at the scheduled times.

---

## Cost estimate

- Postgres: ~$5/mo (Hobby plan)
- Redis: ~$5/mo
- Web service: usage-based, typically ~$3–5/mo at low traffic
- Worker service: usage-based, typically ~$2–3/mo

**Total: ~$15–20/month** for the full stack.

The first $5/month is included on the free Trial plan.
