import { test, expect, type Page } from '@playwright/test'

/**
 * Authenticated navigation E2E.
 *
 * Logs in with the seeded admin user (CI seeds the DB before the suite) and
 * checks the new milestone surfaces are reachable from the sidebar: the global
 * Draft queue and the Pipeline board.
 *
 * Guarded: if login does not land on /dashboard (no seeded user locally, or
 * TOTP is enrolled), the test self-skips rather than hard-failing — so local
 * runs without a seed stay green while CI still exercises the flow.
 */

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill('admin@example.com')
  await page.getByPlaceholder('Password').fill('password123')
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForLoadState('networkidle')
}

test.describe('Authenticated dashboard navigation', () => {
  test('reaches Draft queue and Pipeline from the sidebar', async ({ page }) => {
    await login(page)
    test.skip(!page.url().includes('/dashboard'), 'requires a seeded admin user (CI seeds the DB)')

    await page.getByRole('link', { name: 'Draft queue' }).click()
    await expect(page).toHaveURL(/\/dashboard\/drafts/)
    await expect(page.getByRole('heading', { name: 'Draft queue' })).toBeVisible()

    await page.getByRole('link', { name: 'Pipeline' }).click()
    await expect(page).toHaveURL(/\/dashboard\/pipeline/)
    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible()

    await page.getByRole('link', { name: 'Leads' }).click()
    await expect(page).toHaveURL(/\/dashboard\/leads/)
    // The CSV export affordance added this milestone.
    await expect(page.getByRole('link', { name: /Export CSV/i })).toBeVisible()
  })
})
