import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'
import { ApiError, notFound, validationError } from '../errors.ts'
import { getAddressWithGeo } from '../mappers.ts'
import { shippingOptionsFor } from '../domain/shipping.ts'

type ShippingItem = { productId: number; quantity: number }

export async function registerShippingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/shipping/options', async (request) => {
    const body = (request.body ?? {}) as { addressId?: number; items?: ShippingItem[] }
    if (!body.addressId || !Array.isArray(body.items) || body.items.length === 0) {
      throw validationError('addressId and items are required')
    }

    const address = await getAddressWithGeo(pool, body.addressId)
    if (!address) throw notFound('Address')

    let subtotalCents = 0
    for (const item of body.items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw validationError('Each item needs productId and quantity >= 1')
      }
      const product = await pool.query(
        'SELECT id, price_cents, active FROM products WHERE id = $1',
        [item.productId],
      )
      if (!product.rows[0]) throw notFound('Product')
      if (!product.rows[0].active) {
        throw new ApiError(422, 'PRODUCT_INACTIVE', 'Inactive products cannot be ordered', {
          productId: item.productId,
        })
      }
      subtotalCents += product.rows[0].price_cents * item.quantity
    }

    return {
      options: shippingOptionsFor(String(address.country_code), subtotalCents),
    }
  })
}
