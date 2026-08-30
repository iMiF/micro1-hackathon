// Small filesystem helpers. No parsing logic beyond JSON.parse lives here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const EVALUATOR_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PROJECT_ROOT = path.dirname(EVALUATOR_ROOT);

export function readJson(p) {
  const raw = readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error(`Not valid JSON: ${p}: ${err.message}`);
    e.cause = err;
    throw e;
  }
}

export function resolveFromProject(...parts) {
  return path.join(PROJECT_ROOT, ...parts);
}
