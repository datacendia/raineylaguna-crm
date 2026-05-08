import { Pool } from 'pg'
import { serverEnv } from './env'

const pool = new Pool({
  connectionString: serverEnv.DATABASE_URL,
})

export default pool
