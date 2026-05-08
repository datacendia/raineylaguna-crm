import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { serverEnv } from './env'

export const connection = new IORedis(serverEnv.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export type OutreachJob = {
  lead_id: string
  channel: 'Email' | 'Instagram DM' | 'WhatsApp' | 'LinkedIn'
  body: string
  template_id?: string
}

export const outreachQueue = new Queue<OutreachJob>('crm-outreach', { connection })
