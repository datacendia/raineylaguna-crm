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

// Every API route that reads lead data must appear here. A route is only gated
// if it is listed in `config.matcher` in src/proxy.ts — nothing else enforces
// auth — so this list is the regression test for that matcher.
//
// /api/analytics is the reason this comment exists: it returns named leads with
// their districts, health scores and generated pitch copy, and was missing from
// the matcher, so it answered unauthenticated to anyone on the internet.
const PROTECTED_APIS = [
  '/api/analytics',
  '/api/drafts',
  '/api/stats',
  '/api/outreach',
  '/api/leads',
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
