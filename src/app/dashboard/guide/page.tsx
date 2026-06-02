/**
 * In-app operator guide. Static, server-rendered documentation explaining
 * what the CRM does and how to use each surface. Linked from the sidebar.
 *
 * Pure content — no data fetching, no hooks. Kept in one file so it's easy to
 * edit as the product changes.
 */

export const metadata = {
  title: 'Guide · Rainey Laguna CRM',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-2xl font-bold mb-3 border-b pb-2">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-4">
      <dt className="font-semibold text-gray-900">{name}</dt>
      <dd className="text-gray-700">{children}</dd>
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="min-h-screen p-8 max-w-4xl">
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">Documentation</p>
        <h1 className="text-4xl font-bold mt-1">How to use the CRM</h1>
        <p className="text-gray-600 mt-2">
          A working guide to what this system does and how to run your day in it. Internal,
          staff-only — built to find SMBs with a weak digital presence, prioritize them, run
          outreach, and track who converts to a Sereno customer.
        </p>
      </header>

      {/* Quick links */}
      <nav className="mb-10 bg-gray-50 border rounded-lg p-4 text-sm">
        <p className="font-semibold text-gray-900 mb-2">On this page</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-vermilion">
          <li><a className="hover:underline" href="#overview">What this is</a></li>
          <li><a className="hover:underline" href="#concepts">Core concepts</a></li>
          <li><a className="hover:underline" href="#sections">The sections (sidebar)</a></li>
          <li><a className="hover:underline" href="#workflow">Working a lead, step by step</a></li>
          <li><a className="hover:underline" href="#outreach">Outreach &amp; channels</a></li>
          <li><a className="hover:underline" href="#drafts">AI drafts</a></li>
          <li><a className="hover:underline" href="#audits">Audits</a></li>
          <li><a className="hover:underline" href="#security">Security</a></li>
          <li><a className="hover:underline" href="#tips">Tips &amp; shortcuts</a></li>
        </ul>
      </nav>

      <div className="space-y-10">
        <Section id="overview" title="What this is">
          <p>
            The Rainey Laguna CRM manages our pipeline of small-business leads across Lima&rsquo;s
            districts. For each lead it can run a website audit, score how worth-pursuing it is,
            generate and send personalized outreach, track delivery and replies, and flag the
            leads that go on to become Sereno customers.
          </p>
          <p>
            Everything is staff-only and gated behind login. Outreach integrations
            (email, WhatsApp, AI drafts) degrade gracefully — if a service isn&rsquo;t configured,
            the related action is simply skipped rather than breaking the app.
          </p>
        </Section>

        <Section id="concepts" title="Core concepts">
          <dl className="space-y-3">
            <Term name="Lead">
              A prospect business: contact details, district, niche, website, social links, audit
              scores, pipeline stage, tags, and notes.
            </Term>
            <Term name="Pipeline stage">
              Where the lead sits in the funnel: <b>Lead → Contacted → Audited → Proposal → Closed</b>.
            </Term>
            <Term name="Priority score">
              A 0&ndash;100 urgency signal computed from recency, website gap, niche fit, and
              workability. Higher means more worth contacting now. Shown as a colored band
              (Crítico / Alto / Medio / Bajo) on the leads list.
            </Term>
            <Term name="Tags">
              Free-form labels you attach to a lead for grouping (e.g. &ldquo;referral&rdquo;,
              &ldquo;hot&rdquo;). Managed from the lead detail page.
            </Term>
            <Term name="Snooze">
              Hide a lead from the daily list until a chosen date — for &ldquo;remind me later&rdquo;.
              Expired snoozes resurface with a badge.
            </Term>
            <Term name="Soft-delete">
              Deleting a lead hides it from lists but keeps the record; you can restore it from the
              lead&rsquo;s page. Nothing is lost unless explicitly purged.
            </Term>
            <Term name="Sereno customer">
              A lead that converted into a Sereno customer. A daily sync matches emails and shows a
              ★ Sereno badge on the list and lead page.
            </Term>
          </dl>
        </Section>

        <Section id="sections" title="The sections (sidebar)">
          <dl className="space-y-3">
            <Term name="Dashboard">Pipeline counts at a glance — how many leads sit in each stage.</Term>
            <Term name="Monday digest">
              A weekly review: leads added, outreach sent, proposals out, wins, leads going cold
              (no contact in 14+ days), and high-potential leads not yet contacted. Also emailed
              automatically on Monday mornings.
            </Term>
            <Term name="Leads">
              The main table. Filter by district / niche / stage, search, sort by any column
              (including priority and health), tag leads, run bulk stage changes, and
              <b> export the current view to CSV</b>. Click a lead to open its detail page.
            </Term>
            <Term name="Pipeline">
              A kanban board by stage. Drag cards between columns on desktop; on mobile, swipe
              across stages and use each card&rsquo;s dropdown to move it.
            </Term>
            <Term name="Outreach">A log of outreach events with their delivery / read / reply status.</Term>
            <Term name="Draft queue">
              All AI-generated outreach drafts awaiting your review. Edit the copy inline, then
              <b> Send</b> (real delivery) or <b>Discard</b>. Nothing sends without your click.
            </Term>
            <Term name="Video Audits">Track Loom video audits sent to leads and their conversion status.</Term>
            <Term name="Batch Outreach">
              Schedule outreach to many leads at once. Sends are spread across business hours
              (09:00&ndash;18:00 Lima) so nothing goes out at 2am.
            </Term>
            <Term name="Security">Enable two-factor authentication (TOTP) for your account.</Term>
          </dl>
        </Section>

        <Section id="workflow" title="Working a lead, step by step">
          <ol className="list-decimal pl-5 space-y-2">
            <li>Open a lead from <b>Leads</b> (sort by priority to find the best targets) or <b>Pipeline</b>.</li>
            <li>
              Run an <b>audit</b>: the automated digital-health score, and/or the
              <b> Deep Audit Workbench</b> for a thorough manual review.
            </li>
            <li>
              Generate an <b>AI draft</b> on the lead page, review the wording, and send it via
              WhatsApp or Email — or send manually for Instagram / LinkedIn.
            </li>
            <li>Log the outreach (or it&rsquo;s logged for you) and move the lead&rsquo;s <b>stage</b> forward.</li>
            <li>Set a <b>next action</b> or <b>snooze</b> the lead so it resurfaces when it&rsquo;s time to follow up.</li>
          </ol>
        </Section>

        <Section id="outreach" title="Outreach & channels">
          <ul className="list-disc pl-5 space-y-2">
            <li><b>Email</b> (via Resend) and <b>WhatsApp</b> (via Twilio) send for real from inside the app.</li>
            <li>
              <b>Instagram DM</b> and <b>LinkedIn</b> are manual channels — the app records the send
              and shows you the copy to paste, since those platforms have no send API.
            </li>
            <li>Outreach is scheduled within business hours (09:00&ndash;18:00 Lima).</li>
            <li>
              <b>Delivery &amp; read</b> updates flow back automatically from Twilio; <b>email replies</b>
              are matched to the lead and appended to its notes, and the latest event is marked Replied.
            </li>
          </ul>
        </Section>

        <Section id="drafts" title="AI drafts">
          <p>
            Claude writes a personalized opener using the lead&rsquo;s details and audit findings.
            Drafts are generated on-demand from a lead page or automatically (Mon/Wed/Fri) for cold
            leads. They never send on their own — review and approve them in the <b>Draft queue</b>.
          </p>
        </Section>

        <Section id="audits" title="Audits">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Automated digital-health audit</b>: a 0&ndash;100 score from PageSpeed plus homepage
              heuristics. <i>Lower is a bigger sales opportunity</i> (a worse site = more to fix).
            </li>
            <li>
              <b>Deep Audit Workbench</b>: a manual, 8-dimension scored audit (~70 checks) per lead,
              weighted by business model. It autosaves as you work and feeds the lead&rsquo;s manual score.
            </li>
          </ul>
        </Section>

        <Section id="security" title="Security">
          <ul className="list-disc pl-5 space-y-2">
            <li>Each operator has their own account; enable <b>TOTP 2FA</b> from the Security page.</li>
            <li>Sessions last 30 days while you stay active (7-day idle cutoff) and refresh automatically.</li>
            <li>Login is rate-limited per IP to blunt password guessing.</li>
          </ul>
        </Section>

        <Section id="tips" title="Tips & shortcuts">
          <ul className="list-disc pl-5 space-y-2">
            <li>Triage with the <b>priority score</b> column — sort descending to see who to call first.</li>
            <li><b>Snooze</b> leads you&rsquo;re waiting on so the daily list stays focused.</li>
            <li>Use <b>Export CSV</b> on the leads list for offline or spreadsheet review.</li>
            <li>Deleted a lead by accident? Open it and click <b>Restore</b>.</li>
            <li>Check <code className="px-1 bg-gray-100 rounded">/api/health</code> to see which integrations are configured on this deployment.</li>
          </ul>
        </Section>
      </div>

      <footer className="mt-16 pt-6 border-t text-xs text-gray-400">
        Rainey Laguna CRM · internal operator guide
      </footer>
    </div>
  )
}
