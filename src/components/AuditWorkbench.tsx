'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import './audit-workbench.css'
import {
  DIMENSIONS,
  PROFILE_OPTIONS,
  REGION_OPTIONS,
  REGION_HINTS,
  SCALE,
  BANDS,
  bandFor,
  applicable,
  dimScore,
  computeOverall,
  defaultWeights,
  type ProfileId,
  type RegionId,
  type Weights,
  type ItemState,
  type ItemRecord,
  type ManualAudit,
  type WorkbenchItem,
  type BandKey,
} from '@/lib/audit-workbench'

type Props = {
  leadId: string
  leadName: string
  websiteUrl: string | null
  auditorName: string
  initial: ManualAudit | null
}

type RuntimeItem = { state: ItemState; touched: boolean; auto: boolean; note: string }
type Items = Record<string, RuntimeItem>
type StatusFilter = 'all' | 'attention' | 'unscored'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const BAND_COLOR: Record<BandKey, string> = {
  na: 'var(--na)',
  critical: 'var(--s0)',
  weak: 'var(--s1)',
  needs: 'var(--s2)',
  solid: 'var(--s3)',
  excellent: 'var(--s4)',
}
const DOT_COLOR: Record<number, string> = { 0: 'var(--s0)', 1: 'var(--s1)', 2: 'var(--s2)', 3: 'var(--s3)', 4: 'var(--s4)' }
const SCALE_COLOR = ['var(--s0)', 'var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)']

const todayISO = () => new Date().toISOString().slice(0, 10)

function blankItems(): Items {
  const m: Items = {}
  for (const d of DIMENSIONS) for (const it of d.items) m[it.id] = { state: null, touched: false, auto: false, note: '' }
  return m
}

function initItems(initial: ManualAudit | null): Items {
  const m = blankItems()
  if (initial?.items) {
    for (const id of Object.keys(m)) {
      const rec = initial.items[id]
      if (rec) {
        const state = rec.state ?? null
        m[id] = {
          state,
          note: rec.note ?? '',
          // Honour persisted provenance; fall back to inference for legacy
          // snapshots (saved before these flags existed) so old audits still
          // load sensibly and an auto-N/A can be re-scoped when relevant again.
          touched: typeof rec.touched === 'boolean' ? rec.touched : state !== null,
          auto: typeof rec.auto === 'boolean' ? rec.auto : false,
        }
      }
    }
  }
  return m
}

/** Auto-mark out-of-scope (untouched) checks N/A; restore auto-N/A ones that became relevant again. */
function recomputeApplicability(items: Items, profile: ProfileId, presenceOnly: boolean, essentialsOnly: boolean): Items {
  let changed = false
  const next: Items = {}
  for (const d of DIMENSIONS) {
    for (const it of d.items) {
      const cur = items[it.id] ?? { state: null, touched: false, auto: false, note: '' }
      let rec = cur
      if (!cur.touched) {
        if (applicable(it, profile, presenceOnly, essentialsOnly)) {
          if (cur.state === 'na' && cur.auto) {
            rec = { ...cur, state: null, auto: false }
            changed = true
          }
        } else if (cur.state !== 'na') {
          rec = { ...cur, state: 'na', auto: true }
          changed = true
        }
      }
      next[it.id] = rec
    }
  }
  return changed ? next : items
}

function recordView(items: Items): Record<string, ItemRecord> {
  const m: Record<string, ItemRecord> = {}
  for (const id of Object.keys(items)) {
    const it = items[id]
    // Persist provenance alongside state/note so auto-N/A vs. user-set
    // survives a reload (computeOverall ignores these extra fields).
    m[id] = { state: it.state, note: it.note, touched: it.touched, auto: it.auto }
  }
  return m
}

export default function AuditWorkbench({ leadId, leadName, websiteUrl, auditorName, initial }: Props) {
  const [client, setClient] = useState(initial?.engagement.client ?? leadName ?? '')
  const [url, setUrl] = useState(initial?.engagement.url ?? websiteUrl ?? '')
  const [auditor, setAuditor] = useState(initial?.engagement.auditor ?? auditorName ?? '')
  const [date, setDate] = useState(initial?.engagement.date ?? todayISO())
  const [profile, setProfile] = useState<ProfileId>(initial?.profile ?? 'universal')
  const [region, setRegion] = useState<RegionId>(initial?.region ?? 'global')
  const [presenceOnly, setPresenceOnly] = useState(initial?.presenceOnly ?? false)
  const [essentialsOnly, setEssentialsOnly] = useState(initial?.essentialsOnly ?? false)
  const [showNA, setShowNA] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [weights, setWeights] = useState<Weights>(initial?.weights ?? defaultWeights(initial?.profile ?? 'universal'))
  const [items, setItems] = useState<Items>(() =>
    recomputeApplicability(initItems(initial), initial?.profile ?? 'universal', initial?.presenceOnly ?? false, initial?.essentialsOnly ?? false),
  )
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(DIMENSIONS.map((d) => [d.id, true])))
  const [saveState, setSaveState] = useState<SaveState>(initial ? 'saved' : 'idle')

  const view = recordView(items)
  const { overall, scored, scope } = computeOverall(view, weights)
  const band = bandFor(overall)

  const snapshot: ManualAudit = {
    version: 1,
    profile,
    region,
    presenceOnly,
    essentialsOnly,
    weights,
    engagement: { client, url, auditor, date },
    items: view,
    overall,
    scored,
    scope,
  }
  const payloadKey = JSON.stringify(snapshot)

  // Debounced autosave. Skip the first run (initial mount / load).
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/manual-audit`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audit: JSON.parse(payloadKey) }),
        })
        setSaveState(res.ok ? 'saved' : 'error')
      } catch {
        setSaveState('error')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [payloadKey, leadId])

  const setScore = (id: string, n: number) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], state: prev[id].state === n ? null : n, touched: true, auto: false } }))
  const setNA = (id: string) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], state: prev[id].state === 'na' ? null : 'na', touched: true, auto: false } }))
  const setNote = (id: string, note: string) => setItems((prev) => ({ ...prev, [id]: { ...prev[id], note } }))
  const changeProfile = (p: ProfileId) => {
    setProfile(p)
    setWeights(defaultWeights(p))
    setItems((prev) => recomputeApplicability(prev, p, presenceOnly, essentialsOnly))
  }
  const changePresence = (v: boolean) => {
    setPresenceOnly(v)
    setItems((prev) => recomputeApplicability(prev, profile, v, essentialsOnly))
  }
  const changeEssentials = (v: boolean) => {
    setEssentialsOnly(v)
    setItems((prev) => recomputeApplicability(prev, profile, presenceOnly, v))
  }
  const setWeight = (id: string, raw: string) => {
    const v = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw) || 0))
    setWeights((prev) => ({ ...prev, [id]: v } as Weights))
  }
  const reset = () => {
    if (!window.confirm('Clear all scores and evidence notes? Engagement details, business model and weights stay.')) return
    setItems(recomputeApplicability(blankItems(), profile, presenceOnly, essentialsOnly))
  }

  const rowVisible = (it: WorkbenchItem): boolean => {
    const s = items[it.id]
    if (s.state === 'na' && !showNA) return false
    if (statusFilter === 'attention') return typeof s.state === 'number' && s.state <= 2
    if (statusFilter === 'unscored') return s.state === null && applicable(it, profile, presenceOnly, essentialsOnly)
    return true
  }

  const weightSum = DIMENSIONS.reduce((a, d) => a + (Number(weights[d.id]) || 0), 0)
  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed — retry on next edit' : saveState === 'saved' ? 'Saved' : ''

  return (
    <div className="awb">
      <div className="topbar">
        <div className="wrap row">
          <div className="brand">
            <Link href={`/dashboard/leads/${leadId}`} className="wordmark no-print" style={{ textDecoration: 'none' }}>
              ← {client || 'Lead'}
            </Link>
            <span className="ttl">Website Audit Workbench</span>
          </div>
          <div className="scorebox">
            <div className="num" style={{ color: overall == null ? 'var(--ink)' : BAND_COLOR[band.key] }}>
              {overall == null ? '—' : overall}
            </div>
            <div className="meta">
              <span className="band" style={{ background: BAND_COLOR[band.key] }}>{band.label}</span>
              <span className="complete">
                <b>{scored}</b>/{scope} checks scored {saveLabel && <span className="saving no-print">· <b>{saveLabel}</b></span>}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="wrap">
        {/* ENGAGEMENT */}
        <section>
          <p className="eyebrow">01 — Engagement</p>
          <div className="panel">
            <div className="grid setup-grid">
              <div className="field"><label>Client / business</label><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Acme Co." /></div>
              <div className="field"><label>Site URL</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
              <div className="field"><label>Auditor</label><input value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="Your name" /></div>
              <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="field">
                <label>Business model — sets weighting &amp; relevant checks</label>
                <select value={profile} onChange={(e) => changeProfile(e.target.value as ProfileId)}>
                  {PROFILE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Primary market — tunes the legal / privacy reminders</label>
                <select value={region} onChange={(e) => setRegion(e.target.value as RegionId)}>
                  {REGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="hint"><b>{REGION_HINTS[region].title}</b> {REGION_HINTS[region].body}</div>
            </div>
          </div>
        </section>

        {/* WEIGHTS */}
        <section>
          <p className="eyebrow">
            02 — Weighting <span style={{ fontFamily: 'var(--body)', textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>· auto-set by business model, fully editable</span>
          </p>
          <div className="panel">
            <div className="grid weights-grid">
              {DIMENSIONS.map((d) => (
                <div className="wcell" key={d.id}>
                  <label title={d.name}>{d.name}</label>
                  <div className="winput">
                    <input type="number" min={0} max={100} value={weights[d.id]} onChange={(e) => setWeight(d.id, e.target.value)} />
                    <span className="pct">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={`wsum${weightSum !== 100 ? ' off' : ''}`}>
              Total weight: <b>{weightSum}</b>%{weightSum !== 100 ? ' — scores are normalised, but ~100 keeps it intuitive' : ''}
            </div>
          </div>
        </section>

        {/* CONTROLS */}
        <div className="controls no-print">
          <span className="ctrl-label">Depth</span>
          <div className="seg">
            <button className={!essentialsOnly ? 'on' : ''} onClick={() => changeEssentials(false)}>Full audit</button>
            <button className={essentialsOnly ? 'on' : ''} onClick={() => changeEssentials(true)}>Essentials only</button>
          </div>
          <span className="ctrl-label">Site</span>
          <div className="seg">
            <button className={!presenceOnly ? 'on' : ''} onClick={() => changePresence(false)}>Live website</button>
            <button className={presenceOnly ? 'on' : ''} onClick={() => changePresence(true)}>Presence only</button>
          </div>
          <div className="spacer" />
          <select className="filtersel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All checks</option>
            <option value="attention">Needs attention (0–2)</option>
            <option value="unscored">Unscored</option>
          </select>
          <button className="btn" onClick={() => setShowNA((v) => !v)}>{showNA ? 'Hide N/A' : 'Show N/A'}</button>
          <button className="btn" onClick={() => setOpen(Object.fromEntries(DIMENSIONS.map((d) => [d.id, true])))}>Expand</button>
          <button className="btn" onClick={() => setOpen(Object.fromEntries(DIMENSIONS.map((d) => [d.id, false])))}>Collapse</button>
          <button className="btn" onClick={reset}>Reset</button>
          <button className="btn solid" onClick={() => window.print()}>Save / Print PDF</button>
        </div>

        {/* DIMENSIONS */}
        <section>
          {DIMENSIONS.map((d, i) => {
            const sc = dimScore(d, view)
            const dBand = bandFor(sc)
            const scoped = d.items.filter((it) => items[it.id].state !== 'na')
            const dScored = scoped.filter((it) => typeof items[it.id].state === 'number')
            const naHidden = d.items.filter((it) => items[it.id].state === 'na' && !showNA).length
            const isOpen = open[d.id] !== false
            return (
              <div className={`dim${isOpen ? '' : ' collapsed'}`} key={d.id}>
                <div className="dim-head" onClick={() => setOpen((o) => ({ ...o, [d.id]: !(o[d.id] !== false) }))}>
                  <span className="dim-no">{String(i + 1).padStart(2, '0')}</span>
                  <span className="dim-name">{d.name}</span>
                  <span className="dim-weight">w {weights[d.id]}%</span>
                  <span className="dim-bar"><i style={{ width: `${sc == null ? 0 : sc}%`, background: BAND_COLOR[dBand.key] }} /></span>
                  <span className="dim-score" style={{ color: sc == null ? 'var(--na)' : BAND_COLOR[dBand.key] }}>{sc == null ? '—' : sc}</span>
                  <span className="dim-count">{dScored.length}/{scoped.length} done</span>
                  <svg className="chev" width="16" height="16" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="dim-body">
                  {d.items.map((it) => {
                    const s = items[it.id]
                    const isNA = s.state === 'na'
                    return (
                      <div className={`item${isNA ? ' na' : ''}${rowVisible(it) ? '' : ' hidden'}`} key={it.id}>
                        <div className="scorectl">
                          <div className="dots">
                            {[0, 1, 2, 3, 4].map((n) => {
                              const sel = s.state === n
                              return (
                                <button key={n} className={`dot${sel ? ' sel' : ''}`} style={sel ? { background: DOT_COLOR[n] } : undefined} title={String(n)} onClick={() => setScore(it.id, n)}>{n}</button>
                              )
                            })}
                          </div>
                          <button className={`na-btn${isNA ? ' sel' : ''}`} onClick={() => setNA(it.id)}>N/A</button>
                        </div>
                        <div className="item-main">
                          <p className="item-title">
                            {it.title}
                            <span className="tags">
                              <span className={`tag ${it.level === 'core' ? 'core' : 'adv'}`}>{it.level === 'core' ? 'Core' : 'Advanced'}</span>
                              {(it.tags ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}
                            </span>
                          </p>
                          <p className="item-desc">{it.desc}</p>
                          <div className="kv">
                            <span className="chip">
                              <span className="lab">Tool</span>
                              {it.toolUrl
                                ? <a className="val" href={it.toolUrl} target="_blank" rel="noopener noreferrer">{it.tool} ↗</a>
                                : <span className="val">{it.tool}</span>}
                            </span>
                            <span className="chip verify"><span className="lab">Verify</span><span className="val">{it.verify}</span></span>
                          </div>
                          <textarea
                            className="note"
                            data-empty={s.note ? '0' : '1'}
                            value={s.note}
                            onChange={(e) => setNote(it.id, e.target.value)}
                            placeholder="Evidence / finding — screenshot name, result, pasted header…"
                          />
                        </div>
                      </div>
                    )
                  })}
                  {naHidden > 0 && (
                    <div className="item" style={{ gridTemplateColumns: '1fr' }}>
                      <div className="item-main" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
                        {naHidden} not-applicable check{naHidden > 1 ? 's' : ''} hidden — toggle “Show N/A” to view.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        {/* RUBRIC */}
        <section className="rubric">
          <p className="eyebrow">10 — Scoring rubric &amp; method</p>
          <div className="panel">
            <h3>How to score each line — 0 to 4</h3>
            <p>Score only what you have verified with the named tool. Leave a line <b>unscored</b> until you have the evidence; mark it <b>N/A</b> if it genuinely doesn’t apply to this client. A dimension’s score is the average of its scored lines, rescaled to 100; the overall score is those dimension scores combined by the weights above.</p>
            <div className="scale">
              {SCALE.map((lvl) => (
                <div className="lvl" style={{ borderColor: SCALE_COLOR[lvl.n] }} key={lvl.n}>
                  <div className="n" style={{ color: SCALE_COLOR[lvl.n] }}>{lvl.n}</div>
                  <div className="t">{lvl.t}</div>
                  <div className="d">{lvl.d}</div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14 }}><b style={{ fontFamily: 'var(--disp)' }}>Overall bands</b></p>
            <div className="bands">
              {BANDS.map((b) => <span className="bandkey" style={{ background: BAND_COLOR[b.key] }} key={b.key}>{b.label}</span>)}
            </div>
            <div className="ruleblock">
              <b>The one rule that makes the report defensible.</b> Every line you score carries an evidence note — a screenshot filename, a tool URL/result, or a pasted header. If you can’t point to the artifact that proves a finding, don’t put the finding in the report. This is what separates an audit from an opinion, and it’s exactly where read-only reviews go wrong: things like CDN, security headers, robots/canonical config, schema, and rendered alt text can only be confirmed by inspecting headers and the rendered DOM — never by reading a page.
            </div>
            <p><b style={{ fontFamily: 'var(--disp)' }}>Why the weights move with the business model.</b> A store lives or dies on performance, checkout, and trust; a local service business on findability, mobile, and contact; a B2B site on conversion paths, content, and credibility; a publisher on content and discovery. Picking the model re-weights the score so the headline number reflects what actually matters for that client — and switches off checks (product schema, checkout friction, lead-gen forms, etc.) that don’t apply. Override any of it: weights are editable, and every line has N/A.</p>
            <div className="disc">Legal/privacy reminders adapt to the selected market but are general prompts to check what applies — not legal advice. Confirm the specific obligations (privacy law, cookie/consent, accessibility statutes, marketing-consent rules) for your client’s jurisdiction and sector.</div>
          </div>
        </section>

        <footer><span className="fm">Rainey Laguna · repeatable audit framework</span></footer>
      </div>
    </div>
  )
}
