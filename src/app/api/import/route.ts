import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// Minimal RFC 4180 CSV parser (handles quoted fields with commas/newlines)
function parseCSV(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (inQuotes) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length < 2) {
      return NextResponse.json({ error: 'Empty CSV' }, { status: 400 })
    }

    const leads = rows.slice(1).filter((r) => r.length && r[0]?.trim()).map((v) => ({
      name: v[0]?.trim(),
      district: v[1]?.trim(),
      niche: v[2]?.trim(),
      instagram_active: v[3]?.trim().toLowerCase() === 'yes' || v[3]?.trim().toLowerCase() === 'true',
      website_url: v[4]?.trim() || null,
      website_status: v[5]?.trim() || null,
      evaluation: v[6]?.trim() || null,
      strategic_action: v[7]?.trim() || null,
    }))

    let imported = 0
    let skipped = 0
    for (const lead of leads) {
      // Dedupe on (name, district) — the only stable identity a CSV row carries
      // in this format (no place id, no phone). `ON CONFLICT DO NOTHING` with no
      // matching unique constraint silently inserts EVERY row, which is how
      // re-importing the same file doubled the lead count. This guard is
      // idempotent: re-running an import is now a no-op for rows already present.
      const r = await pool.query(
        `INSERT INTO crm_leads
         (name, district, niche, instagram_active, website_url, website_status, evaluation, strategic_action)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM crm_leads
           WHERE lower(btrim(name)) = lower(btrim($1))
             AND lower(btrim(district)) = lower(btrim($2))
         )`,
        [lead.name, lead.district, lead.niche, lead.instagram_active, lead.website_url, lead.website_status, lead.evaluation, lead.strategic_action]
      )
      if ((r.rowCount ?? 0) > 0) imported++
      else skipped++
    }

    return NextResponse.json({ success: true, imported, skipped })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to import leads' }, { status: 500 })
  }
}
