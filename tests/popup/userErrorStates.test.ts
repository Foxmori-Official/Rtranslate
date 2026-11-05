// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { ERROR_MESSAGES } from '../../src/shared/i18n-errors'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('reports a failed settings write in the active locale rather than silently swallowing it', async () => {
  vi.resetModules(); document.body.innerHTML = '<div id="app"></div>'
  const config = structuredClone(DEFAULT_CONFIG); config.uiLang = 'ja'
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => path, sendMessage: async (msg: { kind: string }) => {
      if (msg.kind === 'getConfig') return { ok: true, data: config }
      if (msg.kind === 'getStats') return { ok: true, data: { totalWords: 0, dueCount: 0 } }
      return { ok: false, error: 'FAKE-CREDENTIAL-DO-NOT-EXPOSE', errorCode: 'STORAGE_UNAVAILABLE', errorParams: {} }
    } },
    tabs: { query: async () => [{ id: 7 }], sendMessage: async () => null },
  })
  await import('../../src/popup/main')
  await vi.waitFor(() => expect(document.querySelector('[data-row=hover] [role=switch]')).not.toBeNull())
  await new Promise((resolve) => setTimeout(resolve, 0))
  document.querySelector<HTMLButtonElement>('[data-row=hover] [role=switch]')!.click()
  await vi.waitFor(() => expect(document.querySelector('.status-text')!.textContent).toContain(ERROR_MESSAGES.ja.STORAGE_UNAVAILABLE))
  expect(document.querySelector('.status-text')!.getAttribute('role')).toBe('alert')
  expect(document.querySelector('.status-text')!.textContent).not.toContain('FAKE-CREDENTIAL')
})
