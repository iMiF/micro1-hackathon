import type { FastifyInstance } from 'fastify'
import { pool } from '../db.ts'
import { ApiError, validationError } from '../errors.ts'
import { verifyPassword } from '../password.ts'
import { COOKIE_NAME, COOKIE_OPTIONS, createSession, destroySession } from '../session.ts'
import { requireUser } from '../hooks.ts'

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as { email?: string; password?: string }
    if (!body.email || !body.password) {
      throw validationError('Email and password are required')
    }

    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM staff_users WHERE email = $1',
      [body.email],
    )
    const user = result.rows[0]
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const publicUser = { id: user.id, name: user.name, email: user.email }
    const { sid, session } = createSession(publicUser)
    reply.setCookie(COOKIE_NAME, sid, COOKIE_OPTIONS)
    return { user: publicUser, csrfToken: session.csrfToken }
  })

  app.get('/api/auth/session', async (request) => {
    const user = requireUser(request)
    return { user, csrfToken: request.csrfToken }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    destroySession(request.cookies[COOKIE_NAME])
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return reply.status(204).send()
  })
}
