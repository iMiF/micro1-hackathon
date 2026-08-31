import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Resolve a run-id or path to results/runs/<id>/. Accepts the directory name,
 * a relative/absolute path to that directory, or a path to reconstruction.json.
 */
export function resolveRunDir(idOrPath: string, root = PROJECT_ROOT): string {
  const raw = idOrPath.replace(/[/\\]+$/, '')
  const candidates = isAbsolute(raw)
    ? [raw]
    : [
        resolve(raw),
        join(root, raw),
        join(root, 'results', 'runs', raw),
        join(root, 'results', 'runs', basename(raw)),
      ]
  for (const candidate of candidates) {
    const dir = reconstructionDir(candidate)
    if (dir) return dir
  }
  throw new Error(`No run directory with reconstruction.json for "${idOrPath}" (looked under results/runs/)`)
}

function reconstructionDir(candidate: string): string | null {
  try {
    const st = statSync(candidate)
    if (st.isFile() && basename(candidate) === 'reconstruction.json') return dirname(candidate)
    if (st.isDirectory() && existsSync(join(candidate, 'reconstruction.json'))) return candidate
  } catch {
    return null
  }
  return null
}
