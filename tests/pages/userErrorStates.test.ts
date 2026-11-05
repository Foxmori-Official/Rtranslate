// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { ERROR_MESSAGES } from '../../src/shared/i18n-errors'
import type { ResolvedLang } from '../../src/shared/i18n'

const parserState = vi.hoisted(() => ({ failure: '' }))
vi.mock('../../src/files/parsers', () => ({
  SUPPORTED_EXTS: ['txt', 'json'],
  parserFor: () => ({
    exts: ['txt', 'json'],
    parse: async () => {
      if (parserState.failure) throw new Error(parserState.failure)
      return { kind: 'txt', baseName: 'fixture', state: {}, segments: [{ id: 0, text: 'Fixture source' }] }
    },
  }),
}))
type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void
const unsafe = 'FAKE-CREDENTIAL-DO-NOT-DISPLAY'
let listener: StorageListener | undefined
async function boot(page: 'files' | 'onboarding', lang: ResolvedLang) {
  vi.resetModules(); parserState.failure = ''; listener = undefined
  const config = structuredClone(DEFAULT_CONFIG); config.uiLang = lang
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => path, sendMessage: async (msg: { kind: string }) => {
      if (msg.kind === 'getConfig') return { ok: true, data: config }
      return { ok: false, error: unsafe, errorCode: 'QUOTA_EXCEEDED', errorType: 'rate_limit', errorParams: { status: 429, key: unsafe } }
    } },
    storage: { onChanged: { addListener: (callback: StorageListener) => { listener = callback } } },
  })
  if (page === 'files') await import('../../src/files/main')
  else await import('../../src/onboarding/main')
  await vi.waitFor(() => expect(document.documentElement.lang).toBe(lang))
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

async function runFile() {
  const file = new File(['fixture'], 'fixture.txt')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) })
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  const translate = [...document.querySelectorAll<HTMLButtonElement>('.actions button')].find((button) => !button.disabled)!
  translate.click()
  await vi.waitFor(() => expect(document.querySelector('.status.error')).not.toBeNull())
}

describe('file and onboarding failure states', () => {
  it('shows the actual batch failure code instead of hiding it behind all-failed text, and re-localizes it', async () => {
    await boot('files', 'en'); await runFile()
    const status = () => document.querySelector('.status')!.textContent!
    expect(status()).toContain(ERROR_MESSAGES.en.QUOTA_EXCEEDED)
    expect(status()).toContain('[QUOTA_EXCEEDED; HTTP 429]')
    expect(status()).not.toContain(unsafe)
    listener!({ 'tv:config_v1': { newValue: { uiLang: 'ja' } } }, 'local')
    expect(status()).toContain(ERROR_MESSAGES.ja.QUOTA_EXCEEDED)
    expect(document.querySelector<HTMLButtonElement>('.actions .btn')!.disabled).toBe(false)
  })
  it('does not pass Chinese parser errors through to an English UI', async () => {
    await boot('files', 'en'); parserState.failure = `JSON 解析失败：${unsafe}`; await runFile()
    const status = document.querySelector('.status')!.textContent!
    expect(status).toContain(ERROR_MESSAGES.en.PARSER_ERROR)
    expect(status).toContain('[PARSER_ERROR]')
    expect(status).not.toContain(unsafe)
    expect(status).not.toContain('解析失败')
  })
  it('keeps demo failure metadata so language changes translate it again', async () => {
    await boot('onboarding', 'en')
    document.querySelector<HTMLButtonElement>('.ob-next')!.click()
    document.querySelector<HTMLButtonElement>('.ob-next')!.click()
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Fixture source' } as Selection)
    document.dispatchEvent(new Event('selectionchange'))
    await vi.waitFor(() => expect(document.querySelector('.ob-demo-result')!.textContent).toContain(ERROR_MESSAGES.en.QUOTA_EXCEEDED))
    expect(document.querySelector('.ob-demo-result')!.textContent).not.toContain(unsafe)
    listener!({ 'tv:config_v1': { newValue: { uiLang: 'de' } } }, 'local')
    expect(document.querySelector('.ob-demo-result')!.textContent).toContain(ERROR_MESSAGES.de.QUOTA_EXCEEDED)
  })
})
