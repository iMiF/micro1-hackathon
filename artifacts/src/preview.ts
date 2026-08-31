import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import https from 'node:https'
import { DISCLAIMER } from './disclaimer.js'
import {
  findEntry,
  listCatalog,
  loadMarkdown,
  loadOpenApi,
  publicCatalog,
  type CatalogOptions,
} from './catalog.js'
import type { OpenApiDocument } from './openapi.js'
import { previewPageHtml } from './preview-page.js'

export interface PreviewOptions extends CatalogOptions {
  host?: string
  port?: number
  initialId?: string
  /** Origin of the live MiniCRM API, proxied at /live so Try it out stays same-origin. */
  target?: string
}

export interface PreviewServer {
  url: string
  host: string
  port: number
  server: Server
  close: () => Promise<void>
}

const LIVE_PATH = '/live'

export function createPreviewHandler(options: PreviewOptions = {}) {
  const catalogOptions: CatalogOptions = {
    root: options.root,
    includeReference: options.includeReference,
  }
  const target = options.target ?? 'http://127.0.0.1:3000'
  const targetOrigin = new URL(target).origin

  return function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const catalog = listCatalog(catalogOptions)
        const initial = findEntry(catalog, options.initialId ?? url.searchParams.get('run') ?? undefined)
        send(
          res,
          200,
          'text/html; charset=utf-8',
          previewPageHtml({
            catalog: publicCatalog(catalog),
            initialId: initial?.id ?? '',
            livePath: LIVE_PATH,
          }),
        )
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/catalog') {
        sendJson(res, 200, publicCatalog(listCatalog(catalogOptions)))
        return
      }
      const specMatch = url.pathname.match(/^\/api\/specs\/([^/]+)\/(openapi\.json|API\.md)$/)
      if (req.method === 'GET' && specMatch) {
        const id = decodeURIComponent(specMatch[1] ?? '')
        const file = specMatch[2]
        const entry = findEntry(listCatalog(catalogOptions), id)
        if (!entry || entry.id !== id) {
          sendJson(res, 404, { error: `unknown artifact "${id}"` })
          return
        }
        if (file === 'openapi.json') {
          sendJson(res, 200, withPreviewServer(loadOpenApi(entry), LIVE_PATH))
          return
        }
        send(res, 200, 'text/markdown; charset=utf-8', loadMarkdown(entry))
        return
      }
      if (url.pathname === LIVE_PATH || url.pathname.startsWith(`${LIVE_PATH}/`)) {
        proxyLive(req, res, targetOrigin, url.pathname.slice(LIVE_PATH.length) || '/', url.search)
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendJson(res, 500, { error: message })
    }
  }
}

export async function startPreview(options: PreviewOptions = {}): Promise<PreviewServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8090
  const handler = createPreviewHandler(options)
  const server = http.createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  const address = server.address()
  const bound = typeof address === 'object' && address ? address.port : port
  const url = `http://${host}:${bound}/`
  return {
    url,
    host,
    port: bound,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

function withPreviewServer(
  doc: OpenApiDocument,
  livePath: string,
): OpenApiDocument & { servers: { url: string; description: string }[] } {
  return {
    ...doc,
    servers: [
      {
        url: livePath,
        description: `Preview proxy to the local target. Not part of the reconstruction. ${DISCLAIMER}`,
      },
    ],
  }
}

function proxyLive(
  req: IncomingMessage,
  res: ServerResponse,
  targetOrigin: string,
  path: string,
  search: string,
): void {
  const dest = new URL(path + search, targetOrigin)
  if (dest.origin !== targetOrigin) {
    sendJson(res, 400, { error: 'invalid proxy path' })
    return
  }
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (key === 'host' || key === 'connection') continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  headers.host = new URL(targetOrigin).host
  const lib = dest.protocol === 'https:' ? https : http
  const upstream = lib.request({
    protocol: dest.protocol,
    hostname: dest.hostname,
    port: dest.port,
    path: dest.pathname + dest.search,
    method: req.method ?? 'GET',
    headers,
  })
  upstream.on('error', (err) => {
    if (res.headersSent) {
      res.end()
      return
    }
    sendJson(res, 502, { error: `target not reachable at ${targetOrigin}: ${err.message}` })
  })
  upstream.on('response', (up) => {
    const outHeaders = { ...up.headers }
    delete outHeaders['transfer-encoding']
    res.writeHead(up.statusCode ?? 502, outHeaders)
    up.pipe(res)
  })
  req.pipe(upstream)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body, null, 2) + '\n')
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  const buf = Buffer.from(body)
  res.writeHead(status, {
    'content-type': type,
    'content-length': buf.length,
    'cache-control': 'no-store',
  })
  res.end(buf)
}
