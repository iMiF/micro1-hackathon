import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { NetworkRecorder, type NetworkEvent } from './network.js'
import { observePage, selectorForHandle, type PageObservation } from './observe.js'

/**
 * The browser driver: launch, navigate, act, observe.
 *
 * Mechanics only (ADR-10). It executes what it is told and records what
 * happened; it never chooses what to do next and never interprets a result.
 * Nothing here knows the difference between the baseline and AAE.
 */

export interface DriverOptions {
  baseUrl: string
  headless?: boolean
  /** Per-action timeout. A slow app should fail loudly, not hang the run. */
  actionTimeoutMs?: number
  /** Screenshot bytes are written by the caller; the driver only produces them. */
  captureScreenshots?: boolean
}

export interface ActionResult {
  ok: boolean
  error?: string
  /** Events that started during this action. */
  networkEvents: NetworkEvent[]
  screenshot?: Buffer
}

export class BrowserDriver {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private handles = new Map<string, number>()
  private lastObservation: PageObservation | null = null

  readonly network = new NetworkRecorder()

  constructor(private readonly options: DriverOptions) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.options.headless ?? true })
    this.context = await this.browser.newContext({ baseURL: this.options.baseUrl })
    this.context.setDefaultTimeout(this.options.actionTimeoutMs ?? 10_000)
    this.page = await this.context.newPage()
    this.network.attach(this.page)
  }

  async stop(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    this.browser = null
    this.context = null
    this.page = null
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('driver not started')
    return this.page
  }

  setStep(step: number): void {
    this.network.setStep(step)
  }

  async goto(path: string): Promise<ActionResult> {
    return this.act(async (page) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
    })
  }

  async observe(): Promise<PageObservation> {
    const page = this.requirePage()
    await this.network.settle()
    const { observation, handles } = await observePage(page)
    this.handles = handles
    this.lastObservation = observation
    return observation
  }

  /** The observation the current element ids belong to. */
  currentObservation(): PageObservation | null {
    return this.lastObservation
  }

  async click(elementId: string): Promise<ActionResult> {
    return this.withElement(elementId, async (page, selector) => {
      await page.click(selector)
    })
  }

  async fill(elementId: string, value: string): Promise<ActionResult> {
    return this.withElement(elementId, async (page, selector) => {
      await page.fill(selector, value)
    })
  }

  async select(elementId: string, value: string): Promise<ActionResult> {
    return this.withElement(elementId, async (page, selector) => {
      await page.selectOption(selector, value)
    })
  }

  async goBack(): Promise<ActionResult> {
    return this.act(async (page) => {
      await page.goBack({ waitUntil: 'domcontentloaded' })
    })
  }

  /** Label of an element id, for evidence and the trajectory log. */
  labelOf(elementId: string): string | null {
    return this.lastObservation?.elements.find((e) => e.id === elementId)?.label ?? null
  }

  private async withElement(
    elementId: string,
    action: (page: Page, selector: string) => Promise<void>,
  ): Promise<ActionResult> {
    const index = this.handles.get(elementId)
    if (index === undefined) {
      return {
        ok: false,
        error: `unknown element id ${elementId}; call observe_page() again — ids are re-issued on every observation`,
        networkEvents: [],
      }
    }
    return this.act((page) => action(page, selectorForHandle(index)))
  }

  private async act(action: (page: Page) => Promise<void>): Promise<ActionResult> {
    const page = this.requirePage()
    const marker = this.network.all().at(-1)?.id
    try {
      await action(page)
      await this.network.settle()
      const result: ActionResult = { ok: true, networkEvents: this.network.since(marker) }
      if (this.options.captureScreenshots) result.screenshot = await page.screenshot()
      return result
    } catch (error) {
      await this.network.settle()
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        networkEvents: this.network.since(marker),
      }
    }
  }
}
