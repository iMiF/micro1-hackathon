import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/summary', async (request) => {
    const period = String((request.query as { period?: string }).period ?? '30d')
    const days = period.endsWith('d') ? Number(period.slice(0, -1)) : 30
    const windowDays = Number.isFinite(days) && days > 0 ? days : 30

    const revenue = await pool.query(
      `SELECT COALESCE(SUM(total_cents), 0)::int AS revenue_cents,
              COUNT(*)::int AS order_count
       FROM orders
       WHERE created_at >= NOW() - ($1 || ' days')::interval
         AND payment_status = 'paid'
         AND status_id NOT IN (10, 50)`,
      [String(windowDays)],
    )
    const customers = await pool.query(
      `SELECT COUNT(*)::int AS customer_count FROM customers WHERE archived = FALSE`,
    )
    const byStatus = await pool.query(
      `SELECT status_id, COUNT(*)::int AS count
       FROM orders
       WHERE created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY status_id
       ORDER BY status_id`,
      [String(windowDays)],
    )

    return {
      revenueCents: revenue.rows[0].revenue_cents,
      orderCount: revenue.rows[0].order_count,
      customerCount: customers.rows[0].customer_count,
      ordersByStatus: byStatus.rows.map((row) => ({
        statusId: row.status_id,
        count: row.count,
      })),
    }
  })
}
