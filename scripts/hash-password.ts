/**
 * Generate a bcrypt hash for the CRM admin password.
 * Run: npx tsx scripts/hash-password.ts <your-password>
 * Then paste the output into .env.local as CRM_PASSWORD_HASH=...
 */
import bcrypt from 'bcryptjs'

const password = process.argv[2]
if (!password) {
  console.error('Usage: npx tsx scripts/hash-password.ts <password>')
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 12)
console.log('CRM_PASSWORD_HASH=' + hash)
