import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  canonicalKey,
  semanticFactSubjectKind,
  type Section,
} from './canonical.js'

/**
 * ClaimBoard + GapBoard (docs/02 §4.2). Append-only jsonl is the audit trail;
 * `resolveClaims` applies the merge rules when the Assembler builds a document.
 */

export type Support = 'observed' | 'varied' | 'refuted_attempt'

export interface ClaimEntry {
  section: Section
  canonicalKey: string
  item: Record<string, unknown>
  evidenceIds: string[]
  producedBy: string
  support: Support
  round: number
}

export interface GapEntry {
  id: string
  origin: 'miner' | 'sweeper' | 'extractor' | 'claim'
  question: string
  targetClaimKey?: string
  evidenceIds: string[]
  status: 'open' | 'planned' | 'attempted' | 'resolved' | 'unreachable'
  round: number
}

const SUPPORT_RANK: Record<Support, number> = {
  observed: 1,
  varied: 2,
  refuted_attempt: 3,
}

export function supportRank(support: Support): number {
  return SUPPORT_RANK[support]
}

export class Boards {
  readonly claims: ClaimEntry[] = []
  readonly gaps: GapEntry[] = []
  private gapSeq = 0
  private readonly claimsPath: string
  private readonly gapsPath: string

  constructor(runDir?: string) {
    this.claimsPath = runDir ? join(runDir, 'claims.jsonl') : ''
    this.gapsPath = runDir ? join(runDir, 'gaps.jsonl') : ''
    if (runDir) {
      mkdirSync(runDir, { recursive: true })
      writeFileSync(this.claimsPath, '')
      writeFileSync(this.gapsPath, '')
    }
  }

  addClaim(entry: ClaimEntry): ClaimEntry | null {
    if (entry.evidenceIds.length === 0) return null
    const ids = uniqueSorted(entry.evidenceIds)
    const stored: ClaimEntry = { ...entry, evidenceIds: ids }
    this.claims.push(stored)
    this.write(this.claimsPath, stored)
    return stored
  }

  addGap(entry: Omit<GapEntry, 'id'>): GapEntry {
    this.gapSeq += 1
    const stored: GapEntry = {
      ...entry,
      id: `gap_${String(this.gapSeq).padStart(3, '0')}`,
      evidenceIds: uniqueSorted(entry.evidenceIds),
    }
    this.gaps.push(stored)
    this.write(this.gapsPath, stored)
    return stored
  }

  nextGapSeq(): number {
    return this.gapSeq
  }

  private write(path: string, row: unknown): void {
    if (!path) return
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(row) + '\n')
  }
}

export interface ResolvedBoards {
  winners: ClaimEntry[]
  conflicts: GapEntry[]
}

/**
 * Kinds where two values on the same subject are mutually exclusive
 * (one cookie name, one error code, one identifier meaning). Enum members,
 * transitions, query facts, derived values and constraints are n facts for
 * n values — collapsing them was dropping the atomic rows the extractors
 * already wrote (AAE run 2026-08-31T08-22-05-823Z).
 */
const MUTUALLY_EXCLUSIVE_KINDS = new Set(['auth', 'concurrency', 'validation', 'identifier_meaning'])

/**
 * Merge rules:
 * 1. identical key → merge, union evidence, keep the highest support
 * 2. mutually exclusive kind, same subject, different value → more
 *    independent observations wins; a tie enters neither the document
 *    nor the winner's slot and produces a GapEntry
 * 3. every other kind keeps every distinct canonical key
 */
export function resolveClaims(claims: ClaimEntry[], nextGapId: number): ResolvedBoards {
  const byKey = new Map<string, ClaimEntry[]>()
  for (const claim of claims) {
    const bucket = byKey.get(claim.canonicalKey)
    if (bucket) bucket.push(claim)
    else byKey.set(claim.canonicalKey, [claim])
  }

  const mergedByKey = new Map<string, ClaimEntry>()
  for (const [key, group] of byKey) {
    mergedByKey.set(key, mergeIdenticalKey(group))
  }

  const winners: ClaimEntry[] = []
  const conflicts: GapEntry[] = []
  let gapSeq = nextGapId
  const consumed = new Set<string>()

  const semantic = [...mergedByKey.values()].filter((entry) => entry.section === 'semantic_facts')
  const bySubjectKind = new Map<string, ClaimEntry[]>()
  for (const entry of semantic) {
    const kind = entry.item.kind
    if (typeof kind !== 'string' || !MUTUALLY_EXCLUSIVE_KINDS.has(kind)) continue
    const sk = semanticFactSubjectKind(entry.item)
    if (!sk) continue
    const bucket = bySubjectKind.get(sk)
    if (bucket) bucket.push(entry)
    else bySubjectKind.set(sk, [entry])
  }

  for (const group of bySubjectKind.values()) {
    if (group.length < 2) continue
    const distinct = distinctByKey(group)
    if (distinct.length < 2) continue
    const ranked = distinct.slice().sort((a, b) => b.evidenceIds.length - a.evidenceIds.length)
    const best = ranked[0]
    const second = ranked[1]
    if (!best || !second) continue
    if (best.evidenceIds.length === second.evidenceIds.length) {
      for (const entry of distinct) consumed.add(entry.canonicalKey)
      gapSeq += 1
      conflicts.push({
        id: `gap_${String(gapSeq).padStart(3, '0')}`,
        origin: 'claim',
        question: `conflicting values for ${semanticFactSubjectKind(best.item)}: ${distinct.map((e) => e.canonicalKey).join(' vs ')}`,
        targetClaimKey: best.canonicalKey,
        evidenceIds: uniqueSorted(distinct.flatMap((e) => e.evidenceIds)),
        status: 'open',
        round: Math.max(...distinct.map((e) => e.round)),
      })
    } else {
      for (const entry of distinct) {
        if (entry.canonicalKey !== best.canonicalKey) consumed.add(entry.canonicalKey)
      }
    }
  }

  for (const [key, entry] of mergedByKey) {
    if (consumed.has(key)) continue
    winners.push(entry)
  }

  winners.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey) || a.section.localeCompare(b.section))
  return { winners, conflicts }
}

function mergeIdenticalKey(group: ClaimEntry[]): ClaimEntry {
  const sorted = group.slice().sort((a, b) => {
    const support = supportRank(b.support) - supportRank(a.support)
    if (support !== 0) return support
    const evidence = b.evidenceIds.length - a.evidenceIds.length
    if (evidence !== 0) return evidence
    return `${a.producedBy}:${a.round}`.localeCompare(`${b.producedBy}:${b.round}`)
  })
  const head = sorted[0]
  if (!head) throw new Error('mergeIdenticalKey: empty group')
  const evidenceIds = uniqueSorted(group.flatMap((entry) => entry.evidenceIds))
  const support = sorted.reduce<Support>((best, entry) => {
    return supportRank(entry.support) > supportRank(best) ? entry.support : best
  }, head.support)
  return { ...head, evidenceIds, support }
}

function distinctByKey(group: ClaimEntry[]): ClaimEntry[] {
  const seen = new Map<string, ClaimEntry>()
  for (const entry of group) {
    if (!seen.has(entry.canonicalKey)) seen.set(entry.canonicalKey, entry)
  }
  return [...seen.values()]
}

export function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))].sort()
}

export function claimsBySupport(claims: ClaimEntry[]): Record<Support, number> {
  const out: Record<Support, number> = { observed: 0, varied: 0, refuted_attempt: 0 }
  for (const claim of claims) out[claim.support] += 1
  return out
}

export function gapsByStatus(gaps: GapEntry[]): Record<GapEntry['status'], number> {
  const out: Record<GapEntry['status'], number> = {
    open: 0,
    planned: 0,
    attempted: 0,
    resolved: 0,
    unreachable: 0,
  }
  for (const gap of gaps) out[gap.status] += 1
  return out
}

export function refutationRate(claims: ClaimEntry[]): number {
  const target = claims.filter((c) => {
    if (c.section !== 'semantic_facts') return false
    const kind = c.item.kind
    return kind === 'business_constraint' || kind === 'validation' || kind === 'derived_value'
  })
  if (target.length === 0) return 0
  const refuted = target.filter((c) => c.support === 'refuted_attempt').length
  return refuted / target.length
}
