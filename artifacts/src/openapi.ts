import { DISCLAIMER } from './disclaimer.js'
import { expandPathPlaceholders } from './paths.js'
import { rewriteRefs } from './refs.js'
import type { Evidence, Operation, Parameter, Reconstruction } from './types.js'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

export interface OpenApiDocument {
  openapi: '3.1.0'
  info: {
    title: string
    description: string
    version: string
  }
  'x-aae-disclaimer': string
  'x-aae-confidence'?: Record<string, number>
  'x-aae-reconstructed-at'?: string
  tags?: { name: string }[]
  paths: Record<string, Record<string, unknown>>
  components?: {
    schemas?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
}

export function toOpenApi(doc: Reconstruction): OpenApiDocument {
  const title = doc.benchmark_name ? `${doc.benchmark_name} API (draft)` : 'Reconstructed API (draft)'
  const descriptionParts = [DISCLAIMER]
  if (doc.notes) descriptionParts.push(doc.notes)
  const oas: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title,
      description: descriptionParts.join('\n\n'),
      version: doc.schema_version ?? '0.1.0-draft',
    },
    'x-aae-disclaimer': DISCLAIMER,
    paths: {},
  }
  if (doc.confidence) oas['x-aae-confidence'] = doc.confidence
  if (doc.reconstructed_at) oas['x-aae-reconstructed-at'] = doc.reconstructed_at

  const tagSet = new Set<string>()
  const securitySchemes: Record<string, unknown> = {}

  for (const op of doc.operations) {
    const path = expandPathPlaceholders(op.path, op.parameters)
    const method = op.method.toLowerCase()
    if (!HTTP_METHODS.has(method)) continue
    const tag = tagFromPath(path)
    if (tag) tagSet.add(tag)
    const item = operationItem(op, tag)
    const existing = oas.paths[path] ?? {}
    existing[method] = item
    oas.paths[path] = existing
    addSecurityScheme(securitySchemes, op.authentication)
  }

  if (tagSet.size > 0) {
    oas.tags = [...tagSet].sort().map((name) => ({ name }))
  }

  const schemas = rewriteComponentMap(doc.components)
  const components: NonNullable<OpenApiDocument['components']> = {}
  if (schemas && Object.keys(schemas).length > 0) components.schemas = schemas
  if (Object.keys(securitySchemes).length > 0) components.securitySchemes = securitySchemes
  if (Object.keys(components).length > 0) oas.components = components

  return oas
}

function rewriteComponentMap(components: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!components) return undefined
  const out: Record<string, unknown> = {}
  for (const [name, schema] of Object.entries(components)) {
    out[name] = rewriteRefs(schema)
  }
  return out
}

function operationItem(op: Operation, tag: string | undefined): Record<string, unknown> {
  const item: Record<string, unknown> = {}
  if (op.id) item.operationId = op.id
  if (op.summary) item.summary = op.summary
  if (tag) item.tags = [tag]
  const parameters = (op.parameters ?? []).map(toOasParameter).filter((p): p is Record<string, unknown> => p != null)
  if (parameters.length > 0) item.parameters = parameters
  const body = requestBody(op.request_schema)
  if (body) item.requestBody = body
  item.responses = responses(op)
  const security = securityRequirement(op.authentication)
  if (security) item.security = security
  if (op.authentication) item['x-authentication'] = op.authentication
  if (op.confidence != null) item['x-confidence'] = op.confidence
  if (op.evidence) item['x-evidence'] = op.evidence.map(compactEvidence)
  return item
}

function toOasParameter(param: Parameter): Record<string, unknown> | null {
  const location = param.location
  if (location !== 'path' && location !== 'query' && location !== 'header' && location !== 'cookie') return null
  const schema: Record<string, unknown> = {}
  if (param.type && param.type !== 'unknown') schema.type = param.type
  if (param.enum) schema.enum = param.enum
  if ('default' in param) schema.default = param.default
  const out: Record<string, unknown> = {
    name: param.name,
    in: location,
    schema,
  }
  if (location === 'path' || param.required === true) out.required = true
  else if (param.required === false) out.required = false
  if (param.description) out.description = param.description
  if (param.confidence != null) out['x-confidence'] = param.confidence
  return out
}

function requestBody(schema: unknown): Record<string, unknown> | undefined {
  if (schema == null) return undefined
  return {
    content: {
      'application/json': {
        schema: rewriteRefs(schema),
      },
    },
  }
}

function responses(op: Operation): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (op.success_status != null || op.response_schema != null) {
    const key = op.success_status != null ? String(op.success_status) : 'default'
    const body: Record<string, unknown> = { description: '' }
    if (op.response_schema != null) {
      body.content = {
        'application/json': { schema: rewriteRefs(op.response_schema) },
      }
    }
    out[key] = body
  }
  for (const err of op.error_responses ?? []) {
    const body: Record<string, unknown> = {
      description: err.message ?? err.code ?? '',
    }
    if (err.schema != null) {
      body.content = {
        'application/json': { schema: rewriteRefs(err.schema) },
      }
    }
    if (err.code) body['x-error-code'] = err.code
    out[String(err.status)] = body
  }
  if (Object.keys(out).length === 0) {
    out.default = { description: '' }
  }
  return out
}

function tagFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean)
  // /api/<resource>/...
  const resource = parts[0] === 'api' ? parts[1] : parts[0]
  if (!resource || resource.startsWith('{')) return undefined
  return resource
}

function addSecurityScheme(schemes: Record<string, unknown>, authentication: string | undefined): void {
  if (!authentication || authentication === 'none') return
  if (schemes[authentication]) return
  const cookieLike = /cookie|session/i.test(authentication)
  if (cookieLike) {
    schemes[authentication] = {
      type: 'apiKey',
      in: 'cookie',
      name: authentication,
    }
    return
  }
  schemes[authentication] = {
    type: 'apiKey',
    in: 'header',
    name: authentication,
  }
}

function securityRequirement(authentication: string | undefined): Record<string, unknown[]>[] | undefined {
  if (!authentication || authentication === 'none') return undefined
  return [{ [authentication]: [] }]
}

function compactEvidence(ev: Evidence): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (ev.kind) out.kind = ev.kind
  if (ev.page) out.page = ev.page
  if (ev.method) out.method = ev.method
  if (ev.path) out.path = ev.path
  if (ev.status != null) out.status = ev.status
  if (ev.json_paths) out.json_paths = ev.json_paths
  if (ev.header) out.header = ev.header
  if (ev.cookie_name) out.cookie_name = ev.cookie_name
  if (ev.ui_text) out.ui_text = ev.ui_text
  if (ev.note) out.note = ev.note
  return out
}
