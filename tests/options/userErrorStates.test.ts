// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../../src/shared/config'
import { ERROR_MESSAGES } from '../../src/shared/i18n-errors'

const unsafe = 'FAKE-TEST-CREDENTIAL-DO-NOT-EXPOSE'
let stored: Config
let permissionGranted = true
async function boot(custom = false) {
  permissionGranted = true
  vi.resetModules(); document.body.innerHTML = '<div id="app"></div>'
  stored = structuredClone(DEFAULT_CONFIG); stored.uiLang = 'de'; stored.engine.provider = 'foxmori'
  if (custom) {
    stored.engine.customEngines = [{ id: 'fixture', name: 'Fixture', endpoint: 'https://example.invalid/v1', apiKey: unsafe, model: 'fixture-only-model', headersJson: '{}' }]
    stored.engine.provider = 'custom:fixture'
  }
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => path, sendMessage: async (msg: { kind: string }) => {
      if (msg.kind === 'getConfig') return { ok: true, data: stored }
      return { ok: true, data: { ok: false, error: unsafe, errorCode: 'AUTH_FAILED', errorParams: { status: 401 }, elapsedMs: 12, engine: stored.engine.provider } }
    } },
    permissions: { contains: vi.fn(async () => permissionGranted), request: vi.fn(async () => false) },
    storage: { local: { get: (_key: unknown, callback: (data: unknown) => void) => callback({}) } },
  })
  await import('../../src/options/main')
  await vi.waitFor(() => expect(document.querySelector('[data-tab=engine]')).not.toBeNull())
  document.querySelector<HTMLButtonElement>('[data-tab=engine]')!.click()
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('options localized failure states', () => {
  it('renders structured test-engine failures, and makes the test retryable', async () => {
    await boot()
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Verbindung testen')!
    expect(button).toBeDefined(); button.click()
    await vi.waitFor(() => expect(document.querySelector('.content [role=status]')!.textContent).toContain(ERROR_MESSAGES.de.AUTH_FAILED))
    expect(document.querySelector('.content [role=status]')!.textContent).not.toContain(unsafe)
    expect(button.disabled).toBe(false)
  })
  it('shows permission failures before sending a model-list request and allows manual entry', async () => {
    await boot(true)
    permissionGranted = false
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Modellliste abrufen')!
    button.click()
    await vi.waitFor(() => expect(document.querySelector('.hint-inline')!.textContent).toContain(ERROR_MESSAGES.de.HOST_PERMISSION_REQUIRED))
    expect(fetch).not.toHaveBeenCalled(); expect(button.disabled).toBe(false)
    expect(document.querySelector<HTMLInputElement>('.custom-engine-form input[placeholder*="gpt"]')?.disabled).not.toBe(true)
  })
  it('turns model-list HTTP errors into localized stable codes without echoing response text', async () => {
    await boot(true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(unsafe, { status: 429 })))
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Modellliste abrufen')!
    button.click()
    await vi.waitFor(() => expect(document.querySelector('.hint-inline')!.textContent).toContain(ERROR_MESSAGES.de.RATE_LIMITED))
    expect(document.querySelector('.hint-inline')!.textContent).not.toContain(unsafe); expect(button.disabled).toBe(false)
  })
})
