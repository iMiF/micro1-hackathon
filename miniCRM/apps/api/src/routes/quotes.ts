import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'
import { findShippingOption } from '../domain/shipping.ts'
import { calculateTaxCents } from '../domain/tax.ts'
import { ApiError, notFound, validationError } from '../errors.ts'
import { getAddressWithGeo, toAddressSnapshot, type QuoteItem } from '../mappers.ts'

const QUOTE_TTL_MINUTES = 10

export async function registerQuoteRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/order-quotes', async (request, reply) => {
    const body = (request.body ?? {}) as {
      customerId?: number
      addressId?: number
      shippingMethodId?: number
      items?: { productId: number; quantity: number }[]
    }
    if (!body.customerId || !body.addressId || !body.shippingMethodId || !Array.isArray(body.items) || body.items.length === 0) {
      throw validationError('customerId, addressId, shippingMethodId, and items are required')
    }

    const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [body.customerId])
    if (!customer.rows[0]) throw notFound('Customer')
    if (customer.rows[0].archived) {
      throw new ApiError(422, 'CUSTOMER_ARCHIVED', 'Archived customers cannot place new orders.')
    }

    const address = await getAddressWithGeo(pool, body.addressId, body.customerId)
    if (!address) throw notFound('Address')
    const snapshot = toAddressSnapshot(address)

    const quoteItems: QuoteItem[] = []
    for (const item of body.items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw validationError('Each item needs productId and quantity >= 1')
      }
      const product = await pool.query('SELECT * FROM products WHERE id = $1', [item.productId])
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
      quoteItems.push({
        productId: product.rows[0].id,
        quantity: item.quantity,
        sku: product.rows[0].sku,
        name: product.rows[0].name,
        unitPriceCents: product.rows[0].price_cents,
      })
    }

    const subtotalCents = quoteItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
    const shipping = findShippingOption(snapshot.countryCode, subtotalCents, body.shippingMethodId)
    if (!shipping) {
      throw validationError('Shipping method is not available for this destination')
    }
    const taxCents = calculateTaxCents(subtotalCents + shipping.priceCents, snapshot.countryCode, snapshot.regionCode)
    const totalCents = subtotalCents + shipping.priceCents + taxCents

    const inserted = await pool.query(
      `INSERT INTO order_quotes (
         customer_id, address_id, shipping_method_id, items,
         subtotal_cents, shipping_cents, tax_cents, total_cents, expires_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW() + INTERVAL '${QUOTE_TTL_MINUTES} minutes')
       RETURNING id, expires_at, subtotal_cents, shipping_cents, tax_cents, total_cents`,
      [
        body.customerId,
        body.addressId,
        body.shippingMethodId,
        JSON.stringify(quoteItems),
        subtotalCents,
        shipping.priceCents,
        taxCents,
        totalCents,
      ],
    )
    const row = inserted.rows[0]
    return reply.status(201).send({
      quoteId: row.id,
      subtotalCents: row.subtotal_cents,
      shippingCents: row.shipping_cents,
      taxCents: row.tax_cents,
      totalCents: row.total_cents,
      expiresAt: row.expires_at,
    })
  })
}
