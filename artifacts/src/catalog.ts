import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toMarkdown } from './markdown.js'
import { toOpenApi, type OpenApiDocument } from './openapi.js'
import { parseReconstruction } from './types.js'

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const REFERENCE_ID = 'reference-perfect'

export interface CatalogEntry {
  id: string
  label: string
  kind: 'run' | 'reference'
  system: string | null
  model: string | null
  vars: number | null
  reconstructedAt: string | null
  operations: number | null
  reconstructionPath: string | null
  openapiPath: string | null
  markdownPath: string | null
}

export interface CatalogOptions {
  root?: string
  includeReference?: boolean
}

/**
 * List reconstructed specs a human can open in the preview.
 * Does not invent facts: it only points at reconstruction.json / artifacts/ on disk
 * and, optionally, the committed perfect-reconstruction example.
 */
export function listCatalog(options: CatalogOptions = {}): CatalogEntry[] {
  const root = options.root ?? PROJECT_ROOT
  const includeReference = options.includeReference !== false
  const entries: CatalogEntry[] = []
  const runsDir = join(root, 'results', 'runs')
  if (existsSync(runsDir)) {
    for (const name of readdirSync(runsDir)) {
      const dir = join(runsDir, name)
      try {
        if (!statSync(dir).isDirectory()) continue
      } catch {
        continue
      }
      const reconstructionPath = join(dir, 'reconstruction.json')
      const openapiPath = join(dir, 'artifacts', 'openapi.json')
      const markdownPath = join(dir, 'artifacts', 'API.md')
      const hasRecon = existsSync(reconstructionPath)
      const hasOpenApi = existsSync(openapiPath)
      if (!hasRecon && !hasOpenApi) continue
      entries.push(entryFromRun({ dir, name, reconstructionPath: hasRecon ? reconstructionPath : null, openapiPath: hasOpenApi ? openapiPath : null, markdownPath: existsSync(markdownPath) ? markdownPath : null }))
    }
  }
  entries.sort(compareEntries)
  if (includeReference) {
    const reconstructionPath = join(root, 'miniCRM', 'benchmark', 'examples', 'perfect-reconstruction.json')
    if (existsSync(reconstructionPath)) {
      const operations = countOperations(reconstructionPath, null)
      entries.push({
        id: REFERENCE_ID,
        label: formatLabel({
          system: 'reference',
          vars: 100,
          model: null,
          reconstructedAt: null,
          operations,
          kind: 'reference',
        }),
        kind: 'reference',
        system: 'reference',
        model: null,
        vars: 100,
        reconstructedAt: null,
        operations,
        reconstructionPath,
        openapiPath: null,
        markdownPath: null,
      })
    }
  }
  return entries
}

export function findEntry(entries: CatalogEntry[], id: string | undefined): CatalogEntry | undefined {
  if (!id) return entries.find((e) => e.kind === 'run') ?? entries[0]
  return entries.find((e) => e.id === id)
}

export function loadOpenApi(entry: CatalogEntry): OpenApiDocument {
  if (entry.openapiPath && existsSync(entry.openapiPath)) {
    return JSON.parse(readFileSync(entry.openapiPath, 'utf8')) as OpenApiDocument
  }
  return toOpenApi(parseReconstruction(readJson(entry.reconstructionPath, entry.id)))
}

export function loadMarkdown(entry: CatalogEntry): string {
  if (entry.markdownPath && existsSync(entry.markdownPath)) {
    return readFileSync(entry.markdownPath, 'utf8')
  }
  return toMarkdown(parseReconstruction(readJson(entry.reconstructionPath, entry.id)))
}

function readJson(path: string | null, id: string): unknown {
  if (!path || !existsSync(path)) {
    throw new Error(`no reconstruction for "${id}"`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function entryFromRun(input: {
  dir: string
  name: string
  reconstructionPath: string | null
  openapiPath: string | null
  markdownPath: string | null
}): CatalogEntry {
  const meta = readObject(join(input.dir, 'meta.json'))
  const evaluation = readObject(join(input.dir, 'evaluation.json'))
  const reconstruction = input.reconstructionPath ? readObject(input.reconstructionPath) : null
  const system = stringField(meta, 'system') ?? systemFromId(input.name)
  const model = stringField(meta, 'model')
  const vars = numberField(evaluation, 'VARS')
  const reconstructedAt =
    stringField(reconstruction, 'reconstructed_at') ?? timestampFromId(input.name)
  const operations = countOperations(input.reconstructionPath, input.openapiPath)
  return {
    id: input.name,
    label: formatLabel({ system, vars, model, reconstructedAt, operations, kind: 'run' }),
    kind: 'run',
    system,
    model,
    vars,
    reconstructedAt,
    operations,
    reconstructionPath: input.reconstructionPath,
    openapiPath: input.openapiPath,
    markdownPath: input.markdownPath,
  }
}

function formatLabel(input: {
  system: string | null
  vars: number | null
  model: string | null
  reconstructedAt: string | null
  operations: number | null
  kind: 'run' | 'reference'
}): string {
  const parts: string[] = [input.system ?? 'run']
  if (input.kind === 'reference') parts.push('perfect reconstruction')
  else if (input.reconstructedAt) parts.push(shortTimestamp(input.reconstructedAt))
  if (input.vars != null) parts.push(`VARS ${formatVars(input.vars)}`)
  if (input.operations != null) parts.push(`${input.operations} ops`)
  if (input.model) parts.push(shortModel(input.model))
  return parts.join(' · ')
}

function formatVars(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

function shortModel(model: string): string {
  const slash = model.lastIndexOf('/')
  return slash >= 0 ? model.slice(slash + 1) : model
}

function shortTimestamp(value: string): string {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/)
  if (m) return `${m[1]} ${m[2]}:${m[3]}`
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]} ${iso[2]}:${iso[3]}`
  return value
}

function timestampFromId(id: string): string | null {
  const m = id.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)$/)
  return m?.[1] ?? null
}

function systemFromId(id: string): string | null {
  if (id.startsWith('aae-')) return 'aae'
  if (id.startsWith('baseline-')) return 'baseline'
  return null
}

function countOperations(reconstructionPath: string | null, openapiPath: string | null): number | null {
  if (reconstructionPath && existsSync(reconstructionPath)) {
    const doc = readObject(reconstructionPath)
    const ops = doc?.operations
    if (Array.isArray(ops)) return ops.length
  }
  if (openapiPath && existsSync(openapiPath)) {
    const oas = readObject(openapiPath)
    const paths = oas?.paths
    if (!paths || typeof paths !== 'object') return null
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
    let n = 0
    for (const item of Object.values(paths as Record<string, Record<string, unknown>>)) {
      if (!item || typeof item !== 'object') continue
      for (const method of Object.keys(item)) {
        if (methods.has(method)) n += 1
      }
    }
    return n
  }
  return null
}

function compareEntries(a: CatalogEntry, b: CatalogEntry): number {
  return sortKey(b).localeCompare(sortKey(a))
}

/** Run-id timestamp if present, so `T14-51-…` and ISO `T14:51:…` sort in the same order. */
function sortKey(entry: CatalogEntry): string {
  const m = entry.id.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/)
  if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`
  return entry.reconstructedAt ?? entry.id
}

function readObject(path: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function stringField(obj: Record<string, unknown> | null, key: string): string | null {
  const value = obj?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberField(obj: Record<string, unknown> | null, key: string): number | null {
  const value = obj?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function publicCatalog(entries: CatalogEntry[]): PublicCatalogEntry[] {
  return entries.map((e) => ({
    id: e.id,
    label: e.label,
    kind: e.kind,
    system: e.system,
    model: e.model,
    vars: e.vars,
    reconstructedAt: e.reconstructedAt,
    operations: e.operations,
  }))
}

export interface PublicCatalogEntry {
  id: string
  label: string
  kind: 'run' | 'reference'
  system: string | null
  model: string | null
  vars: number | null
  reconstructedAt: string | null
  operations: number | null
}
