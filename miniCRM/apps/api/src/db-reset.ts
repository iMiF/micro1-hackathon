import { resetDatabase } from './reset.ts'
import { pool } from './db.ts'

try {
  await resetDatabase()
  console.log('Database reset complete')
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await pool.end()
}
