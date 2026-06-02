/**
 * Monday digest — single-page weekly pipeline review.
 *
 * Bookmark this and visit it every Monday at 9am. It answers:
 *   - What moved last week?
 *   - Which leads are going cold?
 *   - What are my highest-leverage actions this week?
 *
 * Server-rendered. No interactivity required. Print-friendly via @media print.
 *
 * Future: an external cron (Railway cron service or GitHub Actions) can
 * curl this page with auth and email the rendered HTML to the operator.
 */
import pool from '@/lib/db'
import { loadDigest, type DigestLead } from '@/lib/digest'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DigestPage() {
  const { counts, cold, topPotential, channels, wins } = await loadDigest(pool)
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-8 max-w-5xl print:p-4">
      <header className="mb-10 print:mb-6">
        <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
          Monday digest · {today}
        </p>
        <h1 className="text-4xl font-bold mt-1">This week at Rainey Laguna</h1>
      </header>

      {/* North-star numbers */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 print:grid-cols-4">
        <Stat label="Added" value={counts.added} hint="new leads this week" />
        <Stat label="Outreach" value={counts.outreach} hint="events logged this week" />
        <Stat label="Proposals out" value={counts.proposals_out} hint="awaiting decision" />
        <Stat label="Wins" value={counts.wins} hint="closed this week" highlight />
      </section>

      {/* Outreach by channel */}
      <section className="mb-10">
        <SectionTitle>Outreach by channel</SectionTitle>
        {channels.length === 0 ? (
          <p className="text-sm text-gray-500">No outreach logged this week.</p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {channels.map((c) => (
              <div key={c.channel} className="border rounded-lg px-4 py-2 text-sm">
                <span className="font-bold">{c.n}</span>
                <span className="text-gray-600 ml-2">{c.channel}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Wins */}
      {wins.length > 0 && (
        <section className="mb-10">
          <SectionTitle>🏆 Closed this week</SectionTitle>
          <ul className="space-y-1">
            {wins.map((w) => (
              <li key={w.id} className="text-sm">
                <a href={`/dashboard/leads/${w.id}`} className="font-medium hover:underline">
                  {w.name}
                </a>
                <span className="text-gray-500"> · {w.district}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Going cold — highest priority for the week */}
      <section className="mb-10">
        <SectionTitle>🥶 Going cold (no contact in 14+ days)</SectionTitle>
        {cold.length === 0 ? (
          <p className="text-sm text-gray-500">All active leads are warm. Nice.</p>
        ) : (
          <LeadTable leads={cold} showDays />
        )}
      </section>

      {/* Top untouched leads */}
      <section className="mb-10">
        <SectionTitle>🎯 High-potential leads not yet contacted</SectionTitle>
        {topPotential.length === 0 ? (
          <p className="text-sm text-gray-500">All high-potential leads have been contacted at least once.</p>
        ) : (
          <LeadTable leads={topPotential} />
        )}
      </section>

      <footer className="mt-16 pt-6 border-t text-xs text-gray-400 print:hidden">
        <p>
          This digest queries Postgres on every load. Bookmark
          <code className="mx-1 px-1 bg-gray-100 rounded">/dashboard/digest</code>
          and visit it every Monday at 9am. Print with Ctrl+P for paper review.
        </p>
      </footer>
    </div>
  )
}

function Stat({ label, value, hint, highlight = false }: { label: string; value: number; hint: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-5 border ${highlight ? 'bg-vermilion text-white border-vermilion' : 'bg-white'}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-4xl font-bold mt-1">{value}</p>
      <p className="text-xs opacity-60 mt-1">{hint}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mb-3 print:mb-2">{children}</h2>
}

function LeadTable({ leads, showDays = false }: { leads: DigestLead[]; showDays?: boolean }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-left px-3 py-2">Name</th>
            <th className="text-left px-3 py-2">District</th>
            <th className="text-left px-3 py-2">Niche</th>
            <th className="text-left px-3 py-2">Stage</th>
            {showDays && <th className="text-left px-3 py-2">Days cold</th>}
            <th className="text-left px-3 py-2">Potential</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="px-3 py-2">
                <a href={`/dashboard/leads/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </a>
              </td>
              <td className="px-3 py-2 text-gray-600">{l.district}</td>
              <td className="px-3 py-2 text-gray-600">{l.niche}</td>
              <td className="px-3 py-2 text-gray-600">{l.pipeline_stage}</td>
              {showDays && (
                <td className="px-3 py-2 text-gray-600">
                  {l.days_since_outreach == null ? '—' : `${l.days_since_outreach}d`}
                </td>
              )}
              <td className="px-3 py-2 text-gray-600">{l.potential ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
