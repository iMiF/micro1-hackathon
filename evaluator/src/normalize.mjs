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
 * Rule 1 (docs/04 §4, fixed 2026-08-30): paths are normalized -- concrete
 * identifiers AND path-parameter NAMES are both erased to a bare `{}`
 * segment. `/api/customers/12/addresses`, `/api/customers/{id}/addresses`
 * and `/api/customers/{customerId}/addresses` all reduce to the same
 * `/api/customers/{}/addresses`.
 *
 * This must behave identically to `tooling/browser/paths.ts` normalizePath --
 * docs/04 §4 rule 1 says so explicitly ("two implementations of this rule
 * will disagree"), and until this fix they did: this file used to do only
 * formatting normalization and leave placeholder names exact (see git
 * history / evaluator/README.md "Known interpretation calls" for the old
 * text), while paths.ts already erased names, per a docs/04 §4 edit that
 * landed in the same commit as the harness and was never carried over here.
 * Confirmed live in the 2026-08-30 Haiku baseline run: the agent's `wf_001`
 * matched ground truth `wf-create-order` step-for-step except for
 * `{id}` vs `{customerId}` on one nested route, and that alone zeroed the
 * whole workflow under the old (exact-name) behavior.
 *
 * Ground truth's own placeholder naming is verified correct against the
 * live route source (`miniCRM/apps/api/src/routes/*.ts`, e.g. orders keep
 * `:id` even on nested routes, customers use `:customerId`/`:addressId`) --
 * this is a real inconsistency in the target app, not a ground-truth
 * authoring bug, so ground truth is not changed. An outside agent observing
 * only the browser has no way to recover which convention the server code
 * chose for a given nested route (confirmed by a concrete case: order
 * response bodies literally contain a field named `orderId`, which would
 * lead a careful agent to write `{orderId}` for a path ground truth calls
 * `{id}` -- the opposite of guessing wrong from carelessness). A
 * name-sensitive key would cost points for a correctly discovered
 * operation/dependency/workflow-step for reasons outside the agent's
 * control, so the name is erased in the matching key on both sides.
 */
export function normalizePath(pathStr) {
  if (typeof pathStr !== 'string') return pathStr;
  const withoutQuery = pathStr.split('?')[0] ?? pathStr;
  const withoutHash = withoutQuery.split('#')[0] ?? withoutQuery;
  const segments = withoutHash.split('/').filter((seg) => seg.length > 0);
  const normalized = segments.map((seg) => (isPathParamSegment(seg) ? '{}' : seg));
  return '/' + normalized.join('/');
}

/** Mirrors `tooling/browser/paths.ts` isConcreteId + isTemplated: a segment
 * that is a bare numeric/UUID id, or already a `{name}` / `:name` template,
 * is a path parameter regardless of what name (if any) it carries. */
function isPathParamSegment(segment) {
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  if (/^\{.*\}$/.test(segment)) return true;
  if (/^:.+/.test(segment)) return true;
  return false;
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
 * matches.
 *
 * Rule 8 (docs/04 §4, ADR-16): when the subject is an operation plus a query
 * parameter written in one of the three observationally equivalent forms
 * (`METHOD /path?param`, `METHOD /path param`, `METHOD /path query.param`),
 * canonicalize to `METHOD /normalizedPath?param`. `GET /api/customers/suggest`
 * is not rewritten -- `suggest` is a path segment, not a trailing query name.
 *
 * Anything else (e.g. "cookie:sid", "order.paymentStatus", "*Cents") is only
 * whitespace-trimmed -- no case-folding, because field-path-shaped tokens are
 * case-sensitive.
 */
export function normalizeSubject(subject) {
  if (typeof subject !== 'string') return subject;
  const trimmed = subject.trim();
  const looksLikeOperation = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S/i.test(trimmed);
  if (!looksLikeOperation) return trimmed;
  const m = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
  if (!m) return normalizeOperationRef(trimmed);
  const method = m[1].toUpperCase();
  let rest = m[2].trim();
  let param = null;
  const queryDot = rest.match(/^(\/\S+)\s+query\.(\w+)$/i);
  if (queryDot) {
    rest = queryDot[1];
    param = queryDot[2];
  } else {
    const spaceParam = rest.match(/^(\/[^\s?]+)\s+(\w+)$/);
    if (spaceParam) {
      rest = spaceParam[1];
      param = spaceParam[2];
    }
  }
  const qIdx = rest.indexOf('?');
  let pathPart = rest;
  if (qIdx >= 0) {
    const qs = rest.slice(qIdx + 1);
    pathPart = rest.slice(0, qIdx);
    if (!param) param = qs.split('&')[0].split('=')[0];
  }
  const path = normalizePath(pathPart);
  if (param) return `${method} ${path}?${param}`;
  return `${method} ${path}`;
}

/**
 * Rule 6 (docs/04 §4, extended 2026-08-30 to add `query.`): field references
 * in dependencies use declared prefixes header:, cookie:, Set-Cookie:,
 * `query.` for query-string parameters, and JSONPath ($.field) for body
 * fields; path placeholders ({id}) also appear as bare target_field values.
 * header: names are case-folded because HTTP header names are
 * case-insensitive on the wire (RFC 7230 §3.2); cookie: and Set-Cookie:
 * names are left as-is (cookie names are case-sensitive per RFC 6265, and
 * this benchmark only ever uses one: "sid"); "$." JSONPath and "query."
 * segments are left exactly as given because JSON field names and query
 * parameter names are case-sensitive (confirmed against the live route,
 * e.g. `request.query.country` in miniCRM/apps/api/src/routes/geo.ts).
 *
 * A bare `{param}` value (no prefix) is a path placeholder reused as a
 * field reference -- e.g. dependencies like dep-order-id-to-status use
 * `{id}` as target_field to mean "the id embedded in the target path".
 * Same ambiguity as Rule 1 (an agent cannot always recover which of the
 * published placeholder names ground truth chose for a given route), so it
 * gets the same treatment: collapsed to a bare `{}` for matching.
 *
 * Rule 7 (docs/04 §4, ADR-16): JSONPath array indexes are wildcarded. An
 * agent that copies `$.id` off a selected object, `$[].id` off an array
 * body, `$[*].id` (standard JSONPath), or `$.items[0].productId` off one
 * captured request is naming the same field. Concrete indexes, empty
 * brackets, and `*` all collapse to `[]`; a root `$[]` / `$[*]` prefix
 * (ground truth's `$[].id`) collapses to `$.` so it matches `$.id`.
 * Applied only to `$`-prefixed refs -- `query.`, `header:`, `cookie:` are
 * untouched here. `*` as a *target operation* is a different slot and is
 * not unified with a concrete endpoint.
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
  if (/^\{.*\}$/.test(trimmed)) {
    return '{}';
  }
  if (trimmed.startsWith('$')) {
    return normalizeJsonPath(trimmed);
  }
  return trimmed;
}

/** Collapse JSONPath array indexes to `[]` and a root `$[]` prefix to `$.`. */
export function normalizeJsonPath(path) {
  let s = path.replace(/\[(\d+|\*)?\]/g, '[]');
  s = s.replace(/^\$\[\]\.?/, '$.');
  if (s === '$.') return '$';
  return s;
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
      const items = k === 'accepts' ? v.map(coerceAcceptsItem) : v.map(normalizeValue);
      out[k] = items.slice().sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    } else {
      out[k] = normalizeValue(v);
    }
  }
  return out;
}

/**
 * Rule 8 (docs/04 §4, ADR-16): query strings on the wire are `"true"` / `"false"`
 * while JSON and ground truth use booleans. Only applied inside `accepts`,
 * never to free-text enum values like `"unpaid"`.
 */
function coerceAcceptsItem(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return normalizeValue(v);
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
