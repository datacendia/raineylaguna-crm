import bcrypt from 'bcryptjs'
import pool from './db'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  last_login_at: string | null
  disabled_at: string | null
  totp_secret: string | null
  totp_enrolled_at: string | null
  created_at: string
  updated_at: string
}

export async function findUserByEmail(email: string): Promise<(AdminUser & { password_hash: string }) | null> {
  const { rows } = await pool.query(
    'SELECT * FROM admin_users WHERE email = $1 AND disabled_at IS NULL',
    [email],
  )
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<AdminUser | null> {
  const { rows } = await pool.query(
    `SELECT id, email, name, role, last_login_at, disabled_at,
            totp_secret, totp_enrolled_at, created_at, updated_at
       FROM admin_users
      WHERE id = $1 AND disabled_at IS NULL`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * Verify the password only. Caller is responsible for any second-factor
 * check (TOTP) and for stamping `last_login_at` via `recordLogin` once
 * the full login flow succeeds. Splitting these lets the login route
 * gate the session cookie on password + TOTP atomically.
 */
export async function verifyUserPassword(email: string, password: string): Promise<AdminUser | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return null
  const { password_hash: _, ...safe } = user
  return safe
}

export async function recordLogin(id: string): Promise<void> {
  await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [id])
}

/**
 * Persist a pending TOTP secret. Enrolment is not "live" until
 * `confirmTotpEnrollment` is called — until then the secret sits on
 * the row but `totp_enrolled_at IS NULL`, so the login route ignores it.
 */
export async function setPendingTotpSecret(id: string, secret: string): Promise<void> {
  await pool.query(
    'UPDATE admin_users SET totp_secret = $1, totp_enrolled_at = NULL WHERE id = $2',
    [secret, id],
  )
}

export async function confirmTotpEnrollment(id: string): Promise<void> {
  await pool.query(
    'UPDATE admin_users SET totp_enrolled_at = NOW() WHERE id = $1 AND totp_secret IS NOT NULL',
    [id],
  )
}

export async function disableTotp(id: string): Promise<void> {
  await pool.query(
    'UPDATE admin_users SET totp_secret = NULL, totp_enrolled_at = NULL WHERE id = $1',
    [id],
  )
}

export async function createUser(email: string, name: string, password: string, role = 'admin'): Promise<AdminUser> {
  const hash = await bcrypt.hash(password, 12)
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, last_login_at, disabled_at,
               totp_secret, totp_enrolled_at, created_at, updated_at`,
    [email, name, hash, role],
  )
  return rows[0]
}

export async function listUsers(): Promise<AdminUser[]> {
  const { rows } = await pool.query(
    `SELECT id, email, name, role, last_login_at, disabled_at,
            totp_secret, totp_enrolled_at, created_at, updated_at
       FROM admin_users ORDER BY created_at`,
  )
  return rows
}
