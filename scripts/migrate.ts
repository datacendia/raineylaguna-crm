/**
 * Run the CRM schema against the configured DATABASE_URL.
 * Used as a Railway deploy hook or manually: `npm run migrate`.
 */
import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const sqlPath = process.env.SCHEMA_PATH ?? join(process.cwd(), 'database', 'crm-schema.sql')
  const sql = readFileSync(sqlPath, 'utf8')
  console.log(`Running schema from ${sqlPath}…`)
  await pool.query(sql)
  console.log('✓ Schema applied.')
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
