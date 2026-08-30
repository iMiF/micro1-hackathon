import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { ApiError } from './errors.ts'
import { registerAuthHooks } from './hooks.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerCustomerRoutes } from './routes/customers.ts'
import { registerDashboardRoutes } from './routes/dashboard.ts'
import { registerGeoRoutes } from './routes/geo.ts'
import { registerOrderRoutes } from './routes/orders.ts'
import { registerProductRoutes } from './routes/products.ts'
import { registerQuoteRoutes } from './routes/quotes.ts'
import { registerShippingRoutes } from './routes/shipping.ts'

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  await app.register(cookie)
  await registerAuthHooks(app)
  await registerAuthRoutes(app)
  await registerCustomerRoutes(app)
  await registerProductRoutes(app)
  await registerGeoRoutes(app)
  await registerDashboardRoutes(app)
  await registerShippingRoutes(app)
  await registerQuoteRoutes(app)
  await registerOrderRoutes(app)

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(err.toJSON())
    }
    request.log.error(err)
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found' })
  })

  return app
}
