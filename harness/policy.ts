import type { ObservedElement } from '../tooling/browser/observe.js'

/**
 * Risk policy (docs/07 §2).
 *
 * Classification happens BEFORE the action, from the UI element and the request
 * it is expected to cause. The boundary lives here, in code, not in a prompt —
 * that is the whole point: a prompt can be argued with, a gate cannot.
 */

export type RiskClass =
  | 'READ_ONLY'
  | 'SAFE_MUTATION'
  | 'REVERSIBLE'
  | 'DESTRUCTIVE'
  | 'EXTERNAL_SIDE_EFFECT'
  | 'UNKNOWN'

export type PolicyVerdict = 'allow' | 'block' | 'needs_approval'

export interface PolicyDecision {
  riskClass: RiskClass
  verdict: PolicyVerdict
  reason: string
}

/**
 * `strict` is the documented default of docs/07: UNKNOWN blocks, because an
 * unrecognized action is treated as dangerous rather than safe.
 *
 * `sandbox` is for the benchmark itself, where the target is our own synthetic
 * app reset before every run (docs/07 §1, §4). There UNKNOWN is allowed and
 * logged: with UNKNOWN blocking, an agent exploring an app it has never seen is
 * stopped at almost every click, and the benchmark would measure the policy
 * rather than the agent. DESTRUCTIVE still never runs unattended in either
 * profile.
 *
 * The profile is part of the run configuration and identical for both systems,
 * so it can never advantage one of them — and it is reported, not assumed.
 */
export type PolicyProfile = 'strict' | 'sandbox'

const DESTRUCTIVE_LABEL = /\b(delete|remove|destroy|purge|drop|reset password)\b/i
/** Archiving is reversible in MiniCRM (`sem-customer-archive-reversible`). */
const REVERSIBLE_LABEL = /\b(archive|unarchive|restore|cancel|mark|status|confirm)\b/i
const EXTERNAL_LABEL = /\b(send|email|invite|publish|pay|charge|refund|export)\b/i
const SUBMIT_LABEL = /\b(save|create|add|submit|apply|update)\b/i

export interface PolicyInput {
  element: ObservedElement
  /** `fill` and `select` change local form state only until something submits. */
  action: 'click' | 'fill' | 'select' | 'goto' | 'go_back'
  /** Case-level allowlist of element labels permitted to mutate. */
  allowlist?: string[]
}

export function classify(input: PolicyInput): RiskClass {
  const { element, action } = input

  if (action === 'goto' || action === 'go_back') return 'READ_ONLY'
  if (action === 'fill' || action === 'select') return 'READ_ONLY'

  const label = element.label ?? ''

  if (EXTERNAL_LABEL.test(label)) return 'EXTERNAL_SIDE_EFFECT'
  if (DESTRUCTIVE_LABEL.test(label)) return 'DESTRUCTIVE'
  if (REVERSIBLE_LABEL.test(label)) return 'REVERSIBLE'
  if (element.role === 'link') return 'READ_ONLY'
  if (element.type === 'submit' || SUBMIT_LABEL.test(label)) return 'SAFE_MUTATION'
  if (element.role === 'checkbox') return 'READ_ONLY'

  return 'UNKNOWN'
}

export function decide(input: PolicyInput, profile: PolicyProfile): PolicyDecision {
  const riskClass = classify(input)
  const allowlisted = (input.allowlist ?? []).some((entry) =>
    (input.element.label ?? '').toLowerCase().includes(entry.toLowerCase()),
  )

  switch (riskClass) {
    case 'READ_ONLY':
      return { riskClass, verdict: 'allow', reason: 'read-only action' }
    case 'SAFE_MUTATION':
      return { riskClass, verdict: 'allow', reason: 'mutation inside a reset sandbox; logged' }
    case 'REVERSIBLE':
      return allowlisted
        ? { riskClass, verdict: 'allow', reason: 'reversible and on the case allowlist' }
        : { riskClass, verdict: 'allow', reason: 'reversible in a reset sandbox; logged' }
    case 'DESTRUCTIVE':
      return allowlisted
        ? { riskClass, verdict: 'needs_approval', reason: 'destructive; allowlisted but gated' }
        : { riskClass, verdict: 'block', reason: 'destructive action blocked by policy' }
    case 'EXTERNAL_SIDE_EFFECT':
      return { riskClass, verdict: 'block', reason: 'possible effect outside the target' }
    case 'UNKNOWN':
      return profile === 'sandbox'
        ? { riskClass, verdict: 'allow', reason: 'unrecognized action allowed in sandbox profile; logged' }
        : { riskClass, verdict: 'block', reason: 'unrecognized action treated as dangerous' }
  }
}
