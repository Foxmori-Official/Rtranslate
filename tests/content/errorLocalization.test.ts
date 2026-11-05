// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { contentErrorText, contentRequest, setContentUiLang } from '../../src/content/uiLang'
import { translateElement } from '../../src/content/page'
import { httpUserError } from '../../src/shared/errors'

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })
describe('in-page errors retain safe metadata and current UI language', () => {
  it('renders typed quota errors on a translated paragraph in German without raw details', async () => {
    const config = structuredClone(DEFAULT_CONFIG); config.uiLang = 'de'; setContentUiLang(config)
    vi.stubGlobal('chrome', { runtime: { sendMessage: async () => ({ ok: false, error: 'RAW-PROVIDER-SECRET', errorCode: 'QUOTA_EXCEEDED', errorType: 'rate_limit', errorParams: { status: 429 } }) } })
    document.body.innerHTML = '<p>An English paragraph for local translation.</p>'
    expect(await translateElement(document.querySelector('p')!, config)).toBe(false)
    const error = document.querySelector('[data-tv-error]')!.textContent!
    expect(error).toContain('Kontingent'); expect(error).toContain('QUOTA_EXCEEDED')
    expect(error).not.toContain('RAW-PROVIDER-SECRET'); expect(error).not.toMatch(/额度|配额/)
  })
  it('resolves error text against a newly selected UI locale', () => {
    const error = httpUserError(401)
    const config = structuredClone(DEFAULT_CONFIG)
    config.uiLang = 'de'; setContentUiLang(config); expect(contentErrorText(error)).toContain('Authentifizierung')
    config.uiLang = 'ja'; setContentUiLang(config); expect(contentErrorText(error)).toContain('認証')
  })
  it('turns rejected or missing runtime responses into localizable background errors', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: async () => undefined } })
    await expect(contentRequest({ kind: 'translate' })).rejects.toMatchObject({ errorCode: 'BACKGROUND_UNAVAILABLE' })
    vi.stubGlobal('chrome', { runtime: { sendMessage: async () => { throw new Error('RAW-CONNECTION-DETAIL') } } })
    await expect(contentRequest({ kind: 'translate' })).rejects.toMatchObject({ errorCode: 'BACKGROUND_UNAVAILABLE' })
  })
})
