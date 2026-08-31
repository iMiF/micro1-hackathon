import { spawn } from 'node:child_process'
import { startPreview } from '../src/preview.js'

/**
 * Serve Swagger UI over reconstructed OpenAPI drafts, with a dropdown of runs.
 *
 *   npm run artifacts:preview
 *   npx tsx artifacts/bin/preview.ts --run aae-2026-08-31T14-51-18-382Z
 */

function parseArgs(argv: string[]): {
  port?: number
  host?: string
  run?: string
  target?: string
  open?: boolean
  reference?: boolean
  help?: boolean
} {
  const args: {
    port?: number
    host?: string
    run?: string
    target?: string
    open?: boolean
    reference?: boolean
    help?: boolean
  } = { reference: true }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--port') args.port = Number(argv[++i])
    else if (a === '--host') args.host = argv[++i]
    else if (a === '--run') args.run = argv[++i]
    else if (a === '--target') args.target = argv[++i]
    else if (a === '--open') args.open = true
    else if (a === '--no-reference') args.reference = false
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

const HELP = `Usage: npx tsx artifacts/bin/preview.ts [run-id]

  Serves Swagger UI for reconstructed OpenAPI drafts under results/runs/*/artifacts/.
  The dropdown lists every run that has reconstruction.json or openapi.json.
  Switching artifacts does not add facts — it loads the file (or renders it
  from reconstruction.json if artifacts/ is missing).

  --run <id>         Select this run on load (also accepted as a bare argument)
  --port <n>         Listen port (default 8090)
  --host <addr>      Bind address (default 127.0.0.1)
  --target <url>     MiniCRM API for Try it out, proxied at /live (default http://127.0.0.1:3000)
  --open             Open the page in the default browser
  --no-reference     Hide the committed perfect-reconstruction example
`

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }
  if (args.port != null && !Number.isFinite(args.port)) {
    throw new Error('--port must be a number')
  }
  const preview = await startPreview({
    port: args.port,
    host: args.host,
    initialId: args.run,
    target: args.target,
    includeReference: args.reference,
  })
  const selected = args.run ? `?run=${encodeURIComponent(args.run)}` : ''
  const url = `${preview.url}${selected}`
  console.log(`AAE spec preview ${url}`)
  console.log('Switch artifacts in the top dropdown. OpenAPI tab is Swagger UI; API.md is the markdown draft.')
  console.log('Try it out is proxied to the local target and needs MiniCRM running. Draft — human review required.')
  if (args.open) openBrowser(url)
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const argv = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(cmd, argv, { stdio: 'ignore', detached: true }).unref()
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(message)
  process.exit(1)
})
