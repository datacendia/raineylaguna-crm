/**
 * Apply the CRM base schema, then every migration in database/migrations/
 * (sorted by filename), against DATABASE_URL.
 *
 * Idempotent: crm-schema.sql uses guarded enum types, CREATE TABLE/INDEX
 * IF NOT EXISTS and CREATE OR REPLACE TRIGGER, and every migration is
 * additive (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, ...), so
 * this is safe to run repeatedly on a fresh OR an existing database.
 *
 * Used as a Railway deploy hook or manually: `npm run migrate`.
 *
 * Legacy single-file mode is preserved: `SCHEMA_PATH=path npm run migrate`
 * applies just that one file.
 */
import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function applyFile(label: string, absPath: string) {
  process.stdout.write(`  ${label} … `)
  await pool.query(readFileSync(absPath, 'utf8'))
  console.log('✓')
}

async function main() {
  const root = process.cwd()

  // Legacy single-file override.
  if (process.env.SCHEMA_PATH) {
    await applyFile(process.env.SCHEMA_PATH, join(root, process.env.SCHEMA_PATH))
    await pool.end()
    return
  }

  console.log('Applying base schema + migrations…')
  await applyFile('database/crm-schema.sql', join(root, 'database', 'crm-schema.sql'))

  const migrationsDir = join(root, 'database', 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    await applyFile(`migrations/${f}`, join(migrationsDir, f))
  }

  console.log(`✓ Base schema + ${files.length} migrations applied.`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
