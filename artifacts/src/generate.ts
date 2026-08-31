import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toMarkdown } from './markdown.js'
import { toOpenApi } from './openapi.js'
import { parseReconstruction } from './types.js'

export interface GenerateResult {
  openapi: ReturnType<typeof toOpenApi>
  markdown: string
  openapiPath: string
  markdownPath: string
}

/**
 * Render a reconstruction into OpenAPI 3.1 and a human-readable draft.
 * Does not add facts: missing fields stay missing.
 */
export function generateArtifacts(input: { submission: unknown; outDir: string }): GenerateResult {
  const doc = parseReconstruction(input.submission)
  const openapi = toOpenApi(doc)
  const markdown = toMarkdown(doc)
  mkdirSync(input.outDir, { recursive: true })
  const openapiPath = join(input.outDir, 'openapi.json')
  const markdownPath = join(input.outDir, 'API.md')
  writeFileSync(openapiPath, JSON.stringify(openapi, null, 2) + '\n')
  writeFileSync(markdownPath, markdown)
  return { openapi, markdown, openapiPath, markdownPath }
}
