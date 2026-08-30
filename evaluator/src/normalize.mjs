// Step 2 of the evaluator algorithm (docs/05 §7): "Normalize -- Methods, paths,
// identifiers, whitespace, canonical labels -- per the defined rules." Every rule
// implemented here is declared in docs/04-benchmark-contract.md §4 and in
// config/canonical-vocabulary.json. Nothing here interprets meaning: no synonym
// lookup, no stemming, no distance metric. Two strings that a human would agree
// are "the same idea" but that these rules don't unify are, by design, not a match --
// that unfairness is disclosed, not hidden (docs/05 §2, ADR-14).

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Rule 2 (docs/04 §4): methods are upper-case. */
export function normalizeMethod(method) {
  if (typeof method !== 'string') return method;
  return method.trim().toUpperCase();
}

/**
 * Rule 1 (docs/04 §4): paths are normalized. Ground truth already writes paths
 * in final normalized form (placeholders already substituted by the benchmark
 * author -- see docs/04 §1 and emit-ground-truth.mjs). The evaluator's job is
 * NOT to guess which path segments are identifiers; that guess is the agent's
 * job, using the published placeholder convention (config/canonical-vocabulary.json
 * path_placeholders). The evaluator only does formatting normalization: trim,
 * force a leading slash, collapse repeated slashes, drop a trailing slash
 * (except the root path itself). Placeholder names are left exactly as given.
 */
export function normalizePath(pathStr) {
  if (typeof pathStr !== 'string') return pathStr;
  let s = pathStr.trim();
  if (s.length === 0) return s;
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/**
 * Normalizes an operation reference of the shape "METHOD /path" (used as
 * semantic_facts.subject when the subject is an operation, and as
 * dependencies[].source_operation / target_operation, and as
 * workflow steps[].operation). The literal wildcard "*" (docs: "source_operation:
 * ... or * for any matching request") passes through unchanged, including
 * "METHOD *" forms. Anything that doesn't look like "METHOD /path" or "*" is
 * returned trimmed and otherwise untouched -- it is not this function's job to
 * decide whether a free-text subject is well-formed.
 */
export function normalizeOperationRef(ref) {
  if (typeof ref !== 'string') return ref;
  const trimmed = ref.trim();
  if (trimmed === '*') return '*';
  const m = trimmed.match(/^(\S+)\s+(.+)$/);
  if (!m) return trimmed;
  const [, method, rest] = m;
  if (!HTTP_METHODS.has(method.toUpperCase())) return trimmed;
  const restTrimmed = rest.trim();
  if (restTrimmed === '*') return `${method.toUpperCase()} *`;
  return `${method.toUpperCase()} ${normalizePath(restTrimmed)}`;
}

/**
 * A semantic_facts.subject is free text (schema: {"type": "string"}), but a
 * sizeable minority of ground-truth subjects ARE operation references
 * ("POST /api/auth/login", "PATCH /api/orders/{id}/status", ...). Where a
 * subject looks like one, apply the same operation normalization so an agent
 * that writes an equivalent but differently-formatted operation string still
 * matches. Anything else (e.g. "auth.cookie", "order snapshots") is only
 * whitespace-trimmed -- no case-folding, because subjects like "*Cents" and
 * "order.paymentStatus" are case-sensitive field-path-shaped tokens.
 */
export function normalizeSubject(subject) {
  if (typeof subject !== 'string') return subject;
  const trimmed = subject.trim();
  const looksLikeOperation = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S/i.test(trimmed);
  if (looksLikeOperation) return normalizeOperationRef(trimmed);
  return trimmed;
}

/**
 * Rule 6 (docs/04 §4): field references in dependencies use declared prefixes
 * header:, cookie:, Set-Cookie:, and JSONPath ($.field) for body fields; path
 * placeholders ({id}) also appear as bare target_field values. header: names
 * are case-folded because HTTP header names are case-insensitive on the wire
 * (RFC 7230 §3.2); cookie: and Set-Cookie: names are left as-is (cookie names
 * are case-sensitive per RFC 6265, and this benchmark only ever uses one:
 * "sid"); "$." JSONPath and "{param}" segments are left exactly as given
 * because JSON field names and placeholder names are case-sensitive.
 */
export function normalizeFieldRef(ref) {
  if (typeof ref !== 'string') return ref;
  const trimmed = ref.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('header:')) {
    return 'header:' + trimmed.slice('header:'.length).trim().toLowerCase();
  }
  if (lower.startsWith('set-cookie:')) {
    return 'Set-Cookie:' + trimmed.slice('set-cookie:'.length).trim();
  }
  if (lower.startsWith('cookie:')) {
    return 'cookie:' + trimmed.slice('cookie:'.length).trim();
  }
  return trimmed;
}

const UNORDERED_VALUE_KEYS = new Set(['to', 'accepts', 'matches', 'requires', 'base', 'excludedStatusIds']);

/**
 * Rule 5 (docs/04 §4, ADR-14): semantic_facts.value is either an observable
 * scalar -- returned untouched except for trimming a string -- or a
 * definitions.semanticFactValue object. Object values are normalized
 * recursively: keys are not reordered by this function (stableStringify does
 * that at comparison time), but arrays under keys declared unordered in
 * config/canonical-vocabulary.json (unordered_value_keys) are sorted, because
 * ground truth's array order there (e.g. state_transition.to = [20, 50]) is
 * incidental, not semantic. Arrays under any other key (there are none in the
 * current vocabulary) are left in submitted order.
 */
export function normalizeValue(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (Array.isArray(v) && UNORDERED_VALUE_KEYS.has(k)) {
      out[k] = v.map(normalizeValue).slice().sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    } else {
      out[k] = normalizeValue(v);
    }
  }
  return out;
}

/** Deterministic JSON stringification with sorted object keys, used to build
 * canonical matching keys out of normalized values. Never used for anything
 * except equality comparison -- it is not meant to be human-authored JSON. */
export function stableStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function normalizeBool(v) {
  return v === true;
}
