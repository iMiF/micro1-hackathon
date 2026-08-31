import { DISCLAIMER } from './disclaimer.js'
import { expandPathPlaceholders } from './paths.js'
import type {
  Claim,
  Dependency,
  Evidence,
  Reconstruction,
  SemanticFact,
  Workflow,
} from './types.js'

const LOW_CONFIDENCE = 0.5

export function toMarkdown(doc: Reconstruction): string {
  const title = doc.benchmark_name ? `${doc.benchmark_name} API reconstruction` : 'API reconstruction'
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`> **Draft — human review required.** ${DISCLAIMER}`)
  lines.push('')
  if (doc.reconstructed_at) lines.push(`Reconstructed at: ${doc.reconstructed_at}`)
  if (doc.schema_version) lines.push(`Schema version: ${doc.schema_version}`)
  if (doc.reconstructed_at || doc.schema_version) lines.push('')
  if (doc.notes) {
    lines.push(doc.notes)
    lines.push('')
  }

  lines.push('## Contents')
  lines.push('')
  lines.push(`- Operations: ${doc.operations.length}`)
  lines.push(`- Semantic facts: ${doc.semantic_facts.length}`)
  lines.push(`- Dependencies: ${doc.dependencies.length}`)
  lines.push(`- Workflows: ${doc.workflows.length}`)
  lines.push(`- Claims: ${doc.claims.length}`)
  lines.push('')

  pushConfidence(lines, doc)
  pushOperations(lines, doc)
  pushFacts(lines, doc.semantic_facts)
  pushWorkflows(lines, doc.workflows)
  pushDependencies(lines, doc.dependencies)
  pushClaims(lines, doc.claims)
  return lines.join('\n') + '\n'
}

function pushConfidence(lines: string[], doc: Reconstruction): void {
  lines.push('## Confidence')
  lines.push('')
  if (doc.confidence) {
    lines.push('| Category | Value |')
    lines.push('| --- | ---: |')
    for (const [key, value] of Object.entries(doc.confidence)) {
      lines.push(`| ${escapeCell(key)} | ${value} |`)
    }
    lines.push('')
  } else {
    lines.push('No document-level confidence block was recorded.')
    lines.push('')
  }
  const low = doc.claims.filter((c) => c.confidence != null && c.confidence < LOW_CONFIDENCE)
  lines.push(`Claims with confidence below ${LOW_CONFIDENCE}: ${low.length}`)
  lines.push('')
  if (low.length > 0) {
    for (const claim of low) {
      lines.push(`- (${claim.confidence}) ${escapeCell(claim.statement)}`)
    }
    lines.push('')
  }
}

function pushOperations(lines: string[], doc: Reconstruction): void {
  lines.push('## Operations')
  lines.push('')
  if (doc.operations.length === 0) {
    lines.push('None recorded.')
    lines.push('')
    return
  }
  const hasSummary = doc.operations.some((op) => Boolean(op.summary))
  const hasAuth = doc.operations.some((op) => Boolean(op.authentication))
  const hasStatus = doc.operations.some((op) => op.success_status != null)
  const hasEvidence = doc.operations.some((op) => (op.evidence?.length ?? 0) > 0)
  const hasConfidence = doc.operations.some((op) => op.confidence != null)

  const headers = ['Method', 'Path']
  const align = ['---', '---']
  if (hasSummary) {
    headers.push('Summary')
    align.push('---')
  }
  if (hasAuth) {
    headers.push('Auth')
    align.push('---')
  }
  if (hasStatus) {
    headers.push('Status')
    align.push('---:')
  }
  if (hasEvidence) {
    headers.push('Evidence')
    align.push('---')
  }
  if (hasConfidence) {
    headers.push('Confidence')
    align.push('---:')
  }
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${align.join(' | ')} |`)
  for (const op of doc.operations) {
    const path = expandPathPlaceholders(op.path, op.parameters)
    const cells = [escapeCell(op.method), `\`${escapeCell(path)}\``]
    if (hasSummary) cells.push(escapeCell(op.summary ?? ''))
    if (hasAuth) cells.push(escapeCell(op.authentication ?? ''))
    if (hasStatus) cells.push(op.success_status != null ? String(op.success_status) : '')
    if (hasEvidence) cells.push(escapeCell(evidenceSummary(op.evidence)))
    if (hasConfidence) cells.push(op.confidence != null ? String(op.confidence) : '')
    lines.push(`| ${cells.join(' | ')} |`)
  }
  lines.push('')
}

function pushFacts(lines: string[], facts: SemanticFact[]): void {
  lines.push('## Semantic facts')
  lines.push('')
  if (facts.length === 0) {
    lines.push('None recorded.')
    lines.push('')
    return
  }
  const groups = new Map<string, SemanticFact[]>()
  for (const fact of facts) {
    const kind = fact.kind ?? 'unspecified'
    const list = groups.get(kind) ?? []
    list.push(fact)
    groups.set(kind, list)
  }
  for (const kind of [...groups.keys()].sort()) {
    const group = groups.get(kind) ?? []
    const hasConfidence = group.some((fact) => fact.confidence != null)
    lines.push(`### ${kind}`)
    lines.push('')
    lines.push(hasConfidence ? '| Subject | Value | Meaning | Confidence |' : '| Subject | Value | Meaning |')
    lines.push(hasConfidence ? '| --- | --- | --- | ---: |' : '| --- | --- | --- |')
    for (const fact of group) {
      const cells = [
        escapeCell(fact.subject ?? ''),
        escapeCell(formatValue(fact.value)),
        escapeCell(fact.meaning),
      ]
      if (hasConfidence) cells.push(fact.confidence != null ? String(fact.confidence) : '')
      lines.push(`| ${cells.join(' | ')} |`)
    }
    lines.push('')
  }
}

function pushWorkflows(lines: string[], workflows: Workflow[]): void {
  lines.push('## Workflows')
  lines.push('')
  if (workflows.length === 0) {
    lines.push('None recorded.')
    lines.push('')
    return
  }
  for (const [index, wf] of workflows.entries()) {
    const heading = wf.user_goal
    lines.push(`### ${escapeCell(heading)}`)
    lines.push('')
    if (wf.id) lines.push(`id: \`${wf.id}\``)
    if (wf.confidence != null) lines.push(`confidence: ${wf.confidence}`)
    if (wf.id || wf.confidence != null) lines.push('')
    for (const [i, step] of wf.steps.entries()) {
      const extra = [step.role, step.condition, step.description].filter(Boolean).join(' · ')
      lines.push(`${i + 1}. \`${step.operation}\`${extra ? ` — ${escapeCell(extra)}` : ''}`)
    }
    lines.push('')
    if (wf.steps.length > 0) {
      lines.push('```mermaid')
      lines.push('flowchart LR')
      for (const [i, step] of wf.steps.entries()) {
        lines.push(`  ${nodeId(index, i)}["${mermaidLabel(step.operation)}"]`)
      }
      for (let i = 0; i < wf.steps.length - 1; i += 1) {
        lines.push(`  ${nodeId(index, i)} --> ${nodeId(index, i + 1)}`)
      }
      lines.push('```')
      lines.push('')
    }
  }
}

function pushDependencies(lines: string[], deps: Dependency[]): void {
  lines.push('## Dependencies')
  lines.push('')
  if (deps.length === 0) {
    lines.push('None recorded.')
    lines.push('')
    return
  }
  lines.push('| Source | Field | Target | Field | Kind |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const dep of deps) {
    lines.push(
      `| \`${escapeCell(dep.source_operation)}\` | ${escapeCell(dep.source_field ?? '')} | \`${escapeCell(dep.target_operation)}\` | ${escapeCell(dep.target_field ?? '')} | ${escapeCell(dep.kind ?? '')} |`,
    )
  }
  lines.push('')
  const withDescription = deps.filter((d) => d.description)
  if (withDescription.length > 0) {
    for (const dep of withDescription) {
      lines.push(`- \`${dep.source_operation}\` → \`${dep.target_operation}\`: ${escapeCell(dep.description ?? '')}`)
    }
    lines.push('')
  }
}

function pushClaims(lines: string[], claims: Claim[]): void {
  lines.push('## Claims')
  lines.push('')
  if (claims.length === 0) {
    lines.push('None recorded.')
    lines.push('')
    return
  }
  for (const claim of claims) {
    const conf = claim.confidence != null ? ` (confidence ${claim.confidence})` : ''
    lines.push(`- ${escapeCell(claim.statement)}${conf}`)
    if (claim.evidence && claim.evidence.length > 0) {
      lines.push(`  - evidence: ${claim.evidence.map(formatEvidence).join('; ')}`)
    }
  }
  lines.push('')
}

function evidenceSummary(list: Evidence[] | undefined): string {
  if (!list || list.length === 0) return ''
  const kinds = [...new Set(list.map((ev) => ev.kind).filter((kind): kind is string => Boolean(kind)))]
  const label = kinds.join(', ') || 'recorded'
  return list.length > 1 ? `${label} ×${list.length}` : label
}

function formatEvidence(ev: Evidence): string {
  const parts: string[] = []
  if (ev.kind) parts.push(ev.kind)
  if (ev.method) parts.push(ev.method)
  if (ev.path) parts.push(ev.path)
  if (ev.status != null) parts.push(String(ev.status))
  if (ev.page) parts.push(ev.page)
  if (ev.ui_text) parts.push(`"${ev.ui_text}"`)
  if (ev.note) parts.push(ev.note)
  return parts.join(' ')
}

function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function nodeId(workflow: number, step: number): string {
  return `w${workflow}s${step}`
}

function mermaidLabel(operation: string): string {
  return operation.replaceAll('"', '#quot;').replaceAll('[', '#').replaceAll(']', '#')
}
