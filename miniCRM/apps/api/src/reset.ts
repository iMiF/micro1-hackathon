import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, waitForDatabase } from './db.ts'
import { seedDatabase } from './seed.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')
const migrationsDir = join(repoRoot, 'db/migrations')

export async function resetDatabase(): Promise<void> {
  await waitForDatabase()
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  await pool.query('GRANT ALL ON SCHEMA public TO minicrm')
  await pool.query('GRANT ALL ON SCHEMA public TO public')

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8')
    await pool.query(sql)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await seedDatabase(client)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
