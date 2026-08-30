import type { FastifyInstance } from 'fastify'
import { pool, withTransaction } from '../db.ts'
import { findShippingOption } from '../domain/shipping.ts'
import { isAllowedTransition, isKnownStatus, ORDER_STATUS } from '../domain/status.ts'
import { ApiError, notFound, validationError } from '../errors.ts'
import { requireUser } from '../hooks.ts'
import {
  getAddressWithGeo,
  mapActivity,
  mapNote,
  mapOrderDetail,
  mapOrderListItem,
  toAddressSnapshot,
  type QuoteItem,
} from '../mappers.ts'
import { likePattern, parseOptionalInt, parsePage, parsePageSize } from '../util.ts'

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/orders', async (request) => {
    const query = request.query as {
      page?: string
      pageSize?: string
      q?: string
      status?: string
      customerId?: string
      from?: string
      to?: string
    }
    const page = parsePage(query.page)
    const pageSize = parsePageSize(query.pageSize)
    const q = query.q?.trim() ?? ''
    const status = parseOptionalInt(query.status)
    const customerId = parseOptionalInt(query.customerId)

    const conditions: string[] = []
    const params: unknown[] = []

    if (status !== undefined) {
      params.push(status)
      conditions.push(`status_id = $${params.length}`)
    }
    if (customerId !== undefined) {
      params.push(customerId)
      conditions.push(`customer_id = $${params.length}`)
    }
    if (query.from) {
      params.push(query.from)
      conditions.push(`created_at >= $${params.length}::timestamptz`)
    }
    if (query.to) {
      params.push(query.to)
      conditions.push(`created_at <= $${params.length}::timestamptz`)
    }
    if (q) {
      params.push(likePattern(q))
      conditions.push(`(
        order_number ILIKE $${params.length} ESCAPE '\\'
        OR customer_name_snapshot ILIKE $${params.length} ESCAPE '\\'
        OR customer_email_snapshot ILIKE $${params.length} ESCAPE '\\'
      )`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM orders ${where}`, params)
    params.push(pageSize, (page - 1) * pageSize)
    const result = await pool.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return {
      items: result.rows.map(mapOrderListItem),
      page,
      pageSize,
      total: count.rows[0].total,
    }
  })

  app.get('/api/orders/:id', async (request) => {
    const id = Number((request.params as { id: string }).id)
    return loadOrderDetail(id)
  })

  app.get('/api/orders/:id/activity', async (request) => {
    const id = Number((request.params as { id: string }).id)
    await assertOrderExists(id)
    const result = await pool.query(
      `SELECT a.*, u.name AS created_by_name
       FROM order_activity a
       LEFT JOIN staff_users u ON u.id = a.created_by
       WHERE a.order_id = $1
       ORDER BY a.created_at ASC, a.id ASC`,
      [id],
    )
    return result.rows.map(mapActivity)
  })

  app.post('/api/orders/:id/notes', async (request, reply) => {
    const user = requireUser(request)
    const id = Number((request.params as { id: string }).id)
    const body = (request.body ?? {}) as { body?: string }
    if (!body.body?.trim()) throw validationError('body is required')
    const noteBody = body.body.trim()
    await assertOrderExists(id)

    const note = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO order_notes (order_id, body, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, noteBody, user.id],
      )
      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by)
         VALUES ($1, 'NOTE_ADDED', $2::jsonb, $3)`,
        [id, JSON.stringify({ body: noteBody }), user.id],
      )
      return inserted.rows[0]
    })
    const withName = await pool.query(
      `SELECT n.*, u.name AS created_by_name
       FROM order_notes n
       JOIN staff_users u ON u.id = n.created_by
       WHERE n.id = $1`,
      [note.id],
    )
    return reply.status(201).send(mapNote(withName.rows[0]))
  })

  app.patch('/api/orders/:id/status', async (request) => {
    const user = requireUser(request)
    const id = Number((request.params as { id: string }).id)
    const body = (request.body ?? {}) as { statusId?: number; version?: number }
    const statusId = body.statusId
    const version = body.version
    if (typeof statusId !== 'number' || typeof version !== 'number') {
      throw validationError('statusId and version are required')
    }
    if (!isKnownStatus(statusId)) {
      throw validationError('Unknown statusId')
    }

    return withTransaction(async (client) => {
      const current = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])
      if (!current.rows[0]) throw notFound('Order')
      if (current.rows[0].version !== version) {
        throw new ApiError(409, 'VERSION_CONFLICT', 'Order was modified by another user', {
          currentVersion: current.rows[0].version,
        })
      }
      if (!isAllowedTransition(current.rows[0].status_id, statusId)) {
        throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'This status change is not allowed', {
          currentStatusId: current.rows[0].status_id,
          requestedStatusId: statusId,
        })
      }

      const updated = await client.query(
        `UPDATE orders
         SET status_id = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [statusId, id],
      )
      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by)
         VALUES ($1, 'STATUS_CHANGED', $2::jsonb, $3)`,
        [
          id,
          JSON.stringify({
            fromStatusId: current.rows[0].status_id,
            toStatusId: statusId,
          }),
          user.id,
        ],
      )
      const items = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id])
      return mapOrderDetail(updated.rows[0], items.rows)
    })
  })

  app.post('/api/orders', async (request, reply) => {
    const user = requireUser(request)
    const body = (request.body ?? {}) as { quoteId?: string; note?: string }
    if (!body.quoteId) throw validationError('quoteId is required')

    const created = await withTransaction(async (client) => {
      const quoteRes = await client.query('SELECT * FROM order_quotes WHERE id = $1 FOR UPDATE', [body.quoteId])
      const quote = quoteRes.rows[0]
      if (!quote) throw notFound('Quote')
      if (quote.used_at) {
        throw new ApiError(409, 'QUOTE_ALREADY_USED', 'This quote has already been used.')
      }
      if (new Date(quote.expires_at).getTime() <= Date.now()) {
        throw new ApiError(410, 'QUOTE_EXPIRED', 'This quote has expired. Request a new quote.')
      }

      const customer = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [quote.customer_id])
      if (!customer.rows[0]) throw notFound('Customer')
      if (customer.rows[0].archived) {
        throw new ApiError(422, 'CUSTOMER_ARCHIVED', 'Archived customers cannot place new orders.')
      }

      const address = await getAddressWithGeo(client, quote.address_id, quote.customer_id)
      if (!address) throw notFound('Address')
      const addressSnapshot = toAddressSnapshot(address)
      const items = quote.items as QuoteItem[]

      for (const item of items) {
        const product = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.productId])
        if (!product.rows[0]) throw notFound('Product')
        if (!product.rows[0].active) {
          throw new ApiError(422, 'PRODUCT_INACTIVE', 'Inactive products cannot be ordered', {
            productId: item.productId,
          })
        }
        if (product.rows[0].stock_qty < item.quantity) {
          throw new ApiError(409, 'OUT_OF_STOCK', 'Requested quantity exceeds available stock', {
            productId: item.productId,
            availableQty: product.rows[0].stock_qty,
            requestedQty: item.quantity,
          })
        }
        await client.query(
          `UPDATE products
           SET stock_qty = stock_qty - $1, version = version + 1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.productId],
        )
      }

      const shipping = findShippingOption(
        addressSnapshot.countryCode,
        quote.subtotal_cents,
        quote.shipping_method_id,
      )
      if (!shipping) {
        throw validationError('Shipping method is not available for this destination')
      }

      const inserted = await client.query(
        `INSERT INTO orders (
           order_number, customer_id, customer_name_snapshot, customer_email_snapshot,
           address_snapshot, status_id, payment_status, subtotal_cents, shipping_cents,
           tax_cents, total_cents, shipping_method_id
         ) VALUES (
           'PENDING', $1, $2, $3, $4::jsonb, $5, 'unpaid', $6, $7, $8, $9, $10
         )
         RETURNING *`,
        [
          customer.rows[0].id,
          `${customer.rows[0].first_name} ${customer.rows[0].last_name}`,
          customer.rows[0].email,
          JSON.stringify(addressSnapshot),
          ORDER_STATUS.DRAFT,
          quote.subtotal_cents,
          quote.shipping_cents,
          quote.tax_cents,
          quote.total_cents,
          quote.shipping_method_id,
        ],
      )
      const order = inserted.rows[0]
      const orderNumber = `ORD-2026-${order.id}`
      const numbered = await client.query(
        `UPDATE orders SET order_number = $1 WHERE id = $2 RETURNING *`,
        [orderNumber, order.id],
      )

      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, sku_snapshot, name_snapshot, unit_price_cents, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.productId, item.sku, item.name, item.unitPriceCents, item.quantity],
        )
      }

      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by)
         VALUES ($1, 'ORDER_CREATED', $2::jsonb, $3)`,
        [order.id, JSON.stringify({ quoteId: quote.id, totalCents: quote.total_cents }), user.id],
      )

      if (body.note?.trim()) {
        await client.query(
          `INSERT INTO order_notes (order_id, body, created_by) VALUES ($1, $2, $3)`,
          [order.id, body.note.trim(), user.id],
        )
        await client.query(
          `INSERT INTO order_activity (order_id, event_type, data, created_by)
           VALUES ($1, 'NOTE_ADDED', $2::jsonb, $3)`,
          [order.id, JSON.stringify({ body: body.note.trim() }), user.id],
        )
      }

      await client.query('UPDATE order_quotes SET used_at = NOW() WHERE id = $1', [quote.id])
      const orderItems = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [order.id])
      return mapOrderDetail(numbered.rows[0], orderItems.rows)
    })

    return reply.status(201).send(created)
  })

  app.patch('/api/orders/:id', async (request) => {
    const user = requireUser(request)
    const id = Number((request.params as { id: string }).id)
    const body = (request.body ?? {}) as { version?: number; paymentStatus?: string }
    if (typeof body.version !== 'number') {
      throw validationError('version is required')
    }

    return withTransaction(async (client) => {
      const current = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])
      if (!current.rows[0]) throw notFound('Order')
      if (current.rows[0].status_id !== ORDER_STATUS.DRAFT) {
        throw new ApiError(409, 'ORDER_NOT_EDITABLE', 'Only draft orders can be edited.')
      }
      if (current.rows[0].version !== body.version) {
        throw new ApiError(409, 'VERSION_CONFLICT', 'Order was modified by another user', {
          currentVersion: current.rows[0].version,
        })
      }

      const paymentStatus = body.paymentStatus ?? current.rows[0].payment_status
      if (!['unpaid', 'paid', 'refunded'].includes(paymentStatus)) {
        throw validationError('Invalid paymentStatus')
      }

      const updated = await client.query(
        `UPDATE orders
         SET payment_status = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [paymentStatus, id],
      )
      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by)
         VALUES ($1, 'ORDER_UPDATED', $2::jsonb, $3)`,
        [id, JSON.stringify({ paymentStatus }), user.id],
      )
      const items = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id])
      return mapOrderDetail(updated.rows[0], items.rows)
    })
  })

  app.delete('/api/orders/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    await withTransaction(async (client) => {
      const current = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])
      if (!current.rows[0]) throw notFound('Order')
      if (current.rows[0].status_id !== ORDER_STATUS.DRAFT) {
        throw new ApiError(409, 'ORDER_CANNOT_BE_DELETED', 'Only draft orders can be permanently deleted.')
      }
      const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id])
      for (const item of items.rows) {
        await client.query(
          `UPDATE products
           SET stock_qty = stock_qty + $1, version = version + 1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.product_id],
        )
      }
      await client.query('DELETE FROM orders WHERE id = $1', [id])
    })
    return reply.status(204).send()
  })
}

async function assertOrderExists(id: number) {
  const result = await pool.query('SELECT id FROM orders WHERE id = $1', [id])
  if (!result.rows[0]) throw notFound('Order')
}

async function loadOrderDetail(id: number) {
  const order = await pool.query('SELECT * FROM orders WHERE id = $1', [id])
  if (!order.rows[0]) throw notFound('Order')
  const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id])
  return mapOrderDetail(order.rows[0], items.rows)
}
