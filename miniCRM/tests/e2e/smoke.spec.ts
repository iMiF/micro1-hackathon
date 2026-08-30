import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill('admin@minicrm.local')
  await page.getByTestId('login-password').fill('demo123')
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('login lands on the dashboard', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Revenue (30 days)')).toBeVisible()
})

test('customer search finds Alice Chen', async ({ page }) => {
  await login(page)
  await page.getByTestId('nav-customers').click()
  await page.getByTestId('customer-search').fill('alice')
  await expect(page.getByRole('link', { name: 'Alice Chen' })).toBeVisible()
})

test('open order detail shows activity separately from the order heading', async ({ page }) => {
  await login(page)
  await page.getByTestId('nav-orders').click()
  await page.getByRole('link', { name: 'ORD-2026-1002' }).click()
  await expect(page.getByRole('heading', { name: 'ORD-2026-1002' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(page.getByText('ORDER_CREATED')).toBeVisible()
})

test('create customer', async ({ page }) => {
  await login(page)
  await page.getByTestId('nav-customers').click()
  await page.getByTestId('customer-create').click()
  await page.getByLabel('First name').fill('Nora')
  await page.getByLabel('Last name').fill('Singh')
  await page.getByLabel('Email').fill(`nora.singh.${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Create customer' }).click()
  await expect(page.getByRole('heading', { name: 'Nora Singh' })).toBeVisible()
})

test('complete create-order flow', async ({ page }) => {
  await login(page)
  await page.getByTestId('nav-orders').click()
  await page.getByTestId('order-create').click()
  await page.getByTestId('order-customer-search').fill('alice')
  await page.getByRole('button', { name: /Alice Chen/ }).click()
  await page.getByTestId('order-address').selectOption({ index: 1 })
  await page.getByLabel('Add product').fill('hdmi')
  await page.getByRole('button', { name: /HDMI Cable/ }).click()
  await page.getByLabel(/Standard/).check()
  await expect(page.getByText('Total', { exact: true })).toBeVisible()
  await expect(page.getByTestId('order-create-submit')).toBeEnabled()
  await page.getByTestId('order-create-submit').click()
  await expect(page.getByRole('heading', { name: /ORD-2026-/ })).toBeVisible()
  await expect(page.getByText('HDMI Cable')).toBeVisible()
})
