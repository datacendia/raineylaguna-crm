# raineylaguna-crm — Roadmap to 100%

> **Constraint:** no new paid services. Only time and effort. Items
> requiring a new subscription, paid plugin, or paid API tier are
> excluded. Items that use *existing* paid services (Resend, Cloudflare,
> Twilio, Claude, Postgres on Railway) and stay within their envelope
> are included.
>
> **Status as of 2026-05-10:** ~70% complete. Pipeline + outreach +
> AI-drafted email generation wired. Customer-facing surfaces, draft
> review UI, and cross-system sync are the remaining gaps.

---

## CRITICAL — blocking 100%

### 1. AI draft review queue UI
- **Why:** AI-generated outreach drafts are persisted in
  `outreach_drafts` (or equivalent) but there's no UI to review,
  edit, and send. They accumulate unused.
- **How:** `/dashboard/drafts` page listing pending drafts with an
  inline editor. Send button calls the existing outreach send route.
- **Effort:** 1 day.

### 2. Lead bulk-import UI
- **Why:** `/api/leads/bulk` has 7 tests and a working endpoint but
  no form. Adding 30 leads at once requires SQL.
- **How:** `/dashboard/leads/import` with a CSV drop zone, a preview
  table that shows parse errors row-by-row, and a confirm button that
  POSTs to the existing endpoint.
- **Effort:** 4 hours.

### 3. Sereno customer cross-reference
- **Why:** The single most important business question — *"of the
  audits we ran last month, who became a Sereno customer?"* —
  currently requires manually joining two databases.
- **How:**
  - Daily cron that pulls vigia's `customers.email` list (via a
    read-only API endpoint on vigia, gated by a shared secret).
  - Sets `crm_leads.sereno_customer = true` when emails match.
  - Pipeline view shows a badge for converted leads.
  - Both repos need a small surface; coordinate the API contract.
- **Effort:** 3 hours on each side, 6 hours total.

### 4. `/dashboard/morning` operator brief
- **Why:** Monday-morning operator picture currently requires clicking
  through Pipeline → Outreach → Leads. Should be a single page.
- **How:** Server component that runs four queries:
  - leads needing follow-up (next_action_at <= today)
  - audits booked this week
  - pipeline stage changes since Friday
  - new leads since Friday
  Renders as a vertical brief. Mirror the Sereno brief layout.
- **Effort:** 1 day.

### 5. Two-factor authentication on `/login`
- **Why:** `bcryptjs` is good but no TOTP. A leaked password is a
  full compromise. Adding TOTP eliminates the most common attack.
- **How:** `otplib` + a `crm_users.totp_secret` column. Setup flow at
  `/dashboard/security` with a QR code. Login flow adds a 6-digit
  field after password.
- **Effort:** 4 hours.

### 6. Session timeout
- **Why:** Sessions never expire. A stolen laptop is a permanent
  compromise.
- **How:** Set `crm_sessions.expires_at` to 30 days rolling, 7 days
  idle. Middleware checks on every request, slides the rolling window
  on activity.
- **Effort:** 2 hours.

### 7. `/login` rate limit
- **Why:** No per-IP rate limit means brute-force is theoretically
  feasible.
- **How:** Use a small in-memory + Postgres-backed rate limiter (no
  Redis required); 5 attempts / 15 min / IP, with a longer back-off
  on repeated failures.
- **Effort:** 1 hour.

### 8. `/api/health` deep check
- **Why:** Same as the vigia roadmap. Default Railway liveness is
  HTTP 200; real health checks Postgres + Twilio + Resend.
- **How:** `GET /api/health` returns JSON `{ db, twilio, resend, ok }`.
- **Effort:** 2 hours.

**Total critical: ~4 days.**

---

## POLISH — non-blocking

### 9. Mobile-friendly pipeline view
- **Why:** `/dashboard/pipeline` is desktop-only. A horizontal
  kanban-style table breaks on phones.
- **How:** On `<md`, collapse columns into a vertical accordion.
- **Effort:** 3 hours.

### 10. Priority-score formula tuning
- **Why:** `priority-score.test.ts` covers a stub. The weights are
  guesses until real conversion data informs them.
- **How:** Once 30+ leads have converted, run a regression to
  re-weight. For now, document the current weights in
  `src/lib/priority-score.ts` so they're easy to revisit.
- **Effort:** ~ongoing; 1 hour to document.

### 11. Email-forwarding inbound (lead from email)
- **Why:** Replies to outreach end up in your personal inbox, not the
  CRM. Forward-to-CRM is the standard pattern.
- **How:** Cloudflare Email Routing (free) → Email Worker → POST to
  `/api/leads/from-email` → parse and attach to existing lead by
  email match. No paid Mailgun / SendGrid needed.
- **Effort:** 1 day.

### 12. Outreach send-time hygiene
- **Why:** Sending an outreach email at 23:47 looks desperate. Should
  queue overnight sends for 09:00 Lima.
- **How:** New `outreach_queue` table; cron checks every 5 min,
  releases queued messages between 09:00–18:00 Lima time.
- **Effort:** 4 hours.

### 13. Lead source attribution
- **Why:** "Where did this lead come from?" answered ad hoc.
- **How:** `crm_leads.source` enum (`audit`, `whatsapp`, `referral`,
  `cold`, `event`, `other`); set automatically on creation from the
  ingestion path.
- **Effort:** 2 hours.

### 14. Sentry / Cloudflare-logs error tracking
- **Why:** Same as vigia roadmap item P.
- **How:** Wrap each `route.ts` `try/catch`.
- **Effort:** 3 hours.

### 15. Soft-delete leads
- **Why:** Hard delete loses history; soft delete via
  `deleted_at` lets us recover and audit.
- **How:** `crm_leads.deleted_at` column; all queries filter `WHERE
  deleted_at IS NULL`.
- **Effort:** 2 hours.

### 16. CSV export of pipeline
- **Why:** Mid-quarter operator review reads better in a spreadsheet.
- **How:** `/dashboard/pipeline/export.csv` server route, streams a
  filtered query.
- **Effort:** 2 hours.

---

## STRATEGIC — meaningful position shifts

### 17. Bidirectional CRM ↔ Sereno sync
- **Why:** When a Sereno customer's brief shows their key competitor
  opening a new location, the CRM should create a flagged note.
  Operator-aware account management — nobody automates this in
  LATAM SaaS today.
- **How:** vigia emits `customer.competitive_event` webhook; CRM
  ingests at `/api/webhooks/sereno`; creates a `notes` row on the
  matching lead; surfaces in the morning brief.
- **Effort:** 2 days, split between both repos.

### 18. WhatsApp Business outreach via existing Twilio
- **Why:** Email outreach has 12% open rate; WhatsApp first-message
  open rate in Peru is 90%+.
- **How:** Reuse the Twilio account already wired in vigia. CRM
  outreach send-route picks `email` or `whatsapp` channel based on
  lead's preferred channel. Twilio template approval required for
  cold WhatsApp messages.
- **Effort:** 1 day to wire + Twilio approval calendar time.

### 19. Public read-only pipeline view per client
- **Why:** Some clients want to see "their" pipeline — e.g. a
  hospitality group with 4 venues, each ranked. A shareable
  read-only URL with a token.
- **How:** `crm_share_tokens` table; `/share/<token>` route renders
  a filtered pipeline view; rotateable token.
- **Effort:** 1 day.

### 20. Automated follow-up sequencing
- **Why:** Manual follow-up reminders get dropped. A "if no reply
  in 5 days, queue draft-2" rule eliminates the chase.
- **How:** `outreach_sequences` table with steps + delays; cron
  generates the next draft for the AI queue when prior step's
  `replied_at` is null past the delay.
- **Effort:** 2 days.

---

## STRETCH

### 21. iCal feed for booked audits
- **Why:** Booked audits should appear in your calendar without
  manual entry.
- **How:** `/dashboard/calendar.ics` route returning a filtered ICS
  feed. Free, standards-based.
- **Effort:** 3 hours.

### 22. Slack-style command palette
- **Why:** Power-user keyboard navigation. `Cmd+K` to search leads,
  jump to drafts, open morning brief.
- **How:** `cmdk` library, free. Index in-memory at page load.
- **Effort:** 4 hours.

### 23. Lead snoozing
- **Why:** Manual "remind me in two weeks" workflow.
- **How:** `crm_leads.snoozed_until` column; pipeline view hides
  snoozed leads by default.
- **Effort:** 2 hours.

### 24. Activity heatmap
- **Why:** "Which days am I most productive?" answered automatically.
- **How:** Render the `crm_events` table as a GitHub-style
  contribution graph on the operator dashboard.
- **Effort:** 4 hours.

### 25. CI Lighthouse audit
- **Same as vigia.** 3 hours.

### 26. CHANGELOG.md from conventional commits
- **Same as vigia.** 2 hours.

### 27. Pre-commit hooks
- **Same as vigia.** 1 hour.

### 28. SECURITY.md
- **Same as vigia.** 30 min.

---

## PAID SERVICES — what's genuinely required

> Test for inclusion here: *can this item ship at production quality
> without the spend?* The CRM is staff-internal, so the surface area
> for required spend is much smaller than Sereno.

### Required for production (non-negotiable)

- **Railway production tier (~US$ 5 – 20 / month).** Same shared
  Railway account as vigia; the CRM's Postgres + Next app sits on
  it. No new spend if vigia is already on a paid plan; the resource
  envelope absorbs it.

- **Shared services already paid via vigia:**
  - **Twilio** for any WhatsApp outreach (STRATEGIC item 18). Same
    account, per-message fees apply at the same rates documented in
    `../vigia/ROADMAP.md`. Cold WhatsApp messages must use a Meta-
    approved marketing template; otherwise Twilio rejects the send.
  - **Resend** for email outreach. Same free / paid envelope as
    vigia. CRM volume is typically lower than Sereno's (one
    outreach per lead, not weekly briefs), so doesn't materially
    move the bill.
  - **Anthropic Claude API** for AI draft generation (existing
    `outreach_drafts` queue) and for `priority-score` tuning. Same
    per-token cost as vigia; typical monthly draws are a few
    dollars at the current lead volume.

**Floor cost:** **US$ 0 / month new spend** (all shared with vigia).

### Strongly recommended

- **A second WhatsApp Business sender for outreach (US$ 1 / mo).**
  Mixing transactional Sereno briefs and cold CRM outreach on the
  same Twilio sender risks Meta-side quality-rating penalties. A
  second Twilio phone number isolates the risk.

- **Lead enrichment service.** Optional at any scale. Tools like
  Hunter.io (free 25 lookups / mo, US$ 49 / mo for 500) or
  Apollo.io find emails for leads where you only have a domain.
  **Not required** if you only chase leads who already gave you
  their email via the audit form or contact form. Add only if you
  start outbound prospecting from cold lists.

### Wouldn't pay for

- **HubSpot / Pipedrive / Salesforce.** This CRM exists for the
  exact reason you would otherwise pay them.
- **Calendly Pro.** Cal.com free tier handles the booked-audit
  iCal feed (STRETCH item 21).
- **Sentry paid tier.** Free tier (5K events / mo) is plenty for
  staff-only traffic.

---

## EXPLICITLY NOT DOING

- **Public sign-ups.** This CRM is staff-only by design.
- **Multi-tenant architecture.** Single tenant; do not over-engineer.
- **Native mobile app.** PWA / mobile web is sufficient.
- **Salesforce / HubSpot integrations.** This *is* the CRM; no need
  to mirror to another.

---

## SUMMARY

| Category | Items | Total effort |
|---|---|---|
| Critical | 8 | ~4 days |
| Polish | 8 | ~2 days |
| Strategic | 4 | ~6 days |
| Stretch | 8 | ~1.5 days |

**Recommended ship order:**

1. Critical 5, 6, 7 (auth hardening, half a day total).
2. Critical 1, 2 (drafts UI + bulk import — unblock outreach).
3. Critical 3 + 4 (Sereno cross-ref + morning brief — operator unlock).
4. Critical 8 (health check, in parallel).
5. Polish 11 (email forwarding) — biggest hidden lever.
6. Strategic 17 (CRM ↔ Sereno sync) — paired with vigia.
7. Strategic 18 (WhatsApp outreach) — paired with vigia Twilio.
