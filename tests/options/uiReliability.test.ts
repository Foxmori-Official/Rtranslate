// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyConfigPatch, DEFAULT_CONFIG, type Config } from '../../src/shared/config'

const clone = <T>(value: T): T => structuredClone(value)
let stored: Config
let writes: unknown[]
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

async function boot(cfg = clone(DEFAULT_CONFIG), failed = false): Promise<void> {
  vi.resetModules()
  stored = clone(cfg)
  writes = []
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => path,
      sendMessage: vi.fn(async (msg: { kind: string; patch?: Partial<Config> }) => {
        if (msg.kind === 'getConfig') return failed ? { ok: false, error: 'storage unavailable' } : { ok: true, data: clone(stored) }
        if (msg.kind === 'setConfig') {
          writes.push(clone(msg.patch))
          stored = applyConfigPatch(stored, msg.patch ?? {})
          return { ok: true, data: clone(stored) }
        }
        return { ok: true, data: [] }
      }),
    },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) },
    storage: { local: { get: (_key: unknown, cb: (data: unknown) => void) => cb({}) } },
  })
  await import('../../src/options/main')
  await flush()
}
const q = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}
const key = (target: HTMLElement, value: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}
async function engineTab(): Promise<void> { q<HTMLButtonElement>('[data-tab="engine"]').click(); await flush() }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('options UI reliability', () => {
  it('shows a localized error instead of throwing while reading unavailable config', async () => {
    await boot(clone(DEFAULT_CONFIG), true)
    expect(q('#app').textContent).toContain('Failed to load config: Local data could not be saved.')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Rtranslate · Settings')
  })

  it('keeps auto out of both general and input target selectors, including legacy auto values', async () => {
    const cfg = clone(DEFAULT_CONFIG)
    cfg.general.targetLang = 'auto'
    cfg.input.targetLang = 'auto'
    await boot(cfg)
    const target = q<HTMLSelectElement>('.field select')
    expect(target.querySelector('option[value="auto"]')).toBeNull()
    expect(target.value).toBe(DEFAULT_CONFIG.general.targetLang)
    q<HTMLButtonElement>('[data-tab="interaction"]').click()
    const select = [...document.querySelectorAll('select')].at(-1)!
    expect(select.querySelector('option[value="auto"]')).toBeNull()
    expect(select.value).not.toBe('auto')
  })

  it('associates form captions and updates page metadata when language changes', async () => {
    await boot()
    for (const caption of document.querySelectorAll<HTMLLabelElement>('label.field-label')) {
      if (!caption.htmlFor) continue
      expect(document.getElementById(caption.htmlFor)).toBeTruthy()
    }
    const language = [...document.querySelectorAll<HTMLSelectElement>('select')].find(select => select.querySelector('option[value="de"]') && select.querySelector('option[value="auto"]'))!
    language.value = 'de'
    language.dispatchEvent(new Event('change'))
    await flush()
    expect(document.documentElement.lang).toBe('de')
    expect(document.title).toBe('Rtranslate · Einstellungen')
    expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Anzeigemodus')
  })

  it('supports Enter/arrows/Home/End/Escape/Tab and reflects a single selected engine', async () => {
    const cfg = clone(DEFAULT_CONFIG); cfg.engine.provider = 'foxmori'
    await boot(cfg); await engineTab()
    let trigger = q<HTMLButtonElement>('.engine-select-btn')
    trigger.focus(); key(trigger, 'Enter')
    const list = q<HTMLElement>('[role="listbox"]')
    expect(trigger.getAttribute('aria-controls')).toBe(list.id)
    expect(list.getAttribute('aria-labelledby')).toBe(trigger.id)
    expect(document.activeElement).toBe(list.querySelector('[aria-selected="true"]'))
    expect(document.activeElement?.textContent).toBe('Foxmori')
    key(document.activeElement as HTMLElement, 'ArrowDown')
    key(document.activeElement as HTMLElement, ' ')
    await flush()
    expect(stored.engine.provider).toBe('google')
    trigger = q<HTMLButtonElement>('.engine-select-btn')
    expect(document.activeElement).toBe(trigger)
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1)
    key(trigger, 'ArrowDown'); key(document.activeElement as HTMLElement, 'End')
    expect(document.activeElement?.classList.contains('engine-select-add')).toBe(true)
    key(document.activeElement as HTMLElement, 'Home')
    expect(document.activeElement?.textContent).toBe('Foxmori')
    key(document.activeElement as HTMLElement, 'Escape')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    key(trigger, 'ArrowDown')
    expect(key(document.activeElement as HTMLElement, 'Tab').defaultPrevented).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('marks the visible add-engine pseudo-option selected without changing provider', async () => {
    const cfg = clone(DEFAULT_CONFIG); cfg.engine.provider = 'foxmori'
    await boot(cfg); await engineTab()
    q<HTMLButtonElement>('.engine-select-add').click()
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1)
    expect(q('.engine-select-add').getAttribute('aria-selected')).toBe('true')
    expect(stored.engine.provider).toBe('foxmori')
  })

  it('shows new-key/model requirements and never places the legacy key into the Foxmori field', async () => {
    const cfg = clone(DEFAULT_CONFIG)
    cfg.engine.provider = 'foxmori'; cfg.engine.keys.aimao = 'legacy-secret'
    await boot(cfg); await engineTab()
    expect(q('.engine-config').textContent).toContain('Enter a new key and model ID')
    expect(q<HTMLInputElement>('.engine-config input[type="password"]').value).toBe('')
    expect(q<HTMLInputElement>('.engine-config input[type="text"]').value).toBe('')
    expect(document.body.textContent).not.toContain('legacy-secret')
    expect([...document.querySelectorAll('a')].some(link => link.href.includes('aimao.today'))).toBe(false)
  })

  it('explains masking limits in the settings UI instead of promising no sensitive text leaves', async () => {
    await boot()
    q<HTMLButtonElement>('[data-tab="privacy"]').click()
    expect(q('.card-mask').textContent).toContain('Detection can miss data')
    expect(q('.card-mask').textContent).toContain('AI actions, language detection and extra context')
  })

  it('captures delta before waiting for host permission, preserving a concurrent timeout update', async () => {
    const cfg = clone(DEFAULT_CONFIG)
    cfg.engine.provider = 'openai'; cfg.engine.openai.endpoint = 'https://pending.example/v1'
    await boot(cfg); await engineTab()
    let grant!: (value: boolean) => void
    let prompted = false
    vi.mocked(chrome.permissions.contains).mockImplementation(async () => {
      if (!prompted) { prompted = true; return false }
      return true
    })
    vi.mocked(chrome.permissions.request).mockImplementation(() => new Promise<boolean>(resolve => { grant = resolve }))
    const model = q<HTMLInputElement>('input[placeholder="gpt-4o-mini"]')
    model.value = 'new-model'; model.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(chrome.permissions.request).toHaveBeenCalledTimes(1))
    const timeout = q<HTMLInputElement>('input[type="number"]')
    timeout.value = '31000'; timeout.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(stored.engine.timeoutMs).toBe(31000))
    grant(true)
    await vi.waitFor(() => expect(stored.engine.openai.model).toBe('new-model'))
    expect(stored.engine.timeoutMs).toBe(31000)
    expect(writes).toContainEqual({ engine: { openai: { model: 'new-model' } } })
  })
})
