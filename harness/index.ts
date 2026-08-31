import { BrowserDriver } from '../tooling/browser/driver.js'
import { EvidenceStore } from '../tooling/evidence/store.js'
import { decide, type PolicyProfile } from './policy.js'
import type { NetworkEvent } from '../tooling/browser/network.js'
import type { PageObservation } from '../tooling/browser/observe.js'

/**
 * The harness: the seven tools of docs/02 §2, plus the risk gate of docs/07 §2.
 *
 * Executes tool calls, normalizes observations, applies policy. Does not plan
 * and does not interpret (docs/02 §7). Both agents get this exact object, which
 * is what makes the tool surface identical by construction rather than by
 * discipline (docs/04 §5).
 */

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

/**
 * The seven-tool surface of docs/02 §2. Parameter names and shapes live here so
 * baseline and AAE cannot silently drift (`element_id`, not `elementId`).
 * Prose in `description` is mechanical — what the tool does — not how to explore.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'observe_page',
    description:
      'Return the current page URL, visible text, and interactive elements with harness-assigned ids. Call this after every navigation or mutation before acting on elements: ids are re-issued on every observation.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'click',
    description: 'Click the element with the given id from the latest observe_page() result.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'Element id from the latest observe_page() result.' },
      },
      required: ['element_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'fill',
    description: 'Type a value into the element with the given id. Does not submit the form by itself.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'Element id from the latest observe_page() result.' },
        value: { type: 'string', description: 'Text to type into the field.' },
      },
      required: ['element_id', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'select',
    description: 'Choose an option on a select element. `value` is the option value, not the visible label.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'Element id from the latest observe_page() result.' },
        value: { type: 'string', description: 'Option value to select.' },
      },
      required: ['element_id', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'go_back',
    description: 'Navigate back in the browser history.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_network_events',
    description:
      'Return captured API requests and responses. Each event has `path` (ids and parameter names erased to `{}`) and `rawPath` (the path as it appeared on the wire). Pass `since` to get events after a given event id.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Optional event id; only events after this id are returned.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'submit_reconstruction',
    description:
      'End the run by submitting the reconstruction document. The argument must be schema-conformant JSON. A run without a valid submission scores nothing.',
    input_schema: {
      type: 'object',
      properties: {
        reconstruction: {
          type: 'object',
          description:
            'The full reconstruction document: schema_version 1.0.0 and arrays operations, semantic_facts, dependencies, workflows, claims, each with nested evidence.',
        },
      },
      required: ['reconstruction'],
      additionalProperties: false,
    },
  },
]

export interface HarnessConfig {
  baseUrl: string
  runDir: string
  policyProfile: PolicyProfile
  /** Budget in tool calls. Identical for both systems (ADR-11). */
  maxSteps: number
  /** Wall-clock budget from the shared run configuration. Optional only for non-scored smoke tests. */
  wallClockMs?: number
  allowlist?: string[]
  headless?: boolean
  captureScreenshots?: boolean
}

export interface ToolResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export class Harness {
  private readonly driver: BrowserDriver
  private readonly evidence: EvidenceStore
  private step = 0
  private submission: unknown = null
  private finished = false
  private startedAt: number | null = null

  constructor(private readonly config: HarnessConfig) {
    this.driver = new BrowserDriver({
      baseUrl: config.baseUrl,
      headless: config.headless ?? true,
      captureScreenshots: config.captureScreenshots ?? false,
    })
    this.evidence = new EvidenceStore(config.runDir)
  }

  async start(startPath = '/'): Promise<void> {
    this.startedAt = Date.now()
    await this.driver.start()
    await this.driver.goto(startPath)
  }

  async stop(): Promise<void> {
    this.evidence.writeSummary({
      finished: this.finished,
      steps: this.step,
      observedOperations: this.driver.network.observedOperations(),
    })
    await this.driver.stop()
  }

  isFinished(): boolean {
    return this.finished || this.step >= this.config.maxSteps || this.wallClockExceeded()
  }

  getSubmission(): unknown {
    return this.submission
  }

  stepsUsed(): number {
    return this.step
  }

  budgetLeft(): number {
    return Math.max(0, this.config.maxSteps - this.step)
  }

  private wallClockExceeded(): boolean {
    if (!this.config.wallClockMs || this.startedAt == null) return false
    return Date.now() - this.startedAt >= this.config.wallClockMs
  }

  // ---------------------------------------------------------------- tools ---

  async observe_page(): Promise<ToolResult> {
    return this.run('observe_page', {}, async () => {
      const observation = await this.driver.observe()
      return { ok: true, page: this.presentObservation(observation) }
    })
  }

  async click(element_id: string): Promise<ToolResult> {
    return this.runAction('click', element_id, undefined, (id) => this.driver.click(id))
  }

  async fill(element_id: string, value: string): Promise<ToolResult> {
    return this.runAction('fill', element_id, value, (id) => this.driver.fill(id, value))
  }

  async select(element_id: string, value: string): Promise<ToolResult> {
    return this.runAction('select', element_id, value, (id) => this.driver.select(id, value))
  }

  async go_back(): Promise<ToolResult> {
    return this.run('go_back', {}, async () => {
      const result = await this.driver.goBack()
      return result.ok
        ? { ok: true, events: result.networkEvents.map(summarizeEvent) }
        : { ok: false, error: result.error ?? 'go_back failed' }
    })
  }

  async get_network_events(since?: string): Promise<ToolResult> {
    return this.run('get_network_events', { since }, async () => ({
      ok: true,
      events: this.driver.network.since(since).map(presentEvent),
    }))
  }

  /**
   * Ends the run. The harness stores the submission verbatim and does not judge
   * it: validation and scoring are the evaluator's job, and nothing here may
   * touch the content on its way out (ADR-12).
   *
   * Budgets stop further exploration, not delivery: a submit after the step or
   * wall-clock limit is still stored. Without this, a long final generation
   * would produce a reconstruction the harness then refuses to accept.
   */
  async submit_reconstruction(reconstruction: unknown): Promise<ToolResult> {
    if (this.submission != null) return { ok: false, error: 'run already finished' }
    return this.run('submit_reconstruction', {}, async () => {
      this.submission = reconstruction
      this.finished = true
      return { ok: true, accepted: true }
    }, { deliver: true })
  }

  // -------------------------------------------------------------- plumbing ---

  private presentObservation(observation: PageObservation): Record<string, unknown> {
    return {
      url: observation.url,
      path: observation.path,
      title: observation.title,
      text: observation.text,
      elements: observation.elements.map((element) => ({
        id: element.id,
        role: element.role,
        label: element.label,
        type: element.type,
        value: element.value,
        options: element.options,
        enabled: element.enabled,
      })),
    }
  }

  private async runAction(
    tool: 'click' | 'fill' | 'select',
    elementId: string,
    value: string | undefined,
    perform: (elementId: string) => Promise<{ ok: boolean; error?: string; networkEvents: NetworkEvent[]; screenshot?: Buffer }>,
  ): Promise<ToolResult> {
    return this.run(tool, { element_id: elementId, value }, async () => {
      const observation = this.driver.currentObservation()
      const element = observation?.elements.find((candidate) => candidate.id === elementId)
      if (!element) {
        return {
          ok: false,
          error: `unknown element id ${elementId}; call observe_page() first — ids are re-issued on every observation`,
        }
      }

      const decision = decide(
        { element, action: tool, allowlist: this.config.allowlist },
        this.config.policyProfile,
      )
      const policyEvidence = this.evidence.record('policy_decision', this.step, {
        tool,
        element: { id: element.id, label: element.label, role: element.role },
        ...decision,
      })

      if (decision.verdict !== 'allow') {
        return {
          ok: false,
          error: `blocked by risk policy (${decision.riskClass}): ${decision.reason}`,
          policy: decision,
          evidence_id: policyEvidence,
        }
      }

      const result = await perform(elementId)
      const uiEvidence = this.evidence.record('ui_action', this.step, {
        tool,
        element: { id: element.id, label: element.label, role: element.role },
        value,
        page: observation?.path,
        ok: result.ok,
      })
      for (const event of result.networkEvents) {
        this.evidence.record('network_event', this.step, presentEvent(event) as Record<string, unknown>)
      }
      if (result.screenshot) this.evidence.screenshot(this.step, result.screenshot)

      return result.ok
        ? {
            ok: true,
            events: result.networkEvents.map(summarizeEvent),
            evidence_id: uiEvidence,
          }
        : { ok: false, error: result.error ?? `${tool} failed`, evidence_id: uiEvidence }
    })
  }

  private async run(
    tool: string,
    args: Record<string, unknown>,
    body: () => Promise<ToolResult>,
    options?: { deliver?: boolean },
  ): Promise<ToolResult> {
    if (this.submission != null) return { ok: false, error: 'run already finished' }
    if (!options?.deliver) {
      if (this.finished) return { ok: false, error: 'run already finished' }
      if (this.step >= this.config.maxSteps) {
        this.finished = true
        return { ok: false, error: 'step budget exhausted' }
      }
      if (this.wallClockExceeded()) {
        this.finished = true
        return { ok: false, error: 'wall-clock budget exhausted' }
      }
    }

    this.step += 1
    this.driver.setStep(this.step)
    const result = await body()
    this.evidence.logStep({
      step: this.step,
      tool,
      args,
      ok: result.ok,
      result: result.ok ? 'ok' : String(result.error ?? 'error'),
      evidenceIds: typeof result.evidence_id === 'string' ? [result.evidence_id] : [],
    })
    return result
  }
}

/** What the agent sees for one network event. `path` is tooling-normalized; `rawPath` is the wire path. */
export function presentEvent(event: NetworkEvent): Record<string, unknown> {
  return {
    id: event.id,
    method: event.method,
    path: event.path,
    rawPath: event.rawPath,
    query: event.query,
    status: event.status,
    request_headers: event.requestHeaders,
    response_headers: event.responseHeaders,
    request_body: event.requestBody,
    response_body: event.responseBody,
    duration_ms: event.durationMs,
    step: event.step,
  }
}

/** One line per event, for the immediate result of an action. */
function summarizeEvent(event: NetworkEvent): string {
  return `${event.id} ${event.method} ${event.path} -> ${event.status ?? 'failed'}`
}

export { decide, classify } from './policy.js'
export type { PolicyProfile, RiskClass } from './policy.js'
