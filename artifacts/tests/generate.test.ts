import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DISCLAIMER } from '../src/disclaimer.js'
import { generateArtifacts } from '../src/generate.js'
import { toMarkdown } from '../src/markdown.js'
import { toOpenApi, type OpenApiDocument } from '../src/openapi.js'
import { expandPathPlaceholders } from '../src/paths.js'
import { parseReconstruction } from '../src/types.js'
import { resolveRunDir } from '../src/rundir.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function emptyDoc(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    operations: [],
    semantic_facts: [],
    dependencies: [],
    workflows: [],
    claims: [],
    ...overrides,
  }
}

function countOperations(oas: OpenApiDocument): number {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
  let n = 0
  for (const item of Object.values(oas.paths)) {
    for (const method of methods) {
      if (item[method]) n += 1
    }
  }
  return n
}

test('empty document yields valid OpenAPI with no paths and a disclaimer', () => {
  const oas = toOpenApi(parseReconstruction(emptyDoc()))
  assert.equal(oas.openapi, '3.1.0')
  assert.deepEqual(oas.paths, {})
  assert.equal(oas['x-aae-disclaimer'], DISCLAIMER)
  assert.ok(oas.info.description.includes(DISCLAIMER))
  assert.equal(oas.info.title, 'Reconstructed API (draft)')
  const md = toMarkdown(parseReconstruction(emptyDoc()))
  assert.ok(md.includes(DISCLAIMER))
  assert.ok(md.includes('human review required'))
})

test('/api/customers/{} plus path param id becomes /api/customers/{id}', () => {
  assert.equal(
    expandPathPlaceholders('/api/customers/{}', [{ name: 'id', location: 'path' }]),
    '/api/customers/{id}',
  )
  const oas = toOpenApi(
    parseReconstruction(
      emptyDoc({
        operations: [
          {
            method: 'GET',
            path: '/api/customers/{}',
            parameters: [{ name: 'id', location: 'path', required: true, type: 'integer' }],
          },
        ],
      }),
    ),
  )
  assert.ok(oas.paths['/api/customers/{id}'])
  assert.equal(oas.paths['/api/customers/{}'], undefined)
})

test('does not invent fields that were not in the reconstruction', () => {
  const oas = toOpenApi(
    parseReconstruction(
      emptyDoc({
        operations: [{ method: 'GET', path: '/api/ping' }],
      }),
    ),
  )
  const get = oas.paths['/api/ping']?.get as Record<string, unknown>
  assert.ok(get)
  assert.equal('summary' in get, false)
  assert.equal('description' in get, false)
  assert.equal('requestBody' in get, false)
  assert.equal('operationId' in get, false)
  assert.equal('x-confidence' in get, false)
  assert.equal('x-authentication' in get, false)
  assert.equal('x-aae-confidence' in oas, false)
  assert.equal('x-aae-reconstructed-at' in oas, false)
  assert.equal(oas.components, undefined)
})

test('operations table omits empty optional columns and shows recorded status and evidence', () => {
  const md = toMarkdown(
    parseReconstruction(
      emptyDoc({
        operations: [
          {
            method: 'GET',
            path: '/api/ping',
            success_status: 200,
            evidence: [{ kind: 'network_response', status: 200 }],
          },
        ],
      }),
    ),
  )
  assert.ok(md.includes('| Method | Path | Status | Evidence |'))
  assert.equal(md.includes('| Summary |'), false)
  assert.equal(md.includes('| Auth |'), false)
  assert.ok(md.includes('| GET | `/api/ping` | 200 | network_response |'))
})

test('operations table includes summary when the reconstruction recorded it', () => {
  const md = toMarkdown(
    parseReconstruction(
      emptyDoc({
        operations: [{ method: 'POST', path: '/api/auth/login', summary: 'Create a session' }],
      }),
    ),
  )
  assert.ok(md.includes('| Summary |'))
  assert.ok(md.includes('Create a session'))
})

test('perfect-reconstruction.json yields 26 operations in paths', () => {
  const raw = JSON.parse(
    readFileSync(join(ROOT, 'miniCRM/benchmark/examples/perfect-reconstruction.json'), 'utf8'),
  ) as unknown
  const doc = parseReconstruction(raw)
  assert.equal(doc.operations.length, 26)
  const oas = toOpenApi(doc)
  assert.equal(countOperations(oas), 26)
  assert.ok(oas.paths['/api/customers/{id}'])
  assert.ok(oas.components?.schemas?.AuthSession)
  const getCustomer = oas.paths['/api/customers/{id}']?.get as Record<string, unknown>
  const responses = getCustomer.responses as Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }>
  const ref = responses['200']?.content?.['application/json']?.schema?.$ref
  assert.equal(ref, '#/components/schemas/Customer')
})

test('Path A AAE reconstruction writes files and markdown contains a recorded user_goal', () => {
  const raw = JSON.parse(
    readFileSync(join(ROOT, 'results/runs/aae-2026-08-31T14-51-18-382Z/reconstruction.json'), 'utf8'),
  ) as unknown
  const dir = mkdtempSync(join(tmpdir(), 'aae-artifacts-'))
  try {
    const result = generateArtifacts({ submission: raw, outDir: dir })
    const openapi = JSON.parse(readFileSync(result.openapiPath, 'utf8')) as OpenApiDocument
    const markdown = readFileSync(result.markdownPath, 'utf8')
    assert.equal(openapi.openapi, '3.1.0')
    assert.ok(countOperations(openapi) > 0)
    assert.ok(markdown.includes(DISCLAIMER))
    assert.ok(markdown.includes('View a customer and their addresses'))
    assert.ok(markdown.includes('```mermaid'))
    assert.ok(markdown.includes('| Method | Path | Status | Evidence |'))
    assert.equal(markdown.includes('| Summary |'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveRunDir accepts a bare run-id under results/runs/', () => {
  const dir = resolveRunDir('aae-2026-08-31T14-51-18-382Z')
  assert.ok(dir.endsWith('aae-2026-08-31T14-51-18-382Z'))
  assert.equal(resolveRunDir(join('results', 'runs', 'aae-2026-08-31T14-51-18-382Z')), dir)
})
