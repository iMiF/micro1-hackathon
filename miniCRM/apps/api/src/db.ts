import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://minicrm:minicrm@127.0.0.1:15432/minicrm',
})

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function isAuthError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '28P01'
}

export async function waitForDatabase(attempts = 40): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (err) {
      lastError = err
      if (isAuthError(err)) {
        throw new Error(
          'Database authentication failed on 127.0.0.1:15432. That is not "not ready": something else is probably bound to the port, not miniCRM/docker-compose.yml. ' +
            String(err),
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Database is not ready: ${String(lastError)}`)
}
