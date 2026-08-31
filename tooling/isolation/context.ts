import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Mechanical isolation of the agent context (docs/04 §1).
 *
 * The LLM sees only what assembleAgentContext accepted. Ground truth, cases,
 * docs, and target source are not inputs to that function. assertIsolated
 * checks the assembled payload before every model call so a leak is a thrown
 * error, not a review comment.
 *
 * This module reads ground-truth files only to collect identifier fingerprints.
 * Those strings are never concatenated into the payload.
 *
 * Deny-path markers are scanned on the agent-authored parts (system prompt,
 * task prompt, conversation) only. The two public files may cite `docs/04`
 * in their own comments; that is not a leak.
 */

export const PUBLIC_SCHEMA_REL = 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'
export const PUBLIC_VOCABULARY_REL = 'evaluator/config/canonical-vocabulary.json'

const GT_ID = /^(sem|dep|wf|op|act)-[a-z0-9-]+$/

export interface AssembledContext {
  systemPrompt: string
  publicSchema: string
  publicVocabulary: string
  taskPrompt: string
  conversation: unknown[]
}

/**
 * The only constructor for what the model is allowed to see. There is no slot
 * for an extra file. Schema and vocabulary are public benchmark input
 * (docs/04 §1); the task prompt is passed through verbatim (ADR-11).
 */
export function assembleAgentContext(input: {
  systemPrompt: string
  taskPrompt: string
  publicSchema: string
  publicVocabulary: string
}): AssembledContext {
  return {
    systemPrompt: input.systemPrompt,
    publicSchema: input.publicSchema,
    publicVocabulary: input.publicVocabulary,
    taskPrompt: input.taskPrompt,
    conversation: [],
  }
}

/** What is sent as the model `system` field: agent prompt plus public contract. */
export function assembledSystem(ctx: AssembledContext): string {
  return [
    ctx.systemPrompt,
    '',
    '## Output schema (public benchmark contract)',
    ctx.publicSchema,
    '',
    '## Canonical vocabulary (public)',
    ctx.publicVocabulary,
  ].join('\n')
}

export function loadPublicSchema(root = process.cwd()): string {
  return readFileSync(join(root, PUBLIC_SCHEMA_REL), 'utf8')
}

export function loadPublicVocabulary(root = process.cwd()): string {
  return readFileSync(join(root, PUBLIC_VOCABULARY_REL), 'utf8')
}

export function contextPayload(ctx: AssembledContext): string {
  return JSON.stringify({
    systemPrompt: ctx.systemPrompt,
    publicSchema: ctx.publicSchema,
    publicVocabulary: ctx.publicVocabulary,
    taskPrompt: ctx.taskPrompt,
    conversation: ctx.conversation,
  })
}

export function assertIsolated(ctx: AssembledContext, deny: string[], root = process.cwd()): void {
  const authored = JSON.stringify({
    systemPrompt: ctx.systemPrompt,
    taskPrompt: ctx.taskPrompt,
    conversation: ctx.conversation,
  })
  for (const marker of deny) {
    if (authored.includes(marker)) {
      throw new Error(`isolation: denied path ${JSON.stringify(marker)} present in agent context`)
    }
  }
  const payload = contextPayload(ctx)
  for (const id of loadGroundTruthIds(root)) {
    if (payload.includes(id)) {
      throw new Error(`isolation: ground-truth identifier ${id} present in agent context`)
    }
  }
}

/** Author-only identifiers. Used only as fingerprints, never as prompt text. */
export function loadGroundTruthIds(root = process.cwd()): string[] {
  const dir = join(root, 'miniCRM/benchmark/ground-truth')
  const ids = new Set<string>()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    walkIds(JSON.parse(readFileSync(join(dir, name), 'utf8')), ids)
  }
  return [...ids]
}

function walkIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) walkIds(entry, ids)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (typeof record.id === 'string' && GT_ID.test(record.id)) ids.add(record.id)
  for (const entry of Object.values(record)) walkIds(entry, ids)
}
