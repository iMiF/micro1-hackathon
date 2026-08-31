/**
 * The reconstruction fields the generator reads. Extra keys are ignored.
 * Missing keys stay missing — the generator does not fill them in.
 */

export interface Evidence {
  kind?: string
  page?: string
  method?: string
  path?: string
  status?: number
  json_paths?: string[]
  header?: string
  cookie_name?: string
  ui_text?: string
  note?: string
}

export interface Parameter {
  name: string
  location: 'path' | 'query' | 'header' | 'cookie' | string
  required?: boolean
  type?: string
  description?: string
  enum?: unknown[]
  default?: unknown
  confidence?: number
  evidence?: Evidence[]
}

export interface ErrorResponse {
  status: number
  code?: string
  message?: string
  schema?: unknown
  confidence?: number
  evidence?: Evidence[]
}

export interface Operation {
  id?: string
  method: string
  path: string
  summary?: string
  parameters?: Parameter[]
  request_schema?: unknown
  response_schema?: unknown
  success_status?: number
  error_responses?: ErrorResponse[]
  authentication?: string
  confidence?: number
  evidence?: Evidence[]
}

export interface SemanticFact {
  id?: string
  subject?: string
  value?: unknown
  meaning: string
  kind?: string
  confidence?: number
  evidence?: Evidence[]
}

export interface Dependency {
  id?: string
  source_operation: string
  source_field?: string
  target_operation: string
  target_field?: string
  kind?: string
  description?: string
  confidence?: number
  evidence?: Evidence[]
}

export interface WorkflowStep {
  id?: string
  operation: string
  role?: string
  depends_on?: string[]
  condition?: string
  description?: string
}

export interface Workflow {
  id?: string
  user_goal: string
  steps: WorkflowStep[]
  confidence?: number
  evidence?: Evidence[]
}

export interface Claim {
  id?: string
  statement: string
  supports?: string[]
  confidence?: number
  evidence?: Evidence[]
}

export interface Reconstruction {
  schema_version?: string
  benchmark_name?: string
  reconstructed_at?: string
  notes?: string
  components?: Record<string, unknown>
  confidence?: Record<string, number>
  operations: Operation[]
  semantic_facts: SemanticFact[]
  dependencies: Dependency[]
  workflows: Workflow[]
  claims: Claim[]
  actions?: unknown[]
}

export function parseReconstruction(raw: unknown): Reconstruction {
  const doc = isRecord(raw) ? raw : {}
  return {
    schema_version: asString(doc.schema_version),
    benchmark_name: asString(doc.benchmark_name),
    reconstructed_at: asString(doc.reconstructed_at),
    notes: asString(doc.notes),
    components: isRecord(doc.components) ? (doc.components as Record<string, unknown>) : undefined,
    confidence: parseConfidence(doc.confidence),
    operations: asArray(doc.operations).map(parseOperation).filter((op): op is Operation => op != null),
    semantic_facts: asArray(doc.semantic_facts).map(parseFact).filter((f): f is SemanticFact => f != null),
    dependencies: asArray(doc.dependencies).map(parseDep).filter((d): d is Dependency => d != null),
    workflows: asArray(doc.workflows).map(parseWorkflow).filter((w): w is Workflow => w != null),
    claims: asArray(doc.claims).map(parseClaim).filter((c): c is Claim => c != null),
    actions: asArray(doc.actions).length > 0 ? asArray(doc.actions) : undefined,
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseConfidence(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, number> = {}
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseEvidenceList(value: unknown): Evidence[] | undefined {
  const list = asArray(value)
    .filter(isRecord)
    .map((row) => {
      const ev: Evidence = {}
      if (typeof row.kind === 'string') ev.kind = row.kind
      if (typeof row.page === 'string') ev.page = row.page
      if (typeof row.method === 'string') ev.method = row.method
      if (typeof row.path === 'string') ev.path = row.path
      if (typeof row.status === 'number') ev.status = row.status
      if (Array.isArray(row.json_paths) && row.json_paths.every((p) => typeof p === 'string')) {
        ev.json_paths = row.json_paths
      }
      if (typeof row.header === 'string') ev.header = row.header
      if (typeof row.cookie_name === 'string') ev.cookie_name = row.cookie_name
      if (typeof row.ui_text === 'string') ev.ui_text = row.ui_text
      if (typeof row.note === 'string') ev.note = row.note
      return ev
    })
  return list.length > 0 ? list : undefined
}

function parseOperation(value: unknown): Operation | null {
  if (!isRecord(value)) return null
  if (typeof value.method !== 'string' || typeof value.path !== 'string') return null
  const op: Operation = { method: value.method, path: value.path }
  if (typeof value.id === 'string') op.id = value.id
  if (typeof value.summary === 'string') op.summary = value.summary
  const parameters = asArray(value.parameters)
    .filter(isRecord)
    .map((row): Parameter | null => {
      if (typeof row.name !== 'string' || typeof row.location !== 'string') return null
      const p: Parameter = { name: row.name, location: row.location }
      if (typeof row.required === 'boolean') p.required = row.required
      if (typeof row.type === 'string') p.type = row.type
      if (typeof row.description === 'string') p.description = row.description
      if (Array.isArray(row.enum)) p.enum = row.enum
      if ('default' in row) p.default = row.default
      const c = asNumber(row.confidence)
      if (c != null) p.confidence = c
      const ev = parseEvidenceList(row.evidence)
      if (ev) p.evidence = ev
      return p
    })
    .filter((p): p is Parameter => p != null)
  if (parameters.length > 0) op.parameters = parameters
  if ('request_schema' in value) op.request_schema = value.request_schema
  if ('response_schema' in value) op.response_schema = value.response_schema
  const status = asNumber(value.success_status)
  if (status != null) op.success_status = status
  const errors = asArray(value.error_responses)
    .filter(isRecord)
    .map((row): ErrorResponse | null => {
      const st = asNumber(row.status)
      if (st == null) return null
      const err: ErrorResponse = { status: st }
      if (typeof row.code === 'string') err.code = row.code
      if (typeof row.message === 'string') err.message = row.message
      if ('schema' in row) err.schema = row.schema
      const c = asNumber(row.confidence)
      if (c != null) err.confidence = c
      const ev = parseEvidenceList(row.evidence)
      if (ev) err.evidence = ev
      return err
    })
    .filter((e): e is ErrorResponse => e != null)
  if (errors.length > 0) op.error_responses = errors
  if (typeof value.authentication === 'string') op.authentication = value.authentication
  const c = asNumber(value.confidence)
  if (c != null) op.confidence = c
  const ev = parseEvidenceList(value.evidence)
  if (ev) op.evidence = ev
  return op
}

function parseFact(value: unknown): SemanticFact | null {
  if (!isRecord(value) || typeof value.meaning !== 'string') return null
  const fact: SemanticFact = { meaning: value.meaning }
  if (typeof value.id === 'string') fact.id = value.id
  if (typeof value.subject === 'string') fact.subject = value.subject
  if ('value' in value) fact.value = value.value
  if (typeof value.kind === 'string') fact.kind = value.kind
  const c = asNumber(value.confidence)
  if (c != null) fact.confidence = c
  const ev = parseEvidenceList(value.evidence)
  if (ev) fact.evidence = ev
  return fact
}

function parseDep(value: unknown): Dependency | null {
  if (!isRecord(value)) return null
  if (typeof value.source_operation !== 'string' || typeof value.target_operation !== 'string') return null
  const dep: Dependency = {
    source_operation: value.source_operation,
    target_operation: value.target_operation,
  }
  if (typeof value.id === 'string') dep.id = value.id
  if (typeof value.source_field === 'string') dep.source_field = value.source_field
  if (typeof value.target_field === 'string') dep.target_field = value.target_field
  if (typeof value.kind === 'string') dep.kind = value.kind
  if (typeof value.description === 'string') dep.description = value.description
  const c = asNumber(value.confidence)
  if (c != null) dep.confidence = c
  const ev = parseEvidenceList(value.evidence)
  if (ev) dep.evidence = ev
  return dep
}

function parseWorkflow(value: unknown): Workflow | null {
  if (!isRecord(value) || typeof value.user_goal !== 'string') return null
  const steps = asArray(value.steps)
    .filter(isRecord)
    .map((row): WorkflowStep | null => {
      if (typeof row.operation !== 'string') return null
      const step: WorkflowStep = { operation: row.operation }
      if (typeof row.id === 'string') step.id = row.id
      if (typeof row.role === 'string') step.role = row.role
      if (Array.isArray(row.depends_on) && row.depends_on.every((d) => typeof d === 'string')) {
        step.depends_on = row.depends_on
      }
      if (typeof row.condition === 'string') step.condition = row.condition
      if (typeof row.description === 'string') step.description = row.description
      return step
    })
    .filter((s): s is WorkflowStep => s != null)
  if (steps.length === 0) return null
  const wf: Workflow = { user_goal: value.user_goal, steps }
  if (typeof value.id === 'string') wf.id = value.id
  const c = asNumber(value.confidence)
  if (c != null) wf.confidence = c
  const ev = parseEvidenceList(value.evidence)
  if (ev) wf.evidence = ev
  return wf
}

function parseClaim(value: unknown): Claim | null {
  if (!isRecord(value) || typeof value.statement !== 'string') return null
  const claim: Claim = { statement: value.statement }
  if (typeof value.id === 'string') claim.id = value.id
  if (Array.isArray(value.supports) && value.supports.every((s) => typeof s === 'string')) {
    claim.supports = value.supports
  }
  const c = asNumber(value.confidence)
  if (c != null) claim.confidence = c
  const ev = parseEvidenceList(value.evidence)
  if (ev) claim.evidence = ev
  return claim
}
