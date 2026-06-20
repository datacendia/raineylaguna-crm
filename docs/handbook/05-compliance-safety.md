# Chapter 05 — Compliance & Safety (SOP)

**Who this is for:** Operators who send outreach, and the founder. This is the safety rulebook for who we are allowed to contact, on which channel, and how.

**What you'll do:** Learn the simple rules the CRM already enforces for you, understand the country-by-channel limits, and follow a short cheat-sheet so you never send something that gets us blocked, fined, or banned.

> ⚠️ **This is operational guidance, not legal advice.** It explains how we work day to day and why the system blocks certain sends. It is not a legal opinion. If a real legal question comes up — a complaint, a cease-and-desist, a regulator letter — stop and escalate to the founder before replying. See [Troubleshooting](06-troubleshooting.md).

---

## The one big idea

We do **cold outreach** — we contact businesses that have not asked to hear from us. Different countries have very different rules about that, and the platforms we use (WhatsApp, Twilio, email) have their own rules on top. So the safe channel changes depending on **which country the lead is in**.

The CRM knows each lead's **city**, and the city tells us the **country** (this lives in the market registry — `src/lib/markets.ts`). The system uses that to **automatically block** the riskiest sends before they ever go out. You do not have to memorise the law. You do need to understand what the blocks mean and never try to work around them.

The four channels we use:

- **Cold CALL** — a phone call you make by hand. Always a human decision; the CRM never auto-dials.
- **TEXT** — SMS or WhatsApp messages. The CRM can send WhatsApp automatically, but **only for Peru**.
- **EMAIL** — sent automatically through our email provider (Resend), with rules about which addresses are allowed.
- **SOCIAL DM** — Instagram or LinkedIn direct messages. The CRM **never** sends these. You send them by hand.

---

## Country-by-channel matrix

This table shows, for each market, whether each channel is OK for cold outreach and the one-line reason. "OK" means generally acceptable when done properly (business target, polite message, easy opt-out). "Manual only" means a human must send it personally — no automation.

| Market (city) | Country | Cold CALL | TEXT (SMS + WhatsApp) | EMAIL | SOCIAL DM |
|---|---|---|---|---|---|
| **Lima** | Peru | OK (human) | **OK — WhatsApp automated** | OK (any address, with opt-out) | Manual only |
| **Boston** | USA | OK (human, mind do-not-call) | **Avoid** — US TCPA: heavy fines per text | OK (any address, with opt-out — CAN-SPAM) | Manual only |
| **Los Angeles** | USA | OK (human, mind do-not-call) | **Avoid** — US TCPA: heavy fines per text | OK (any address, with opt-out — CAN-SPAM) | Manual only |
| **Glasgow** | UK | OK (human) | **Avoid** — UK PECR/GDPR: consent-first | **Business-domain addresses only** | Manual only |
| Mexico | Mexico (candidate) | OK (human) | Manual/personal only | OK (any address, with opt-out) | Manual only |
| Colombia | Colombia (candidate) | OK (human) | Manual/personal only | OK (any address, with opt-out) | Manual only |
| Argentina | Argentina (candidate) | OK (human) | Manual/personal only | OK (any address, with opt-out) | Manual only |
| Panama | Panama (candidate) | OK (human) | Manual/personal only | OK (any address, with opt-out) | Manual only |
| Ecuador | Ecuador (candidate) | OK (human) | Manual/personal only | OK (any address, with opt-out) | Manual only |

Notes that apply to the whole table:

- **TEXT, everywhere:** even where texting is lighter on the law, **WhatsApp's own business policy and Twilio's acceptable-use rules still apply**. They require the contact to have opted in. That is why the CRM only sends automated WhatsApp to **Peru** today, where our consent path exists. The LatAm candidate markets are listed as "Manual/personal only" for text because we have **not** turned on automated texting there yet — if you ever text those leads, it must be a personal, one-off, human message, not a blast.
- **US (Boston, LA):** the law that bites is **TCPA**. It allows fines of roughly **$500 to $1,500 for every single text** sent without consent. Calls are allowed but you must respect do-not-call requests. Email is fine under **CAN-SPAM** as long as every message has a clear way to opt out.
- **UK (Glasgow):** **PECR/GDPR** is consent-first. We only email **business-domain** addresses (e.g. `name@theirshop.co.uk`), never personal free addresses (Gmail, Hotmail, etc.), because a sole trader's personal address counts as an individual who needs to have opted in.
- **LatAm (Peru + candidates):** enforcement is lighter, so email to any address is fine **as long as there is an opt-out**. That does not mean "anything goes" — be respectful and stop when asked.

> ⚠️ **If a market isn't in this table:** the CRM treats unknown cities as the *strictest* option and blocks automated WhatsApp and personal-address email. That is on purpose (it "fails closed"). Do not invent a city name to get around it — talk to the founder about adding the market properly.

---

## The plain-language rules

These are the rules the code already enforces. Knowing them helps you read the CRM's messages.

### Rule 1 — Automated WhatsApp goes to PERU ONLY

The CRM will only send an automatic WhatsApp message to a lead whose city is a **Peru** market (today that means Lima). For every other country it refuses.

When it refuses, the outreach event does **not** go out. It stays in a waiting state ("Pending") and the reason is recorded as:

```
whatsapp_gated:<city>_market_not_allowed
```

In plain English: *"I did not send this WhatsApp because that city's country is not allowed for automated WhatsApp."* This is normal and expected for any non-Peru lead. It is **not** an error you need to fix. Do not retry it as WhatsApp — use a different channel (usually email) or send a personal message by hand if appropriate.

> 📷 Screenshot: an outreach event showing a `whatsapp_gated:...` reason in the Pending state, so operators recognise it.

### Rule 2 — Automated email only to BUSINESS addresses in the UK/EU

In **consent-first** countries (the UK, and Europe generally), the CRM will only auto-send email to a **business-domain** address. A business address is one on the company's own domain — for example `info@bellashair.co.uk`.

If the address is a **free, personal** provider — Gmail, Hotmail, Outlook, Yahoo, iCloud, Proton, and similar — the CRM treats it as an individual and **holds it for manual review**. It does not auto-send. The reason recorded is:

```
email_gated:personal_address_in_<city>
```

In plain English: *"This UK/EU lead's email looks personal, not a company address, so I'm holding it instead of auto-sending."* If you still want to reach that lead, do it as a careful, personal email written by hand — not an automated blast.

In **permissive** countries — **USA, Peru, Mexico, Colombia, Argentina, Panama, Ecuador** — the CRM will auto-email **any** valid address (business or personal), as long as the message carries an opt-out. So you will **not** see `email_gated` for those markets.

### Rule 3 — Email is fine in the US and LatAm, with an opt-out

Every automated email we send must give the recipient an easy way to say "stop." This is the one rule that makes US and LatAm email safe. Never remove the opt-out line from a template. If a lead replies asking to be removed, honour it immediately and mark them so they are never contacted again.

### Rule 4 — Social DMs stay MANUAL and personal

The CRM **cannot** and **does not** send Instagram or LinkedIn messages. There is no approved way to automate them, and trying would get the accounts banned. The system marks these channels as **manual**: it can help you prepare and track the message, but **you** send it by hand from your own account, then mark it sent.

Keep social DMs short, personal, and one-to-one. Never paste the same message to dozens of people — that is what gets flagged as spam.

---

## "What can I send, where?" cheat-sheet

Quick read for the day-to-day. When in doubt, prefer **email** (US/LatAm) or a **personal channel** done by hand.

| If the lead is in… | Best automated channel | Texting | Social DM |
|---|---|---|---|
| **Peru / Lima** | WhatsApp (automated) or email | WhatsApp OK (automated) | By hand, personal |
| **USA (Boston / LA)** | Email (with opt-out) | Don't auto-text — TCPA risk | By hand, personal |
| **UK (Glasgow)** | Email — **business addresses only** | Don't auto-text — PECR | By hand, personal |
| **Mexico / Colombia / Argentina / Panama / Ecuador** | Email (with opt-out) | Personal, by hand only | By hand, personal |
| **A city you don't recognise** | Stop — ask the founder | No | No |

---

## DO-NOT list

Read this once and keep it in mind. These are the actions that cause real harm — fines, platform bans, or lost trust.

- **DO NOT** try to auto-send WhatsApp to any lead outside Peru. If you see `whatsapp_gated`, that is the system protecting you. Leave it.
- **DO NOT** auto-text (SMS or WhatsApp) leads in the USA. TCPA fines are per message and add up fast.
- **DO NOT** auto-email personal addresses (Gmail, Hotmail, etc.) in the UK or EU. If you see `email_gated`, do not force it through.
- **DO NOT** remove or break the opt-out line in any email template.
- **DO NOT** automate Instagram or LinkedIn messages, or paste the same DM to many people.
- **DO NOT** keep contacting anyone who has asked to stop — on any channel, in any country.
- **DO NOT** invent or mis-set a lead's city to get past a block. The blocks exist for a legal reason.
- **DO NOT** answer a legal complaint yourself. Escalate to the founder.

> ⚠️ **If something looks wrong:** if a send you expected to go out is stuck in Pending with a reason like `whatsapp_gated` or `email_gated`, that is the safety system working as designed, not a bug. If a send is stuck for a different reason (for example `twilio_not_configured`, `resend_not_configured`, `lead_phone_missing`, or `lead_email_missing`), that is a setup or data issue — see [Troubleshooting](06-troubleshooting.md). If you are ever unsure whether a contact is allowed, the safe answer is **don't send** and ask the founder.

---

## Related chapters

- [04 — Outreach & Messaging](04-outreach-messaging.md) — how to actually send on each channel, day to day.
- [06 — Troubleshooting](06-troubleshooting.md) — what Pending reasons mean and how to fix setup/data problems.
- [03 — Leads, Pipeline & Cities](03-leads-and-pipeline.md) — how cities map to markets and countries.
