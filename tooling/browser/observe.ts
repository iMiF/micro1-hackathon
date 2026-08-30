import type { Page } from 'playwright'

/**
 * Page observation (docs/02 §2, "Page" layer).
 *
 * The agent never sees a CSS selector and never invents one: it sees a list of
 * elements with harness-assigned ids and acts by id. That keeps the tool surface
 * identical for both systems and keeps every action replayable from the log.
 *
 * Element ids are stable for as long as the page does not change, and are
 * re-issued on every observation. An agent holding an id across a navigation
 * gets a clear error rather than a wrong click.
 */

export type ElementRole = 'link' | 'button' | 'textbox' | 'select' | 'checkbox' | 'other'

export interface ObservedElement {
  id: string
  role: ElementRole
  /** Accessible name: label, aria-label, or trimmed text. */
  label: string
  tag: string
  testId: string | null
  name: string | null
  type: string | null
  value: string | null
  href: string | null
  options: string[] | null
  enabled: boolean
}

export interface PageObservation {
  url: string
  path: string
  title: string
  /** Visible text of the page, collapsed and clipped. */
  text: string
  elements: ObservedElement[]
  observedAt: number
}

const MAX_TEXT_CHARS = 6000
const MAX_ELEMENTS = 200

/** Runs in the page. Returns plain data only — no interpretation (ADR-10). */
const COLLECT = `(maxElements) => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false
    const style = window.getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none'
  }
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria.trim()
    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
      if (label && label.textContent) return label.textContent.trim()
    }
    const wrapping = el.closest('label')
    if (wrapping && wrapping.textContent) return wrapping.textContent.trim()
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) return placeholder.trim()
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) return text
    return el.getAttribute('title') || el.getAttribute('name') || ''
  }
  const roleOf = (el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'select'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (type === 'checkbox' || type === 'radio') return 'checkbox'
      if (type === 'submit' || type === 'button') return 'button'
      return 'textbox'
    }
    if (el.getAttribute('role') === 'button') return 'button'
    return 'other'
  }
  const selector = 'a[href], button, input, select, textarea, [role="button"], [data-testid]'
  document.querySelectorAll('[data-aae-el]').forEach((el) => el.removeAttribute('data-aae-el'))
  const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisible)
  const elements = nodes.slice(0, maxElements).map((el, index) => {
    // Stamped so a handle can be resolved later without the agent ever seeing a
    // selector. The target never reads this attribute; it is cleared on the next
    // observation and does not survive navigation.
    el.setAttribute('data-aae-el', String(index))
    return {
    index,
    role: roleOf(el),
    label: nameOf(el).slice(0, 200),
    tag: el.tagName.toLowerCase(),
    testId: el.getAttribute('data-testid'),
    name: el.getAttribute('name'),
    type: el.getAttribute('type'),
    value: 'value' in el && typeof el.value === 'string' ? el.value.slice(0, 200) : null,
    href: el.getAttribute('href'),
    options: el.tagName.toLowerCase() === 'select'
      ? Array.from(el.options).map((o) => o.value + '|' + o.textContent.trim())
      : null,
    enabled: !el.disabled,
    }
  })
  const text = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim()
  return { url: location.href, path: location.pathname, title: document.title, text, elements }
}`

/**
 * Handles are kept per observation so that `click('el-0007')` can be resolved
 * back to a real node without the agent ever touching a selector.
 */
export interface ObservationResult {
  observation: PageObservation
  /** el-id -> index into the DOM query used to produce it. */
  handles: Map<string, number>
}

export async function observePage(page: Page): Promise<ObservationResult> {
  const raw = (await page.evaluate(COLLECT as never, MAX_ELEMENTS)) as {
    url: string
    path: string
    title: string
    text: string
    elements: Array<Omit<ObservedElement, 'id'> & { index: number }>
  }

  const handles = new Map<string, number>()
  const elements: ObservedElement[] = raw.elements.map((element, position) => {
    const id = `el-${String(position + 1).padStart(4, '0')}`
    handles.set(id, element.index)
    return {
      id,
      role: element.role,
      label: element.label,
      tag: element.tag,
      testId: element.testId,
      name: element.name,
      type: element.type,
      value: element.value,
      href: element.href,
      options: element.options,
      enabled: element.enabled,
    }
  })

  return {
    observation: {
      url: raw.url,
      path: raw.path,
      title: raw.title,
      text: raw.text.slice(0, MAX_TEXT_CHARS),
      elements,
      observedAt: Date.now(),
    },
    handles,
  }
}

/** Resolves a harness element id back to a real node. Never exposed to the agent. */
export function selectorForHandle(index: number): string {
  return `[data-aae-el="${index}"]`
}
