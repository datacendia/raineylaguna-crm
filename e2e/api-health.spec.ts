import { test, expect } from '@playwright/test'

/**
 * Health endpoint E2E.
 *
 * /api/health is public (outside the proxy matcher) and is the Railway /
 * UptimeRobot probe target. We assert the documented shape regardless of
 * whether the DB is reachable in the test environment (200 when healthy,
 * 503 when a dependency is down — both return the same JSON shape).
 */

test('GET /api/health returns the documented shape', async ({ request }) => {
  const res = await request.get('/api/health')
  expect([200, 503]).toContain(res.status())

  const body = await res.json()
  expect(body).toHaveProperty('ok')
  expect(typeof body.ok).toBe('boolean')

  // Deployed git SHA (or 'unknown' locally) — always a string.
  expect(typeof body.version).toBe('string')

  // Dependency checks.
  expect(body.checks).toBeTruthy()
  expect(body.checks).toHaveProperty('db')
  expect(body.checks).toHaveProperty('env')

  // Presence-only service map with the integrations we wired this milestone.
  expect(body.services).toBeTruthy()
  for (const key of ['twilio_whatsapp', 'resend_email', 'redis_queue', 'sereno_sync', 'digest_email']) {
    expect(body.services).toHaveProperty(key)
    expect(typeof body.services[key]).toBe('boolean')
  }

  expect(typeof body.timestamp).toBe('string')
})
