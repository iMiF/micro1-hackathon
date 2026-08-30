import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function load(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

function pointer(obj, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref ${ref}`)
  const parts = ref.slice(2).split('/')
  let cur = obj
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) {
      throw new Error(`Unresolvable $ref ${ref}`)
    }
    cur = cur[part]
  }
  return cur
}

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function matchesType(value, type) {
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeOf(value) === type
}

function validate(schema, value, rootSchema, path) {
  if (schema.$ref) {
    return validate(pointer(rootSchema, schema.$ref), value, rootSchema, path)
  }
  if (Array.isArray(schema.type)) {
    const ok = schema.type.some((t) => {
      try {
        validate({ ...schema, type: t }, value, rootSchema, path)
        return true
      } catch {
        return false
      }
    })
    if (!ok) throw new Error(`${path}: expected type ${schema.type.join('|')}, got ${typeOf(value)}`)
    return
  }
  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(`${path}: expected const ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new Error(`${path}: expected enum ${schema.enum.join('|')}, got ${JSON.stringify(value)}`)
  }
  if (schema.type) {
    if (!matchesType(value, schema.type)) {
      throw new Error(`${path}: expected ${schema.type}, got ${typeOf(value)}`)
    }
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum != null && value < schema.minimum) throw new Error(`${path}: < minimum`)
    if (schema.maximum != null && value > schema.maximum) throw new Error(`${path}: > maximum`)
  }
  if (schema.type === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) {
      throw new Error(`${path}: minItems`)
    }
    if (schema.items) {
      value.forEach((item, i) => validate(schema.items, item, rootSchema, `${path}[${i}]`))
    }
  }
  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    if (typeOf(value) !== 'object') throw new Error(`${path}: expected object`)
    for (const key of schema.required ?? []) {
      if (!(key in value)) throw new Error(`${path}: missing required ${key}`)
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in value) validate(sub, value[key], rootSchema, `${path}.${key}`)
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new Error(`${path}: additional property ${key}`)
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const known = new Set(Object.keys(schema.properties ?? {}))
      for (const [key, subVal] of Object.entries(value)) {
        if (!known.has(key)) validate(schema.additionalProperties, subVal, rootSchema, `${path}.${key}`)
      }
    }
  }
}

const files = [
  'benchmark/ground-truth/manifest.json',
  'benchmark/ground-truth/api.json',
  'benchmark/ground-truth/semantics.json',
  'benchmark/ground-truth/dependencies.json',
  'benchmark/ground-truth/workflows.json',
  'benchmark/ground-truth/actions.json',
  'benchmark/cases.json',
  'benchmark/schemas/reconstruction-output.schema.json',
  'benchmark/examples/perfect-reconstruction.json',
]

for (const file of files) load(file)

const schema = load('benchmark/schemas/reconstruction-output.schema.json')
const perfect = load('benchmark/examples/perfect-reconstruction.json')
validate(schema, perfect, schema, '$')

const api = load('benchmark/ground-truth/api.json')
const semantics = load('benchmark/ground-truth/semantics.json')
const dependencies = load('benchmark/ground-truth/dependencies.json')
const workflows = load('benchmark/ground-truth/workflows.json')
const actions = load('benchmark/ground-truth/actions.json')
const cases = load('benchmark/cases.json')

const opKey = (o) => `${o.method} ${o.path}`
const keys = new Set(api.operations.map(opKey))
const ids = new Set([
  ...api.operations.map((o) => o.id),
  ...semantics.facts.map((f) => f.id),
  ...dependencies.dependencies.map((d) => d.id),
  ...workflows.workflows.map((w) => w.id),
  ...actions.actions.map((a) => a.id),
])

const errors = []

for (const d of dependencies.dependencies) {
  if (d.source_operation !== '*' && !keys.has(d.source_operation)) {
    errors.push(`dep ${d.id} bad source ${d.source_operation}`)
  }
  if (d.target_operation !== '*' && !keys.has(d.target_operation)) {
    errors.push(`dep ${d.id} bad target ${d.target_operation}`)
  }
}

for (const w of workflows.workflows) {
  const stepIds = new Set(w.steps.map((s) => s.id))
  for (const s of w.steps) {
    if (!keys.has(s.operation)) errors.push(`wf ${w.id} bad op ${s.operation}`)
    for (const dep of s.depends_on ?? []) {
      if (!stepIds.has(dep)) errors.push(`wf ${w.id} missing step ${dep}`)
    }
  }
}

for (const a of actions.actions) {
  for (const ref of a.expected_operations) {
    if (!keys.has(ref)) errors.push(`action ${a.id} bad op ${ref}`)
  }
}

for (const c of cases.cases) {
  for (const id of [...c.ground_truth_fact_ids, ...(c.workflow_ids ?? []), ...(c.action_ids ?? [])]) {
    if (!ids.has(id)) errors.push(`case ${c.id} unknown id ${id}`)
  }
}

for (const claim of perfect.claims) {
  for (const id of claim.supports ?? []) {
    if (!ids.has(id) && !perfect.operations.some((o) => o.id === id) && !perfect.workflows.some((w) => w.id === id)) {
      errors.push(`claim ${claim.id} unknown supports ${id}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const paramCount = api.operations.reduce((n, o) => n + o.parameters.length, 0)
const schemaCount =
  api.operations.filter((o) => o.request_schema).length +
  api.operations.filter((o) => o.response_schema).length

console.log('validation ok')
console.log(JSON.stringify({
  operations: api.operations.length,
  parameter_facts: paramCount,
  schema_facts: schemaCount,
  semantic_facts: semantics.facts.length,
  dependencies: dependencies.dependencies.length,
  workflows: workflows.workflows.length,
  actions: actions.actions.length,
  benchmark_cases: cases.cases.length,
  challenging_cases: cases.cases.filter((c) => c.challenging).length,
}, null, 2))
