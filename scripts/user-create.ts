/**
 * Create an admin user in the CRM database.
 * Run: npx tsx scripts/user-create.ts <email> <name> <password>
 *
 * Requires DATABASE_URL in .env.local (or env).
 */
import { createUser, findUserByEmail } from '../src/lib/users'

async function main() {
  const [email, name, password] = process.argv.slice(2)

  if (!email || !name || !password) {
    console.error('Usage: npx tsx scripts/user-create.ts <email> <name> <password>')
    process.exit(1)
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    console.error(`User with email ${email} already exists.`)
    process.exit(1)
  }

  const user = await createUser(email, name, password)
  console.log(`Created user: ${user.email} (${user.name}) — role: ${user.role}, id: ${user.id}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
