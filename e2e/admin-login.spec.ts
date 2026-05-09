import { test, expect } from '@playwright/test'

/**
 * Admin login E2E test.
 *
 * Tests the CRM admin login flow:
 *   - Navigate to /login
 *   - Enter email and password
 *   - Submit form
 *   - Verify redirect to /dashboard on success
 *   - Verify error message on failure
 *
 * Note: This test uses a test user created via seed script.
 * In CI, the database is seeded before tests run.
 */

test.describe('Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')
  })

  test('shows login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CRM Login' })).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    // Fill in credentials (test user from seed script)
    await page.getByPlaceholder('Email').fill('admin@example.com')
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: 'Login' }).click()

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  })

  test('invalid credentials show error', async ({ page }) => {
    // Fill in invalid credentials
    await page.getByPlaceholder('Email').fill('admin@example.com')
    await page.getByPlaceholder('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Login' }).click()

    // Verify error message
    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('missing credentials show validation', async ({ page }) => {
    // Submit empty form
    await page.getByRole('button', { name: 'Login' }).click()

    // Browser HTML5 validation should prevent submission
    // The form has required attributes on email and password inputs
    await expect(page).toHaveURL('/login')
  })
})
