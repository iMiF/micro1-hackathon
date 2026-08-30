import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'

export async function registerGeoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/countries', async () => {
    const result = await pool.query('SELECT code, name FROM countries ORDER BY name')
    return result.rows.map((row) => ({ code: row.code, name: row.name }))
  })

  app.get('/api/regions', async (request) => {
    const country = String((request.query as { country?: string }).country ?? '').trim()
    if (!country) {
      return []
    }
    const result = await pool.query(
      `SELECT id, country_code, code, name
       FROM regions
       WHERE country_code = $1
       ORDER BY name`,
      [country],
    )
    return result.rows.map((row) => ({
      id: row.id,
      countryCode: row.country_code,
      code: row.code,
      name: row.name,
    }))
  })
}
