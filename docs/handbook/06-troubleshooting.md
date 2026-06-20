# 06 — Troubleshooting Runbook

**Who this is for:** the operator first; some fixes are marked **(founder)** because
they need server/settings access.
**What you'll do:** recognise what a problem means and try the plain-language fix.

> Rule of thumb: a message stuck in **Pending** with a `*_gated` reason is the
> **safety system working on purpose** — not a bug. Other reasons usually mean a
> setting or a piece of data is missing.

---

## A message won't send

| You see… | What it means | What to do |
|----------|---------------|------------|
| `whatsapp_gated:<city>_market_not_allowed` | Automated WhatsApp is only allowed in Peru. This lead is elsewhere. | **Expected.** Don't retry as WhatsApp. Use **email**, or send a personal message by hand. See [05 — Compliance](05-compliance-safety.md). |
| `email_gated:personal_address_in_<city>` | A UK/EU lead's email is a personal one (Gmail, etc.); we only auto-email business addresses there. | **Expected.** Use the business's own-domain email, or write a personal email by hand. |
| `lead_phone_missing` | We tried to send WhatsApp but the lead has no phone number. | Add a phone number to the lead, or switch the message to email. |
| `lead_email_missing` | We tried to send email but the lead has no (valid) email. | Add a valid email, or use a different channel. |
| `twilio_not_configured` | The WhatsApp sender isn't set up. **(founder)** | Founder: set the Twilio keys (see [07 — Configuration](07-configuration.md)). |
| `resend_not_configured` | The email sender isn't set up. **(founder)** | Founder: set the Resend keys (see [07 — Configuration](07-configuration.md)). |
| `manual_channel:instagram_dm` / `manual_channel:linkedin` | These channels are never auto-sent. | Send the message by hand from your own account, then mark it sent. |

## Website leads aren't appearing in the CRM

- **Most likely:** the connection between the site and the CRM isn't switched on yet.
  Until it is, the site just logs leads instead of sending them ("log-only" mode).
- **Fix (founder):** set `CRM_PUBLIC_API` and a matching `CRM_LEAD_INTAKE_SECRET`
  on **both** the site and the CRM. See [07 — Configuration](07-configuration.md).

## The instant audit fails / says a site is "unreachable"

- The audited website may genuinely be down, very slow, or blocking our checker.
- Try again in a few minutes. If it keeps failing only for one site, note it and
  move on — it's usually the target site, not our tool.

## I can't log in / lost my 2-factor code

- **Too many attempts:** after 5 wrong tries in a minute you're paused for a minute.
  Wait, then try again.
- **Lost the authenticator / code:** this needs the founder to reset two-factor on
  your account. Don't keep guessing.
- See [01 — Getting Started](01-getting-started.md) for the normal sign-in flow.

## The Monday digest didn't arrive

- The digest emails every **Monday ~9am (Lima time)**. If it's missing:
  - Check the **Digest** page in the dashboard — the numbers are always there even
    if the email didn't go.
  - **(founder)** Confirm `DIGEST_EMAIL_TO` and the email keys are set, and that the
    Monday cron ran. See [07 — Configuration](07-configuration.md).

## Discovery found nothing

- The search area (bounding box) or business type may have returned no new results,
  or everything found is already in the system (we skip duplicates).
- **(founder)** Re-run with a different niche/city, or check the discovery settings.

## When in doubt

If a send is blocked by a `*_gated` reason, leave it — that's by design. For
anything that looks like a real error (a setting missing, data wrong, or a legal
message from someone), **stop and ask the founder** rather than working around it.

## Related chapters

- [05 — Compliance & Safety](05-compliance-safety.md) · [07 — Configuration](07-configuration.md)
