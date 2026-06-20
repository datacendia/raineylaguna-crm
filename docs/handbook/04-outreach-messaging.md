# Chapter 04 — Outreach & Messaging

**Who this is for:** The operator who sends the first message to a new business, and the founder who wants to know exactly what the AI writes and why. No technical knowledge needed.

**What you'll do:** Understand the four ways we reach a business (the "channels"), let the AI write a first-message draft for you, read and edit that draft, send it, and — when it helps a sales conversation — generate a one-page "pitch demo" website to show off. You'll also learn the simple rules for what makes a good message and what to never do.

Throughout this chapter, "lead" just means a business we might want to work with. A "draft" is a message the AI has written that is waiting for you to check before it goes out.

---

## The big picture

When we reach out to a business for the first time, the goal is **a reply — not a sale.** We want the owner to write back. Everything below is built around that one goal.

There are two halves to outreach:

1. **The message** — a short, first cold message. The AI writes a draft for you. You read it, maybe tweak it, then send (or send by hand).
2. **The pitch demo** (optional) — a one-page sample website the AI builds for a specific business, so you have something impressive to show once a conversation gets going.

---

## The four channels

A "channel" is simply the way a message reaches a business. We use four, and they fall into two groups.

| Channel | Group | How it's sent | Where it's used |
|---|---|---|---|
| **WhatsApp** | Automated | The system sends it for you | **Peru only** (see the rule below) |
| **Email** | Automated | The system sends it for you | Everywhere |
| **Instagram DM** | Manual | **You send it by hand** | Anywhere |
| **LinkedIn** | Manual | **You send it by hand** | Anywhere |

**Automated channels (WhatsApp, Email)** mean the system has a real connection that delivers the message — WhatsApp goes out through a service called Twilio, Email goes out through a service called Resend. You press a button, it delivers.

**Manual channels (Instagram DM, LinkedIn)** mean there is **no safe, allowed way for software to send these for us.** So the system prepares and keeps a record of the message, but **you copy it and send it yourself** in Instagram or LinkedIn, then mark it as sent. The system will never pretend it delivered an Instagram or LinkedIn message — it always tells you it's your turn.

> ⚠️ If something looks wrong: If you expected a WhatsApp or Email to send but it stayed as "Pending" with a reason next to it, that's the system protecting you, not a bug. The most common reasons are explained in the table further down. See also [Troubleshooting](06-troubleshooting.md).

### The WhatsApp "Peru only" rule

Right now, **automated WhatsApp is only allowed for businesses in Peru.** This is on purpose, and it matters:

- Sending cold automated WhatsApp or text messages to numbers we scraped is **against the law** in the US (heavy fines, per message) and the UK/EU, and it breaks the rules of the services we use.
- Until we have a proper "they agreed to be contacted" path in each country, the system **blocks** automated WhatsApp everywhere except Peru.
- If you try to send WhatsApp to a non-Peru business, it will stay **Pending** with a reason like `whatsapp_gated`. That is correct and expected. Use Email instead, or send a manual Instagram/LinkedIn message.

Email and the manual channels are not affected by this rule.

---

## How the AI writes a draft (the "v3" message)

The system has a single, carefully written instruction sheet (we call it the **v3 prompt**) that tells the AI exactly how to write a first message. Knowing the rules helps you trust the draft and spot anything off.

> 📷 Screenshot: a generated draft on a lead's page, showing the channel label and the message body

Here is what the AI is told to do, in plain English:

### It picks the language and channel for you, based on the business's market

You do **not** choose these — they follow the business automatically:

- **Channel:** WhatsApp if the business is in a market where automated WhatsApp is allowed (Peru today), otherwise Email.
- **Language:** **Spanish** for Peru and Latin America, **English** for the US and UK.

This keeps every draft lined up with the rules above, so a draft never gets written in the wrong language or for a blocked channel.

### It always opens with evidence about *their* business

The very first sentence is **one true observation about the business itself** — usually a real problem found in their website audit (for example, "no own website" or "the site doesn't work on phones"). The AI is told to **never** open with "Hi, we're Rainey Laguna." We earn the reply by showing we actually looked at them first.

### One finding, one stake, one question

A good message is short and focused:

1. **Hook** — one real finding about them.
2. **Stake** — one sentence on why that finding matters to them.
3. **Intro** — one short line saying who we are ("a small web studio in Lima; we do a few things, well").
4. **Call to action** — one easy next step (usually "I can send you a 90-second video showing two changes") **plus an explicit question** that makes saying "yes" easy, like "Want me to send it over?". The question is required — we ask for the next step, we don't just announce it.
5. **Opt-out** — a polite "if this isn't for you, just say so and I won't write again."
6. **Sign-off** — "— Equipo Rainey Laguna" (Spanish) or "— The Rainey Laguna team" (English).

### The hard "no inventing facts" rule

This is the most important rule, and it's worth repeating because it protects our reputation:

> **Every fact in the message must come from real data about the business.** The AI is forbidden from inventing or guessing numbers, percentages, rankings, "you're one of the best in the district," "lots of businesses already do this," or claiming we already built something for them.

If the AI doesn't have a strong finding, it's told to **say less** rather than make something up. When you review a draft, this is the main thing to check (see the DO's and DON'Ts below).

### Format by channel

- **WhatsApp:** exactly two short paragraphs, about 90 words max. No subject line.
- **Email:** the first line is the subject (starting with "Asunto:" in Spanish or "Subject:" in English), then a blank line, then the body (about 120 words max).

---

## How to review, edit, and send a draft

This is your day-to-day job. The steps:

1. Open the **Leads** area from the left menu.
2. Click the business name to open its detail page.
3. Find the **outreach draft** for that lead. If there's no draft yet, use the button to **generate** one (the AI writes it in a few seconds).
4. **Read the whole draft slowly.** Check it against the DO's and DON'Ts below — especially that every claim is true and nothing is invented.
5. **Edit anything that's off.** You can fix wording, soften a line, or correct a fact. You are the final check; trust your judgment over the AI.
6. **Send it:**
   - If the channel is **WhatsApp or Email** (automated), press the **Send** button. The system delivers it and updates the status.
   - If the channel is **Instagram DM or LinkedIn** (manual), the system will tell you it's a manual channel. **Copy the message, open Instagram or LinkedIn yourself, paste and send it,** then come back and **mark it as sent** so our records stay accurate.

> 📷 Screenshot: the Send button on an automated draft, and the "manual channel — mark as sent" state on an Instagram/LinkedIn draft

### What the statuses mean

After you press Send, a draft lands in one of these states:

| Status | What it means | What you do |
|---|---|---|
| **Sent** | The provider accepted and delivered it (WhatsApp/Email). | Nothing — done. |
| **Pending** | It couldn't send right now and will be retried. There's a short reason. | Read the reason (below). Fix it if you can, then retry. |
| **Manual** | This is an Instagram/LinkedIn message — it's your turn. | Send it by hand, then mark it sent. |

Common **Pending** reasons, in plain English:

| Reason you might see | What it really means |
|---|---|
| `whatsapp_gated` | WhatsApp isn't allowed for this market yet (not Peru). Use Email or a manual channel. |
| `lead_phone_missing` | We don't have a phone number for this business. |
| `lead_email_missing` | We don't have an email for this business. |
| `email_gated` | In the UK/EU we only auto-email proper business addresses; a personal address (like Gmail) is held for you to review by hand. |
| `twilio_not_configured` / `resend_not_configured` | The sending service isn't set up. This is a setup issue, not your fault — flag it. |

> ⚠️ If something looks wrong: "Pending" is almost always the system being careful, not broken. If you can fix the cause (e.g., add a missing email), do that and retry. If the reason mentions "not configured," that's a setup task — see [Troubleshooting](06-troubleshooting.md).

---

## The on-demand "pitch demo" generator

Separate from the first message, there's a tool that builds a **one-page sample website** tailored to a specific business — something visual you can show during a sales conversation to make the idea real.

**What it produces:**

- A single, self-contained web page (a mockup) styled in our brand colors, built around what we'd actually sell that business — for example a **catalog/menu page**, a **landing page**, a **client portal**, a **portfolio**, a **brand board**, or a full **homepage**. The AI picks the right shape from the business's "potential" (the opportunity noted on the lead).
- It uses the business's **real name, district, and niche**, with example products or sections that fit their type of business.
- At the bottom there's a small **internal brief panel** ("Rainey Laguna · Brief interno") — a note just for us, listing what the build would need and one or two tasteful ideas. It's styled to look like an internal annotation, not part of the public mockup.

**Important things to know:**

- **It's on-demand only.** A pitch demo costs much more to generate than a text message, so it only runs when you **click the button** for it. It never runs automatically in the background.
- **Same honesty rules apply.** The demo can include sample menu items or prices clearly marked as examples, but the AI is **forbidden from inventing real contact details, real statistics, review counts, or named testimonials.**

How to use it: open the lead, click the **pitch demo / generate demo** button, wait a few seconds, then open the result to preview it before showing or sending it to the business.

> 📷 Screenshot: the pitch-demo button on a lead, and the resulting one-page mockup preview

---

## Message DO's and DON'Ts

These are the rules the AI follows — and the rules you should hold every message to before it goes out.

**DO:**

- Open with one true observation about **their** business.
- Keep it to **one finding + one stake** — don't pile on three problems.
- Include the short who-we-are line **after** the hook.
- End with one easy step **and an explicit question** ("Want me to send it over?").
- Keep the polite opt-out line.
- Use the business's real name and, if we have it, their real Instagram handle.
- Match the language: Spanish (Peruvian, friendly "tú") for Peru/LatAm; English for US/UK.

**DON'T:**

- Don't invent numbers, percentages, rankings, or "you're the best in the district."
- Don't claim we already built or audited something we haven't.
- Don't open with "Hi, we're Rainey Laguna."
- Don't use emojis, exclamation-mark openers, or filler like "I hope this finds you well."
- Don't stack multiple findings or write a wall of text.
- Don't use Argentine/voseo Spanish ("vos", "tenés", "querés") — always neutral Peruvian "tú".

### A good Spanish example (WhatsApp, Peru)

> Hola, equipo de Sazón Criolla. Vi que reciben pedidos por DM y que no tienen una carta propia en línea; cada pedido pasa por un ida y vuelta manual de mensajes.
>
> Somos Rainey Laguna, un estudio de web en Lima; hacemos pocas cosas, bien. Te puedo pasar un video de 90 segundos con dos cambios concretos para que el cliente pida solo. ¿Te lo paso? Si no es para ti, sin problema: avísame y no te escribo más.
> — Equipo Rainey Laguna

Why it's good: opens with a real finding about *them*, one stake (manual back-and-forth), one short intro, a concrete step plus a clear question, the opt-out, the right sign-off — and zero invented numbers.

### A good English example (Email, US)

> Subject: A note on your booking flow
>
> Hi Riverside Dental team. I noticed your site doesn't let patients book an appointment online — every request still goes through a phone call.
>
> We're Rainey Laguna, a small web studio in Lima; we do a few things, well. I can send a 90-second video showing two specific changes that would let patients book themselves. Want me to send it over? If it's not for you, no problem — just say so and I won't write again.
> — The Rainey Laguna team

Why it's good: short subject, evidence-first opener about *their* business, one stake, one intro line, a concrete step with an explicit question, the opt-out, the right sign-off.

---

## A note on the old templates (legacy)

You may hear about older "script templates" — fixed, fill-in-the-blank messages for specific niches (gastronomy, legal, automotive, beauty, fitness). **These are legacy.** They came before the AI v3 drafts and are kept only for reference. For new outreach, **use the AI draft.** It's bilingual, evidence-first, follows the no-inventing rule, and is the version we keep improving.

---

## Related chapters

- [Leads, Pipeline & Cities](03-leads-and-pipeline.md) — finding businesses, audits, and the "potential" that drives both drafts and pitch demos.
- [Troubleshooting](06-troubleshooting.md) — what to do when a send stays Pending or a service isn't configured.
