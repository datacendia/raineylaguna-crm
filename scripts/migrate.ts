/**
 * Apply the CRM base schema, then every migration in database/migrations/
 * (sorted by filename), against DATABASE_URL.
 *
 * Migrations are tracked in a `schema_migrations` ledger, so each file runs
 * EXACTLY ONCE per database. This matters more than it sounds: several
 * migrations are data-mutating UPDATEs, not just additive DDL, and re-running
 * them is destructive rather than idempotent. Two live examples:
 *
 *   - 2026-06-19-normalize-source.sql ends in `ELSE 'other'`. It is a no-op for
 *     the nine canonical sources that existed when it was written, but any
 *     lead-source value added to the vocabulary later — and not matched by one
 *     of its ILIKE patterns — is silently rewritten to 'other' on every run.
 *   - 2026-06-03-franchise-flag.sql only ever SETS is_chain = true, so a
 *     manually-cleared false positive is re-flagged on every run (that file
 *     documents this itself).
 *
 * Before the ledger, both of the above executed on every `npm run migrate` —
 * i.e. on every Railway deploy.
 *
 * Each migration is applied inside its own transaction together with its ledger
 * row, so a failure part-way through leaves neither the change nor the record.
 * (Verified safe: no migration uses CREATE INDEX CONCURRENTLY or explicit
 * transaction control, both of which would conflict with this.)
 *
 * The base schema (crm-schema.sql) is still applied unconditionally on every
 * run. It is genuinely idempotent — guarded enum types, CREATE TABLE/INDEX
 * IF NOT EXISTS, CREATE OR REPLACE TRIGGER — and acts as the bootstrap.
 *
 * Used as a Railway deploy hook or manually: `npm run migrate`.
 *
 * Modes:
 *   npm run migrate              apply pending migrations only
 *   MIGRATE_REPLAY=1 ...         re-apply every migration, ignoring the ledger
 *                                (dangerous — see the data-mutating files above)
 *   SCHEMA_PATH=path ...         legacy single-file mode, ledger untouched
 *   MIGRATE_DRY_RUN=1 ...        report what would run, change nothing
 */
import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum   text
);
`

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * Last migration that existed before this ledger was introduced.
 *
 * Filenames are ISO-dated and applied in lexicographic order, so this is a
 * stable boundary. On a pre-existing database, everything at or below it has
 * demonstrably already run; anything above it is new and must actually execute
 * even during first-time ledger initialisation. Do not bump this — it records
 * a historical fact, not a moving target.
 */
const PRE_LEDGER_CUTOFF = '2026-06-19-normalize-source.sql'

async function applyFile(label: string, absPath: string) {
  process.stdout.write(`  ${label} … `)
  await pool.query(readFileSync(absPath, 'utf8'))
  console.log('✓')
}

/**
 * Apply one migration and record it in the same transaction, so the ledger can
 * never claim a migration that did not fully succeed.
 */
async function applyTracked(file: string, absPath: string) {
  const sql = readFileSync(absPath, 'utf8')
  const client = await pool.connect()
  process.stdout.write(`  migrations/${file} … `)
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum`,
      [file, sha256(sql)],
    )
    await client.query('COMMIT')
    console.log('✓')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.log('✗')
    throw err
  } finally {
    client.release()
  }
}

/** Record a migration as applied WITHOUT executing it (adoption path). */
async function adopt(files: string[], migrationsDir: string) {
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8')
    await pool.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [f, sha256(sql)],
    )
    console.log(`  adopted  migrations/${f}`)
  }
}

async function main() {
  const root = process.cwd()
  const replay = process.env.MIGRATE_REPLAY === '1'
  const dryRun = process.env.MIGRATE_DRY_RUN === '1'

  // Legacy single-file override — deliberately bypasses the ledger.
  if (process.env.SCHEMA_PATH) {
    await applyFile(process.env.SCHEMA_PATH, join(root, process.env.SCHEMA_PATH))
    await pool.end()
    return
  }

  console.log('Applying base schema + migrations…')
  if (!dryRun) {
    await applyFile('database/crm-schema.sql', join(root, 'database', 'crm-schema.sql'))
  }

  // A dry run must not write, so it may not create the ledger either — it
  // reports what a real run would do against whatever state exists now.
  const ledgerExists =
    (await pool.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`))
      .rows[0].exists === true
  if (!dryRun && !ledgerExists) await pool.query(LEDGER_DDL)

  const migrationsDir = join(root, 'database', 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const rows =
    ledgerExists || !dryRun
      ? (
          await pool.query<{ filename: string; checksum: string | null }>(
            'SELECT filename, checksum FROM schema_migrations',
          )
        ).rows
      : []
  const applied = new Map(rows.map((r) => [r.filename, r.checksum]))

  // Warn when an already-applied migration's contents have changed on disk.
  // Editing an applied migration means the database and the repo disagree.
  for (const f of files) {
    const recorded = applied.get(f)
    if (!recorded) continue
    const current = sha256(readFileSync(join(migrationsDir, f), 'utf8'))
    if (recorded !== current) {
      console.warn(`  ! ${f} was edited after being applied — DB and repo differ`)
    }
  }

  const pending = files.filter((f) => !applied.has(f))

  // Adoption: an existing database whose ledger is empty. The tables already
  // exist, so these migrations demonstrably ran before the ledger existed —
  // re-running them is exactly the destructive behaviour the ledger prevents.
  // Record them as applied instead. MIGRATE_REPLAY=1 forces the old behaviour.
  const isPreExisting =
    applied.size === 0 &&
    (
      await pool.query(
        `SELECT to_regclass('public.crm_leads') IS NOT NULL AS exists`,
      )
    ).rows[0].exists === true

  if (dryRun) {
    console.log(`\nDRY RUN — no changes made.`)
    console.log(`  ledger rows: ${applied.size}`)
    console.log(`  pre-existing database: ${isPreExisting}`)
    if (isPreExisting && !replay) {
      const adoptable = pending.filter((f) => f <= PRE_LEDGER_CUTOFF)
      const mustRun = pending.filter((f) => f > PRE_LEDGER_CUTOFF)
      console.log(`  would ADOPT (record, not run): ${adoptable.join(', ') || '(nothing)'}`)
      console.log(`  would EXECUTE:                 ${mustRun.join(', ') || '(nothing)'}`)
    } else {
      console.log(`  would EXECUTE: ${pending.length ? pending.join(', ') : '(nothing)'}`)
    }
    await pool.end()
    return
  }

  if (isPreExisting && !replay) {
    // Adopting ALL pending migrations here would be wrong, and destructively so:
    // a migration shipped in the same release as the ledger has never run, so
    // recording it as applied means its table/column is never created and the
    // code depending on it fails at runtime against a "successful" migrate.
    //
    // Split on the pre-ledger boundary: everything at or below it demonstrably
    // ran already (the tables exist, which is how we got here), everything above
    // it is genuinely new and must actually execute.
    const adoptable = pending.filter((f) => f <= PRE_LEDGER_CUTOFF)
    const mustRun = pending.filter((f) => f > PRE_LEDGER_CUTOFF)

    console.log(
      `\n  Existing database with an empty ledger.\n` +
        `  Adopting ${adoptable.length} pre-ledger migration(s) as already-applied,\n` +
        `  and actually running ${mustRun.length} newer one(s). Verify with:\n` +
        `    SELECT filename, applied_at FROM schema_migrations ORDER BY filename;\n`,
    )
    await adopt(adoptable, migrationsDir)
    for (const f of mustRun) {
      await applyTracked(f, join(migrationsDir, f))
    }
    console.log(
      `\n✓ Ledger initialised: ${adoptable.length} adopted, ${mustRun.length} executed.`,
    )
    await pool.end()
    return
  }

  const toRun = replay ? files : pending
  if (replay) {
    console.warn('  ! MIGRATE_REPLAY=1 — re-running every migration, including data-mutating ones')
  }

  for (const f of toRun) {
    await applyTracked(f, join(migrationsDir, f))
  }

  const skipped = files.length - toRun.length
  console.log(
    `✓ Base schema applied. ${toRun.length} migration(s) run` +
      (skipped ? `, ${skipped} already applied.` : '.'),
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
