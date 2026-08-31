// Small filesystem helpers. No parsing logic beyond JSON.parse lives here.
import { existsSync, readFileSync, statSync } from 'node:fs';
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

/**
 * Resolve a run-id or path to results/runs/<id>/. Accepts the directory name,
 * a relative/absolute path to that directory, or a path to reconstruction.json.
 */
export function resolveRunDir(idOrPath) {
  const raw = String(idOrPath).replace(/[/\\]+$/, '');
  const candidates = [];
  if (path.isAbsolute(raw)) {
    candidates.push(raw);
  } else {
    candidates.push(path.resolve(raw));
    candidates.push(path.join(PROJECT_ROOT, raw));
    candidates.push(path.join(PROJECT_ROOT, 'results', 'runs', raw));
    candidates.push(path.join(PROJECT_ROOT, 'results', 'runs', path.basename(raw)));
  }
  for (const candidate of candidates) {
    const dir = reconstructionDir(candidate);
    if (dir) return dir;
  }
  throw new Error(`No run directory with reconstruction.json for "${idOrPath}" (looked under results/runs/)`);
}

function reconstructionDir(candidate) {
  if (existsSync(candidate) && statSync(candidate).isFile() && path.basename(candidate) === 'reconstruction.json') {
    return path.dirname(candidate);
  }
  const recon = path.join(candidate, 'reconstruction.json');
  if (existsSync(recon) && statSync(candidate).isDirectory()) return candidate;
  return null;
}
