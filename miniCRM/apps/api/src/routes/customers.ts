import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'
import { ApiError, notFound, validationError } from '../errors.ts'
import { ADDRESS_SELECT, mapAddress, mapCustomer } from '../mappers.ts'
import { likePattern, parseOptionalBoolean, parsePage, parsePageSize } from '../util.ts'

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/customers/suggest', async (request) => {
    const q = String((request.query as { q?: string }).q ?? '').trim()
    if (q.length < 1) {
      return []
    }
    const result = await pool.query(
      `SELECT id, first_name, last_name, email
       FROM customers
       WHERE archived = FALSE
         AND (
           first_name ILIKE $1 ESCAPE '\\'
           OR last_name ILIKE $1 ESCAPE '\\'
           OR email ILIKE $1 ESCAPE '\\'
           OR (first_name || ' ' || last_name) ILIKE $1 ESCAPE '\\'
         )
       ORDER BY last_name, first_name
       LIMIT 10`,
      [likePattern(q)],
    )
    return result.rows.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email,
    }))
  })

  app.get('/api/customers', async (request) => {
    const query = request.query as { page?: string; pageSize?: string; q?: string; archived?: string }
    const page = parsePage(query.page)
    const pageSize = parsePageSize(query.pageSize)
    const archived = parseOptionalBoolean(query.archived)
    const q = query.q?.trim() ?? ''

    const conditions: string[] = []
    const params: unknown[] = []

    if (archived !== undefined) {
      params.push(archived)
      conditions.push(`archived = $${params.length}`)
    }
    if (q) {
      params.push(likePattern(q))
      conditions.push(`(
        first_name ILIKE $${params.length} ESCAPE '\\'
        OR last_name ILIKE $${params.length} ESCAPE '\\'
        OR email ILIKE $${params.length} ESCAPE '\\'
        OR (first_name || ' ' || last_name) ILIKE $${params.length} ESCAPE '\\'
      )`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM customers ${where}`, params)
    params.push(pageSize, (page - 1) * pageSize)
    const result = await pool.query(
      `SELECT * FROM customers ${where} ORDER BY last_name, first_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return {
      items: result.rows.map(mapCustomer),
      page,
      pageSize,
      total: count.rows[0].total,
    }
  })

  app.get('/api/customers/:id', async (request) => {
    const id = Number((request.params as { id: string }).id)
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [id])
    if (!result.rows[0]) throw notFound('Customer')
    return mapCustomer(result.rows[0])
  })

  app.post('/api/customers', async (request, reply) => {
    const body = (request.body ?? {}) as {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string | null
    }
    if (!body.email || !body.firstName || !body.lastName) {
      throw validationError('Email, first name, and last name are required')
    }
    try {
      const result = await pool.query(
        `INSERT INTO customers (email, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [body.email.trim(), body.firstName.trim(), body.lastName.trim(), body.phone ?? null],
      )
      return reply.status(201).send(mapCustomer(result.rows[0]))
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'EMAIL_EXISTS', 'A customer with this email already exists')
      }
      throw err
    }
  })

  app.patch('/api/customers/:id', async (request) => {
    const id = Number((request.params as { id: string }).id)
    const body = (request.body ?? {}) as {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string | null
      archived?: boolean
      version?: number
    }
    if (typeof body.version !== 'number') {
      throw validationError('version is required')
    }

    const existing = await pool.query('SELECT * FROM customers WHERE id = $1', [id])
    if (!existing.rows[0]) throw notFound('Customer')

    const next = {
      email: body.email ?? existing.rows[0].email,
      first_name: body.firstName ?? existing.rows[0].first_name,
      last_name: body.lastName ?? existing.rows[0].last_name,
      phone: body.phone === undefined ? existing.rows[0].phone : body.phone,
      archived: body.archived ?? existing.rows[0].archived,
    }

    try {
      const result = await pool.query(
        `UPDATE customers
         SET email = $1, first_name = $2, last_name = $3, phone = $4, archived = $5,
             version = version + 1, updated_at = NOW()
         WHERE id = $6 AND version = $7
         RETURNING *`,
        [next.email, next.first_name, next.last_name, next.phone, next.archived, id, body.version],
      )
      if (!result.rows[0]) {
        const current = await pool.query('SELECT version FROM customers WHERE id = $1', [id])
        throw new ApiError(409, 'VERSION_CONFLICT', 'Customer was changed by another user', {
          currentVersion: current.rows[0]?.version,
        })
      }
      return mapCustomer(result.rows[0])
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'EMAIL_EXISTS', 'A customer with this email already exists')
      }
      throw err
    }
  })

  app.delete('/api/customers/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const existing = await pool.query('SELECT id FROM customers WHERE id = $1', [id])
    if (!existing.rows[0]) throw notFound('Customer')

    const orders = await pool.query('SELECT 1 FROM orders WHERE customer_id = $1 LIMIT 1', [id])
    if (orders.rows[0]) {
      throw new ApiError(
        409,
        'CUSTOMER_HAS_ORDERS',
        'Customers with order history cannot be deleted. Archive the customer instead.',
      )
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [id])
    return reply.status(204).send()
  })

  app.get('/api/customers/:customerId/addresses', async (request) => {
    const customerId = Number((request.params as { customerId: string }).customerId)
    const customer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId])
    if (!customer.rows[0]) throw notFound('Customer')
    const result = await pool.query(
      `SELECT ${ADDRESS_SELECT}
       FROM customer_addresses a
       JOIN regions r ON r.id = a.region_id
       JOIN countries c ON c.code = a.country_code
       WHERE a.customer_id = $1
       ORDER BY a.id`,
      [customerId],
    )
    return result.rows.map(mapAddress)
  })

  app.post('/api/customers/:customerId/addresses', async (request, reply) => {
    const customerId = Number((request.params as { customerId: string }).customerId)
    const customer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId])
    if (!customer.rows[0]) throw notFound('Customer')
    const address = await insertAddress(customerId, request.body)
    return reply.status(201).send(address)
  })

  app.patch('/api/customers/:customerId/addresses/:addressId', async (request) => {
    const { customerId, addressId } = request.params as { customerId: string; addressId: string }
    const existing = await pool.query(
      'SELECT * FROM customer_addresses WHERE id = $1 AND customer_id = $2',
      [Number(addressId), Number(customerId)],
    )
    if (!existing.rows[0]) throw notFound('Address')
    return updateAddress(existing.rows[0], request.body)
  })
}

async function insertAddress(customerId: number, raw: unknown) {
  const body = parseAddressBody(raw)
  await assertRegionMatchesCountry(body.regionId, body.countryCode)
  const inserted = await pool.query(
    `INSERT INTO customer_addresses
       (customer_id, label, line1, line2, city, region_id, postal_code, country_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [customerId, body.label, body.line1, body.line2, body.city, body.regionId, body.postalCode, body.countryCode],
  )
  return loadAddress(inserted.rows[0].id)
}

async function updateAddress(existing: Record<string, unknown>, raw: unknown) {
  const body = parseAddressBody(raw, existing)
  await assertRegionMatchesCountry(body.regionId, body.countryCode)
  await pool.query(
    `UPDATE customer_addresses
     SET label = $1, line1 = $2, line2 = $3, city = $4, region_id = $5,
         postal_code = $6, country_code = $7, updated_at = NOW()
     WHERE id = $8`,
    [body.label, body.line1, body.line2, body.city, body.regionId, body.postalCode, body.countryCode, existing.id],
  )
  return loadAddress(Number(existing.id))
}

async function loadAddress(id: number) {
  const result = await pool.query(
    `SELECT ${ADDRESS_SELECT}
     FROM customer_addresses a
     JOIN regions r ON r.id = a.region_id
     JOIN countries c ON c.code = a.country_code
     WHERE a.id = $1`,
    [id],
  )
  return mapAddress(result.rows[0])
}

function parseAddressBody(raw: unknown, existing?: Record<string, unknown>) {
  const body = (raw ?? {}) as Record<string, unknown>
  const label = String(body.label ?? existing?.label ?? '').trim()
  const line1 = String(body.line1 ?? existing?.line1 ?? '').trim()
  const city = String(body.city ?? existing?.city ?? '').trim()
  const postalCode = String(body.postalCode ?? existing?.postal_code ?? '').trim()
  const countryCode = String(body.countryCode ?? existing?.country_code ?? '').trim()
  const regionId = Number(body.regionId ?? existing?.region_id)
  const line2Raw = body.line2 === undefined ? existing?.line2 : body.line2
  if (!label || !line1 || !city || !postalCode || !countryCode || !Number.isInteger(regionId)) {
    throw validationError('label, line1, city, regionId, postalCode, and countryCode are required')
  }
  return {
    label,
    line1,
    line2: line2Raw == null || line2Raw === '' ? null : String(line2Raw),
    city,
    regionId,
    postalCode,
    countryCode,
  }
}

async function assertRegionMatchesCountry(regionId: number, countryCode: string) {
  const result = await pool.query('SELECT country_code FROM regions WHERE id = $1', [regionId])
  if (!result.rows[0]) throw validationError('Unknown region')
  if (result.rows[0].country_code !== countryCode) {
    throw validationError('Region does not belong to the selected country')
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
