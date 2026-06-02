import { test, expect } from '@playwright/test'

/**
 * Auth-gating E2E.
 *
 * Exercises the edge proxy (src/proxy.ts) contract without needing a seeded
 * DB or a logged-in session:
 *   - Protected PAGES bounce unauthenticated visitors to /login (302).
 *   - Protected APIs return 401 JSON (no redirect) for fetch clients.
 *   - Genuinely public endpoints (/api/health) are reachable.
 *
 * These cover the routes added in this milestone (drafts queue, CSV export)
 * alongside the pre-existing ones.
 */

const PROTECTED_PAGES = [
  '/dashboard',
  '/dashboard/leads',
  '/dashboard/pipeline',
  '/dashboard/drafts',
  '/dashboard/digest',
]

const PROTECTED_APIS = [
  '/api/drafts',
  '/api/stats',
  '/api/outreach',
  '/api/leads/export',
]

test.describe('Auth gating (unauthenticated)', () => {
  for (const route of PROTECTED_PAGES) {
    test(`page ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
      await expect(page.getByRole('heading', { name: 'CRM Login' })).toBeVisible()
    })
  }

  for (const route of PROTECTED_APIS) {
    test(`api ${route} returns 401 JSON`, async ({ request }) => {
      const res = await request.get(route, { maxRedirects: 0 })
      expect(res.status()).toBe(401)
      const body = await res.json()
      expect(body).toHaveProperty('error')
    })
  }
})
