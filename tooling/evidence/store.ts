import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Level-2 evidence and the trajectory (docs/08 §2).
 *
 * This is the run store the judge reads, not the nested evidence inside the
 * submission — those are separate on purpose, and the evaluator never reads
 * this one. Whether to link them is OQ-8.
 *
 * Mechanics only (ADR-10): the store records what it is given. Deciding what is
 * worth recording as a hypothesis or an experiment belongs to the agent.
 */

export type EvidenceKind =
  | 'ui_action'
  | 'network_event'
  | 'state_transition'
  | 'experiment'
  | 'policy_decision'

export interface EvidenceRecord {
  id: string
  kind: EvidenceKind
  step: number
  at: string
  data: Record<string, unknown>
}

export interface TrajectoryStep {
  step: number
  at: string
  tool: string
  args: Record<string, unknown>
  ok: boolean
  /** Short summary of what came back; full payloads live in evidence. */
  result: string
  evidenceIds: string[]
}

export class EvidenceStore {
  private records: EvidenceRecord[] = []
  private steps: TrajectoryStep[] = []
  private seq = 0

  constructor(private readonly runDir: string) {
    mkdirSync(join(runDir, 'evidence'), { recursive: true })
    mkdirSync(join(runDir, 'screenshots'), { recursive: true })
  }

  record(kind: EvidenceKind, step: number, data: Record<string, unknown>): string {
    const id = `ev_${String(++this.seq).padStart(3, '0')}`
    const entry: EvidenceRecord = { id, kind, step, at: new Date().toISOString(), data }
    this.records.push(entry)
    appendFileSync(join(this.runDir, 'evidence', 'evidence.jsonl'), JSON.stringify(entry) + '\n')
    return id
  }

  logStep(step: Omit<TrajectoryStep, 'at'>): void {
    const entry: TrajectoryStep = { ...step, at: new Date().toISOString() }
    this.steps.push(entry)
    appendFileSync(join(this.runDir, 'trajectory.jsonl'), JSON.stringify(entry) + '\n')
  }

  screenshot(step: number, bytes: Buffer): string {
    const name = `step-${String(step).padStart(3, '0')}.png`
    writeFileSync(join(this.runDir, 'screenshots', name), bytes)
    return name
  }

  /** A run summary a human can read in under a minute (docs/08 §1). */
  writeSummary(extra: Record<string, unknown> = {}): void {
    const byKind: Record<string, number> = {}
    for (const record of this.records) byKind[record.kind] = (byKind[record.kind] ?? 0) + 1
    writeFileSync(
      join(this.runDir, 'summary.json'),
      JSON.stringify(
        { steps: this.steps.length, evidence: this.records.length, byKind, ...extra },
        null,
        2,
      ) + '\n',
    )
  }

  all(): EvidenceRecord[] {
    return [...this.records]
  }

  trajectory(): TrajectoryStep[] {
    return [...this.steps]
  }
}
