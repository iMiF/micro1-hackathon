import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'
import { notFound } from '../errors.ts'
import { mapProduct } from '../mappers.ts'
import { likePattern, parseOptionalBoolean, parsePage, parsePageSize } from '../util.ts'

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/products/suggest', async (request) => {
    const q = String((request.query as { q?: string }).q ?? '').trim()
    if (q.length < 1) return []
    const result = await pool.query(
      `SELECT id, sku, name, price_cents, stock_qty
       FROM products
       WHERE active = TRUE
         AND (name ILIKE $1 ESCAPE '\\' OR sku ILIKE $1 ESCAPE '\\')
       ORDER BY name
       LIMIT 10`,
      [likePattern(q)],
    )
    return result.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      priceCents: row.price_cents,
      stockQty: row.stock_qty,
    }))
  })

  app.get('/api/products', async (request) => {
    const query = request.query as { page?: string; pageSize?: string; q?: string; active?: string }
    const page = parsePage(query.page)
    const pageSize = parsePageSize(query.pageSize)
    const active = parseOptionalBoolean(query.active)
    const q = query.q?.trim() ?? ''

    const conditions: string[] = []
    const params: unknown[] = []
    if (active !== undefined) {
      params.push(active)
      conditions.push(`active = $${params.length}`)
    }
    if (q) {
      params.push(likePattern(q))
      conditions.push(`(name ILIKE $${params.length} ESCAPE '\\' OR sku ILIKE $${params.length} ESCAPE '\\')`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM products ${where}`, params)
    params.push(pageSize, (page - 1) * pageSize)
    const result = await pool.query(
      `SELECT * FROM products ${where} ORDER BY name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return {
      items: result.rows.map(mapProduct),
      page,
      pageSize,
      total: count.rows[0].total,
    }
  })

  app.get('/api/products/:id', async (request) => {
    const id = Number((request.params as { id: string }).id)
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id])
    if (!result.rows[0]) throw notFound('Product')
    return mapProduct(result.rows[0])
  })
}
