import bcrypt from 'bcryptjs'
import pool from './db'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  last_login_at: string | null
  disabled_at: string | null
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

export async function verifyUserPassword(email: string, password: string): Promise<AdminUser | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return null
  await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id])
  const { password_hash: _, ...safe } = user
  return safe
}

export async function createUser(email: string, name: string, password: string, role = 'admin'): Promise<AdminUser> {
  const hash = await bcrypt.hash(password, 12)
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, last_login_at, disabled_at, created_at, updated_at`,
    [email, name, hash, role],
  )
  return rows[0]
}

export async function listUsers(): Promise<AdminUser[]> {
  const { rows } = await pool.query(
    'SELECT id, email, name, role, last_login_at, disabled_at, created_at, updated_at FROM admin_users ORDER BY created_at',
  )
  return rows
}
