// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())
it('review updates document language/title on load and storage changes without duplicating the brand', async () => {
  vi.resetModules()
  document.body.innerHTML = '<div id="app"></div>'
  let onStorage: ((changes: Record<string, unknown>, area: string) => void) | undefined
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: async (msg: { kind: string }) => ({ ok: true, data: msg.kind === 'getConfig' ? { uiLang: 'de' } : [] }) },
    storage: { onChanged: { addListener: (cb: typeof onStorage) => { onStorage = cb } } },
  })
  await import('../../src/review/main')
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('de'))
  expect(document.title).toBe('Rtranslate Karteikarten-Wiederholung')
  onStorage!({ 'tv:config_v1': { newValue: { uiLang: 'ja' } } }, 'local')
  expect(document.documentElement.lang).toBe('ja')
  expect(document.title).toBe('Rtranslate フラッシュカード復習')
})
