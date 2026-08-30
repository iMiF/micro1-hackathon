import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'
import { pool } from '../src/db.ts'
import { resetDatabase } from '../src/reset.ts'

process.env.NODE_ENV = 'test'

let app: FastifyInstance

type Auth = { sid: string; csrfToken: string }

async function login(email = 'admin@minicrm.local', password = 'demo123'): Promise<Auth> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })
  assert.equal(res.statusCode, 200, res.body)
  const body = res.json()
  const sid = res.cookies.find((cookie) => cookie.name === 'sid')?.value
  assert.ok(sid)
  assert.ok(body.csrfToken)
  return { sid, csrfToken: body.csrfToken }
}

function authHeaders(auth: Auth, extra: Record<string, string> = {}) {
  return {
    cookies: { sid: auth.sid },
    headers: { 'x-csrf-token': auth.csrfToken, ...extra },
  }
}

before(async () => {
  app = await buildApp()
})

beforeEach(async () => {
  await resetDatabase()
})

after(async () => {
  await app.close()
  await pool.end()
})

test('login works and returns user plus csrf token', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@minicrm.local', password: 'demo123' },
  })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.user.email, 'admin@minicrm.local')
  assert.equal(body.user.name, 'Demo Admin')
  assert.equal(typeof body.csrfToken, 'string')
  assert.ok(res.cookies.some((cookie) => cookie.name === 'sid' && cookie.httpOnly))
})

test('unauthenticated API request is rejected', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/customers' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().code, 'UNAUTHENTICATED')
})

test('mutation without CSRF is rejected', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/customers',
    cookies: { sid: auth.sid },
    payload: { email: 'ncsrf@example.test', firstName: 'No', lastName: 'Token' },
  })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'CSRF_TOKEN_INVALID')
})

test('customer creation works', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/customers',
    ...authHeaders(auth),
    payload: {
      email: 'nina@example.test',
      firstName: 'Nina',
      lastName: 'Cole',
      phone: '+1-555-0199',
    },
  })
  assert.equal(res.statusCode, 201)
  const body = res.json()
  assert.equal(body.email, 'nina@example.test')
  assert.equal(body.version, 1)
  assert.equal(body.archived, false)
})

test('customer edit increments version', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/customers/102',
    ...authHeaders(auth),
    payload: { phone: '+1-613-555-9999', version: 1 },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().version, 2)
  assert.equal(res.json().phone, '+1-613-555-9999')
})

test('stale customer version returns VERSION_CONFLICT', async () => {
  const auth = await login()
  const first = await app.inject({
    method: 'PATCH',
    url: '/api/customers/102',
    ...authHeaders(auth),
    payload: { phone: '+1-613-555-1111', version: 1 },
  })
  assert.equal(first.statusCode, 200)
  const stale = await app.inject({
    method: 'PATCH',
    url: '/api/customers/102',
    ...authHeaders(auth),
    payload: { phone: '+1-613-555-2222', version: 1 },
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().code, 'VERSION_CONFLICT')
  assert.equal(stale.json().currentVersion, 2)
})

test('deleting customer with orders returns CUSTOMER_HAS_ORDERS', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'DELETE',
    url: '/api/customers/101',
    ...authHeaders(auth),
  })
  assert.equal(res.statusCode, 409)
  assert.equal(res.json().code, 'CUSTOMER_HAS_ORDERS')
})

test('deleting customer without orders works', async () => {
  const auth = await login()
  const created = await app.inject({
    method: 'POST',
    url: '/api/customers',
    ...authHeaders(auth),
    payload: { email: 'temp-delete@example.test', firstName: 'Temp', lastName: 'Delete' },
  })
  assert.equal(created.statusCode, 201)
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/customers/${created.json().id}`,
    ...authHeaders(auth),
  })
  assert.equal(res.statusCode, 204)
  const missing = await app.inject({
    method: 'GET',
    url: `/api/customers/${created.json().id}`,
    cookies: { sid: auth.sid },
  })
  assert.equal(missing.statusCode, 404)
})

test('order status transition works', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/orders/1002/status',
    ...authHeaders(auth),
    payload: { statusId: 30, version: 1 },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().statusId, 30)
  assert.equal(res.json().version, 2)
})

test('invalid status transition fails', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/orders/1002/status',
    ...authHeaders(auth),
    payload: { statusId: 40, version: 1 },
  })
  assert.equal(res.statusCode, 409)
  assert.equal(res.json().code, 'INVALID_STATUS_TRANSITION')
  assert.equal(res.json().currentStatusId, 20)
  assert.equal(res.json().requestedStatusId, 40)
})

test('order quote calculates totals', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/order-quotes',
    ...authHeaders(auth),
    payload: {
      customerId: 101,
      addressId: 501,
      shippingMethodId: 1,
      items: [{ productId: 211, quantity: 2 }],
    },
  })
  assert.equal(res.statusCode, 201)
  const body = res.json()
  assert.equal(body.subtotalCents, 2598)
  assert.equal(body.shippingCents, 799)
  assert.equal(body.taxCents, Math.round((2598 + 799) * 0.13))
  assert.equal(body.totalCents, body.subtotalCents + body.shippingCents + body.taxCents)
  assert.ok(body.quoteId)
})

test('create order requires a valid quoteId', async () => {
  const auth = await login()
  const missing = await app.inject({
    method: 'POST',
    url: '/api/orders',
    ...authHeaders(auth),
    payload: {},
  })
  assert.equal(missing.statusCode, 400)
  const bogus = await app.inject({
    method: 'POST',
    url: '/api/orders',
    ...authHeaders(auth),
    payload: { quoteId: '00000000-0000-0000-0000-000000000000' },
  })
  assert.equal(bogus.statusCode, 404)
})

test('quote cannot be used twice', async () => {
  const auth = await login()
  const quote = await app.inject({
    method: 'POST',
    url: '/api/order-quotes',
    ...authHeaders(auth),
    payload: {
      customerId: 102,
      addressId: 503,
      shippingMethodId: 1,
      items: [{ productId: 211, quantity: 1 }],
    },
  })
  assert.equal(quote.statusCode, 201)
  const quoteId = quote.json().quoteId
  const first = await app.inject({
    method: 'POST',
    url: '/api/orders',
    ...authHeaders(auth),
    payload: { quoteId },
  })
  assert.equal(first.statusCode, 201)
  const second = await app.inject({
    method: 'POST',
    url: '/api/orders',
    ...authHeaders(auth),
    payload: { quoteId },
  })
  assert.equal(second.statusCode, 409)
  assert.equal(second.json().code, 'QUOTE_ALREADY_USED')
})

test('out of stock is rejected', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/order-quotes',
    ...authHeaders(auth),
    payload: {
      customerId: 102,
      addressId: 503,
      shippingMethodId: 1,
      items: [{ productId: 210, quantity: 1 }],
    },
  })
  assert.equal(res.statusCode, 409)
  assert.equal(res.json().code, 'OUT_OF_STOCK')
  assert.equal(res.json().productId, 210)
  assert.equal(res.json().availableQty, 0)
  assert.equal(res.json().requestedQty, 1)
})

test('order creation creates snapshots and decrements inventory', async () => {
  const auth = await login()
  const before = await app.inject({
    method: 'GET',
    url: '/api/products/211',
    cookies: { sid: auth.sid },
  })
  const stockBefore = before.json().stockQty
  const quote = await app.inject({
    method: 'POST',
    url: '/api/order-quotes',
    ...authHeaders(auth),
    payload: {
      customerId: 102,
      addressId: 503,
      shippingMethodId: 1,
      items: [{ productId: 211, quantity: 3 }],
    },
  })
  const created = await app.inject({
    method: 'POST',
    url: '/api/orders',
    ...authHeaders(auth),
    payload: { quoteId: quote.json().quoteId, note: 'Pack with care' },
  })
  assert.equal(created.statusCode, 201)
  const order = created.json()
  assert.equal(order.customerNameSnapshot, 'Bob Martin')
  assert.equal(order.customerEmailSnapshot, 'bob@example.test')
  assert.equal(order.addressSnapshot.city, 'Ottawa')
  assert.equal(order.items[0].skuSnapshot, 'SKU-211')
  assert.equal(order.items[0].nameSnapshot, 'HDMI Cable')
  assert.equal(order.items[0].unitPriceCents, 1299)
  const after = await app.inject({
    method: 'GET',
    url: '/api/products/211',
    cookies: { sid: auth.sid },
  })
  assert.equal(after.json().stockQty, stockBefore - 3)
})

test('draft order deletion restores inventory', async () => {
  const auth = await login()
  const before = await app.inject({
    method: 'GET',
    url: '/api/products/202',
    cookies: { sid: auth.sid },
  })
  const res = await app.inject({
    method: 'DELETE',
    url: '/api/orders/1001',
    ...authHeaders(auth),
  })
  assert.equal(res.statusCode, 204)
  const after = await app.inject({
    method: 'GET',
    url: '/api/products/202',
    cookies: { sid: auth.sid },
  })
  assert.equal(after.json().stockQty, before.json().stockQty + 1)
  const missing = await app.inject({
    method: 'GET',
    url: '/api/orders/1001',
    cookies: { sid: auth.sid },
  })
  assert.equal(missing.statusCode, 404)
})

test('customer archive preserves historical order', async () => {
  const auth = await login()
  const archived = await app.inject({
    method: 'PATCH',
    url: '/api/customers/101',
    ...authHeaders(auth),
    payload: { archived: true, version: 1 },
  })
  assert.equal(archived.statusCode, 200)
  assert.equal(archived.json().archived, true)
  const order = await app.inject({
    method: 'GET',
    url: '/api/orders/1003',
    cookies: { sid: auth.sid },
  })
  assert.equal(order.statusCode, 200)
  assert.equal(order.json().customerNameSnapshot, 'Alice Chen')
  assert.equal(order.json().customerId, 101)
})

test('db:reset restores deterministic state', async () => {
  const auth = await login()
  await app.inject({
    method: 'DELETE',
    url: '/api/orders/1001',
    ...authHeaders(auth),
  })
  await resetDatabase()
  const order = await pool.query('SELECT order_number, status_id FROM orders WHERE id = 1001')
  assert.equal(order.rows[0].order_number, 'ORD-2026-1001')
  assert.equal(order.rows[0].status_id, 10)
  const alice = await pool.query('SELECT email, archived FROM customers WHERE id = 101')
  assert.equal(alice.rows[0].email, 'alice@example.test')
  assert.equal(alice.rows[0].archived, false)
})

test('Canadian orders over 100 get free standard shipping', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/shipping/options',
    ...authHeaders(auth),
    payload: {
      addressId: 501,
      items: [{ productId: 201, quantity: 1 }],
    },
  })
  assert.equal(res.statusCode, 200)
  const standard = res.json().options.find((option: { methodId: number }) => option.methodId === 1)
  assert.equal(standard.priceCents, 0)
})

test('archived customer cannot create an order quote', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'POST',
    url: '/api/order-quotes',
    ...authHeaders(auth),
    payload: {
      customerId: 103,
      addressId: 504,
      shippingMethodId: 1,
      items: [{ productId: 211, quantity: 1 }],
    },
  })
  assert.equal(res.statusCode, 422)
  assert.equal(res.json().code, 'CUSTOMER_ARCHIVED')
})

test('session endpoint returns the current user and csrf token', async () => {
  const auth = await login()
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/session',
    cookies: { sid: auth.sid },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().user.email, 'admin@minicrm.local')
  assert.equal(res.json().csrfToken, auth.csrfToken)
})
