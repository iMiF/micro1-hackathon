import { DISCLAIMER } from './disclaimer.js'
import type { PublicCatalogEntry } from './catalog.js'

const SWAGGER_UI_VERSION = '5.27.0'

export function previewPageHtml(input: {
  catalog: PublicCatalogEntry[]
  initialId: string
  livePath: string
}): string {
  const payload = embedJson({
    catalog: input.catalog,
    initialId: input.initialId,
    disclaimer: DISCLAIMER,
    livePath: input.livePath,
  })
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AAE · reconstructed API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css">
  <style>
    :root {
      --bg: #0f1419;
      --panel: #171d24;
      --line: #2a3440;
      --text: #e8eef4;
      --muted: #9aa8b6;
      --accent: #e8b84a;
      --warn-bg: #3a2e12;
      --warn-text: #f3d48a;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: #fafafa; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color: #1b1f24; }
    .top {
      background: var(--bg);
      color: var(--text);
      border-bottom: 1px solid var(--line);
    }
    .top-inner {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      align-items: center;
      padding: 12px 20px 10px;
    }
    .brand { font-weight: 650; letter-spacing: 0.02em; white-space: nowrap; }
    .brand span { color: var(--accent); font-weight: 500; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 1; }
    select, button, .tab {
      font: inherit;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      padding: 6px 10px;
    }
    select { min-width: min(520px, 100%); flex: 1; }
    button, .tab { cursor: pointer; }
    button:hover, .tab:hover { border-color: #4a5664; }
    .tabs { display: flex; gap: 6px; }
    .tab[aria-selected="true"] { background: #2a3542; border-color: var(--accent); }
    .meta { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .disclaimer {
      background: var(--warn-bg);
      color: var(--warn-text);
      font-size: 12px;
      line-height: 1.45;
      padding: 8px 20px 10px;
    }
    #swagger-ui { display: block; }
    #markdown-view { display: none; padding: 20px 24px 48px; max-width: 980px; margin: 0 auto; }
    #markdown-view pre {
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 0;
    }
    .empty { padding: 48px 24px; text-align: center; color: #667; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title small { display: none; }
  </style>
</head>
<body>
  <header class="top">
    <div class="top-inner">
      <div class="brand">AAE <span>draft spec</span></div>
      <div class="controls">
        <label class="meta" for="spec-select">Artifact</label>
        <select id="spec-select" aria-label="Available artifacts"></select>
        <div class="tabs" role="tablist">
          <button class="tab" id="tab-swagger" role="tab" aria-selected="true">OpenAPI</button>
          <button class="tab" id="tab-markdown" role="tab" aria-selected="false">API.md</button>
        </div>
        <button type="button" id="reload">Reload</button>
      </div>
      <div class="meta" id="spec-meta"></div>
    </div>
    <div class="disclaimer" id="disclaimer"></div>
  </header>
  <main>
    <div id="swagger-ui"></div>
    <div id="markdown-view"><pre id="markdown-body"></pre></div>
    <div class="empty" id="empty" hidden>No reconstructed artifacts found under results/runs/. Run an agent, or generate with <code>npm run artifacts:generate -- &lt;run-id&gt;</code>.</div>
  </main>
  <script type="application/json" id="preview-data">${payload}</script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    const data = JSON.parse(document.getElementById('preview-data').textContent)
    const select = document.getElementById('spec-select')
    const meta = document.getElementById('spec-meta')
    const disclaimer = document.getElementById('disclaimer')
    const empty = document.getElementById('empty')
    const swaggerEl = document.getElementById('swagger-ui')
    const markdownView = document.getElementById('markdown-view')
    const markdownBody = document.getElementById('markdown-body')
    const tabSwagger = document.getElementById('tab-swagger')
    const tabMarkdown = document.getElementById('tab-markdown')
    disclaimer.textContent = data.disclaimer
    let view = 'swagger'
    let ui = null

    function fillSelect() {
      select.innerHTML = ''
      for (const entry of data.catalog) {
        const opt = document.createElement('option')
        opt.value = entry.id
        opt.textContent = entry.label
        select.appendChild(opt)
      }
      if (data.initialId) select.value = data.initialId
    }

    function current() {
      return data.catalog.find((e) => e.id === select.value) || data.catalog[0]
    }

    function specUrl(id) {
      return '/api/specs/' + encodeURIComponent(id) + '/openapi.json'
    }

    function renderMeta(entry) {
      if (!entry) { meta.textContent = ''; return }
      const bits = []
      if (entry.kind === 'reference') bits.push('reference example, not an agent run')
      if (entry.vars != null) bits.push('VARS ' + Number(entry.vars).toFixed(2))
      if (entry.operations != null) bits.push(entry.operations + ' operations')
      if (entry.model) bits.push(entry.model)
      meta.textContent = bits.join(' · ')
    }

    function showSwagger() {
      view = 'swagger'
      tabSwagger.setAttribute('aria-selected', 'true')
      tabMarkdown.setAttribute('aria-selected', 'false')
      swaggerEl.style.display = 'block'
      markdownView.style.display = 'none'
    }

    function showMarkdown() {
      view = 'markdown'
      tabSwagger.setAttribute('aria-selected', 'false')
      tabMarkdown.setAttribute('aria-selected', 'true')
      swaggerEl.style.display = 'none'
      markdownView.style.display = 'block'
    }

    function mountSwagger(url) {
      swaggerEl.innerHTML = ''
      ui = SwaggerUIBundle({
        url: url,
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        defaultModelsExpandDepth: 1,
        displayRequestDuration: true,
        withCredentials: true,
      })
    }

    async function loadMarkdown(id) {
      markdownBody.textContent = 'Loading…'
      const res = await fetch('/api/specs/' + encodeURIComponent(id) + '/API.md')
      markdownBody.textContent = await res.text()
    }

    function loadCurrent() {
      const entry = current()
      renderMeta(entry)
      if (!entry) return
      const url = specUrl(entry.id)
      if (view === 'swagger') mountSwagger(url)
      else loadMarkdown(entry.id)
    }

    fillSelect()
    if (data.catalog.length === 0) {
      empty.hidden = false
      swaggerEl.hidden = true
    } else {
      empty.hidden = true
      loadCurrent()
    }

    select.addEventListener('change', () => {
      const entry = current()
      renderMeta(entry)
      if (!entry) return
      if (view === 'swagger') mountSwagger(specUrl(entry.id))
      else loadMarkdown(entry.id)
    })
    tabSwagger.addEventListener('click', () => {
      showSwagger()
      const entry = current()
      if (entry) mountSwagger(specUrl(entry.id))
    })
    tabMarkdown.addEventListener('click', () => {
      showMarkdown()
      const entry = current()
      if (entry) loadMarkdown(entry.id)
    })
    document.getElementById('reload').addEventListener('click', () => location.reload())
  </script>
</body>
</html>
`
}

function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
