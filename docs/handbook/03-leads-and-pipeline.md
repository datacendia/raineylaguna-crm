# 03 — Leads, Pipeline, Discovery & Cities

**Who this is for:** the operator.
**What you'll do:** understand the Leads list and Pipeline, how leads are scored
and sourced, and how new leads are found.

---

## Pipeline stages

Every lead has a **stage** that says where it is on the journey:

| Stage | Meaning |
|-------|---------|
| **Lead** | In the system, not yet contacted. |
| **Contacted** | First message sent. |
| **Audited** | We've shared a digital audit / shown what we'd fix. |
| **Proposal** | A concrete offer is out. |
| **Closed** | Won, or set aside. |

You move a lead's stage forward as the conversation progresses. The **Pipeline**
page shows everyone grouped by stage.

## Potential & priority

Each lead has a **Potential** (e.g. High / Medium) and a behind-the-scenes
**priority score**. These help you decide who to contact first. The score takes
into account things like the district's affordability tier and the lead's digital
health. **Sort by potential** to spend your time on the most promising businesses.

## Sources

Every lead is tagged with where it came from. The CRM tidies the many raw labels
into a few clean **source buckets** so you can filter:

`audit` · `whatsapp` · `contact-form` · `proto` (60-second site) · `discovery`
(found automatically) · `import` · `referral` · `event` · `other`

Use the **Source filter** on the Leads page to focus — e.g. `audit` and
`contact-form` leads are warmer because they came to us.

## Tags, snooze & next action

- **Tags** — free labels you add to group leads your own way.
- **Snooze** — hide a lead until a future date (e.g. "not now, check back in March").
- **Next action** — a short note of the very next thing to do (e.g. "send proposal
  Friday"). Always set one when you touch a lead so nothing slips.

## No duplicates

When a lead comes in with an email or phone we already have, the CRM **merges** it
into the existing record (adding a dated note) instead of creating a duplicate.
You don't have to dedupe by hand.

## Import & export

- **Import** — bring in a list of businesses from a CSV file.
- **Export** — download your leads (e.g. for a backup or a report).

## Discovery — finding new leads automatically

The CRM can go and find businesses for you, in two ways:

| Method | Cost | Notes |
|--------|------|-------|
| **OpenStreetMap (free)** | **Free** | No API bill. The default for adding volume. |
| **Google Places** | Paid (per request) | Richer data, but it costs money each run. |

Both add businesses as `discovery` leads and skip anyone already in the system.
Running discovery is usually a founder task (see [07 — Configuration](07-configuration.md)).

## Cities & markets

The CRM is **multi-city**. Each lead belongs to a **city** (Lima, Boston, Glasgow,
Los Angeles, …). The city matters because it decides:

- the **language** we write outreach in (Spanish for Peru/Latin America, English for
  the US/UK), and
- which **channels** we're allowed to use (see [05 — Compliance & Safety](05-compliance-safety.md)).

Use the **City filter** on the Leads page to work one market at a time.

## Related chapters

- [02 — Daily Workflow](02-daily-workflow.md) · [04 — Outreach & Messaging](04-outreach-messaging.md) · [05 — Compliance & Safety](05-compliance-safety.md)
