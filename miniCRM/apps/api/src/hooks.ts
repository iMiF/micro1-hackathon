import type { FastifyInstance, FastifyRequest } from 'fastify'
import { csrfInvalid, unauthenticated } from './errors.ts'
import { COOKIE_NAME, getSession, type SessionUser } from './session.ts'

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser | null
    csrfToken: string | null
  }
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const CSRF_EXEMPT = new Set(['POST /api/auth/login'])

export async function registerAuthHooks(app: FastifyInstance): Promise<void> {
  app.decorateRequest('currentUser', null)
  app.decorateRequest('csrfToken', null)

  app.addHook('preHandler', async (request: FastifyRequest) => {
    const session = getSession(request.cookies[COOKIE_NAME])
    request.currentUser = session?.user ?? null
    request.csrfToken = session?.csrfToken ?? null

    if (!request.url.startsWith('/api')) {
      return
    }

    const path = request.url.split('?')[0] ?? request.url
    const routeKey = `${request.method} ${path}`
    const isLogin = routeKey === 'POST /api/auth/login'

    if (!isLogin && !request.currentUser) {
      throw unauthenticated()
    }

    if (MUTATING_METHODS.has(request.method) && !CSRF_EXEMPT.has(routeKey) && !isLogin) {
      const header = request.headers['x-csrf-token']
      const token = Array.isArray(header) ? header[0] : header
      if (!token || token !== request.csrfToken) {
        throw csrfInvalid()
      }
    }
  })
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.currentUser) {
    throw unauthenticated()
  }
  return request.currentUser
}
