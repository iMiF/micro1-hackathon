import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DISCLAIMER } from '../src/disclaimer.js'
import { findEntry, listCatalog, loadOpenApi, REFERENCE_ID } from '../src/catalog.js'
import { startPreview } from '../src/preview.js'

function fakeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aae-preview-'))
  const run = join(root, 'results', 'runs', 'aae-2026-08-31T14-51-18-382Z')
  mkdirSync(join(run, 'artifacts'), { recursive: true })
  writeFileSync(
    join(run, 'reconstruction.json'),
    JSON.stringify({
      schema_version: '1.0.0',
      reconstructed_at: '2026-08-31T14:51:18.382Z',
      operations: [{ method: 'GET', path: '/api/ping' }],
      semantic_facts: [],
      dependencies: [],
      workflows: [],
      claims: [],
    }) + '\n',
  )
  writeFileSync(
    join(run, 'artifacts', 'openapi.json'),
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Draft', description: DISCLAIMER, version: '1.0.0' },
      paths: { '/api/ping': { get: { responses: { default: { description: '' } } } } },
    }) + '\n',
  )
  writeFileSync(join(run, 'artifacts', 'API.md'), `# API reconstruction\n\n${DISCLAIMER}\n`)
  writeFileSync(join(run, 'meta.json'), JSON.stringify({ system: 'aae', model: 'openai/gpt-5.6-sol' }) + '\n')
  writeFileSync(join(run, 'evaluation.json'), JSON.stringify({ VARS: 71.214285714 }) + '\n')
  mkdirSync(join(root, 'miniCRM', 'benchmark', 'examples'), { recursive: true })
  writeFileSync(
    join(root, 'miniCRM', 'benchmark', 'examples', 'perfect-reconstruction.json'),
    JSON.stringify({
      schema_version: '1.0.0',
      operations: [
        { method: 'GET', path: '/api/a' },
        { method: 'POST', path: '/api/b' },
      ],
      semantic_facts: [],
      dependencies: [],
      workflows: [],
      claims: [],
    }) + '\n',
  )
  return root
}

test('catalog lists runs with VARS/model labels and the reference example last', () => {
  const root = fakeRoot()
  try {
    const entries = listCatalog({ root })
    assert.equal(entries.length, 2)
    assert.equal(entries[0]?.id, 'aae-2026-08-31T14-51-18-382Z')
    assert.ok(entries[0]?.label.includes('VARS 71.21'))
    assert.ok(entries[0]?.label.includes('gpt-5.6-sol'))
    assert.equal(entries[0]?.operations, 1)
    assert.equal(entries[1]?.id, REFERENCE_ID)
    assert.equal(entries[1]?.kind, 'reference')
    assert.equal(entries[1]?.operations, 2)
    const older = join(root, 'results', 'runs', 'baseline-2026-08-31T05-55-35-991Z')
    mkdirSync(older, { recursive: true })
    writeFileSync(
      join(older, 'reconstruction.json'),
      JSON.stringify({
        schema_version: '1.0.0',
        reconstructed_at: '2026-08-31T05:55:35.991Z',
        operations: [{ method: 'GET', path: '/api/x' }],
        semantic_facts: [],
        dependencies: [],
        workflows: [],
        claims: [],
      }) + '\n',
    )
    assert.deepEqual(
      listCatalog({ root, includeReference: false }).map((e) => e.id),
      ['aae-2026-08-31T14-51-18-382Z', 'baseline-2026-08-31T05-55-35-991Z'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preview serves catalog, selected OpenAPI with a proxy server, markdown, and rejects unknown ids', async () => {
  const root = fakeRoot()
  const preview = await startPreview({
    root,
    port: 0,
    includeReference: true,
    initialId: 'aae-2026-08-31T14-51-18-382Z',
    target: 'http://127.0.0.1:1',
  })
  try {
    const catalog = await (await fetch(`${preview.url}api/catalog`)).json() as { id: string }[]
    assert.deepEqual(catalog.map((e) => e.id), ['aae-2026-08-31T14-51-18-382Z', REFERENCE_ID])

    const page = await (await fetch(preview.url)).text()
    assert.ok(page.includes('swagger-ui'))
    assert.ok(page.includes(DISCLAIMER))
    assert.ok(page.includes('spec-select'))

    const oas = await (await fetch(`${preview.url}api/specs/aae-2026-08-31T14-51-18-382Z/openapi.json`)).json() as {
      openapi: string
      paths: Record<string, unknown>
      servers: { url: string }[]
    }
    assert.equal(oas.openapi, '3.1.0')
    assert.ok(oas.paths['/api/ping'])
    assert.equal(oas.servers[0]?.url, '/live')
    assert.equal('servers' in loadOpenApi(findEntry(listCatalog({ root }), 'aae-2026-08-31T14-51-18-382Z')!), false)

    const md = await (await fetch(`${preview.url}api/specs/aae-2026-08-31T14-51-18-382Z/API.md`)).text()
    assert.ok(md.includes(DISCLAIMER))

    const missing = await fetch(`${preview.url}api/specs/no-such-run/openapi.json`)
    assert.equal(missing.status, 404)

    const traversal = await fetch(`${preview.url}api/specs/${encodeURIComponent('../secret')}/openapi.json`)
    assert.equal(traversal.status, 404)

    const live = await fetch(`${preview.url}live/api/ping`)
    assert.equal(live.status, 502)
  } finally {
    await preview.close()
    rmSync(root, { recursive: true, force: true })
  }
})
