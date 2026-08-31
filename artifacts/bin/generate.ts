import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { generateArtifacts } from '../src/generate.js'
import { resolveRunDir } from '../src/rundir.js'

/**
 * Render reconstruction.json into OpenAPI + API.md.
 *
 *   npm run artifacts:generate -- <run-id>
 *   npx tsx artifacts/bin/generate.ts aae-2026-08-31T14-51-18-382Z
 *
 * Explicit paths still work for files that are not a scored run:
 *   --submission <reconstruction.json> --out <dir>
 */

function parseArgs(argv: string[]): {
  run?: string
  submission?: string
  out?: string
  help?: boolean
} {
  const args: { run?: string; submission?: string; out?: string; help?: boolean } = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--run') args.run = argv[++i]
    else if (a === '--submission') args.submission = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
    else if (a && !a.startsWith('-')) {
      if (args.run) throw new Error(`Unexpected argument: ${a}`)
      args.run = a
    } else {
      throw new Error(`Unknown argument: ${a}`)
    }
  }
  return args
}

const HELP = `Usage: npx tsx artifacts/bin/generate.ts <run-id>
       npx tsx artifacts/bin/generate.ts --run <run-id>
       npx tsx artifacts/bin/generate.ts --submission <reconstruction.json> --out <dir>

  <run-id>              Directory name under results/runs/ (or a path to it).
                        Reads reconstruction.json and writes artifacts/ next to it.
  --submission <path>   Reconstruction JSON when it is not a scored run.
  --out <dir>           Output directory (default with --run: <run>/artifacts).
`

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }
  let submissionPath = args.submission
  let outDir = args.out
  if (args.run) {
    const runDir = resolveRunDir(args.run)
    submissionPath = submissionPath ?? join(runDir, 'reconstruction.json')
    outDir = outDir ?? join(runDir, 'artifacts')
  }
  if (!submissionPath || !outDir) {
    process.stderr.write(HELP)
    process.exit(1)
  }
  if (!existsSync(submissionPath)) {
    throw new Error(`submission not found: ${submissionPath}`)
  }
  const submission = JSON.parse(readFileSync(resolve(submissionPath), 'utf8')) as unknown
  const result = generateArtifacts({ submission, outDir: resolve(outDir) })
  console.log(`wrote ${result.openapiPath}`)
  console.log(`wrote ${result.markdownPath}`)
}

main()
