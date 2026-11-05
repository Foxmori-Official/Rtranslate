import { describe, expect, it } from 'vitest'
import { ERROR_MESSAGES, ERROR_TYPES, userErrorText, type ErrorCode } from '../../src/shared/i18n-errors'
import { resolveUiLang, t, UI_LANGS } from '../../src/shared/i18n'
import '../../src/shared/i18n-dicts'

const codes = Object.keys(ERROR_TYPES).sort()
const locales = UI_LANGS.filter((locale) => locale.code !== 'auto')
describe('nine locales: user-error key and placeholder parity', () => {
  it('checks exactly nine supported locales', () => { expect(locales).toHaveLength(9) })
  it.each(locales)('$code contains every code without untranslated fallbacks or unbound placeholders', ({ code }) => {
    const lang = resolveUiLang(code)
    const dict = ERROR_MESSAGES[lang]
    expect(Object.keys(dict).sort()).toEqual(codes)
    for (const errorCode of codes as ErrorCode[]) {
      expect(dict[errorCode].length).toBeGreaterThan(10)
      expect([...dict[errorCode].matchAll(/\{(\w+)\}/g)].map((hit) => hit[1]).sort()).toEqual([...ERROR_MESSAGES.en[errorCode].matchAll(/\{(\w+)\}/g)].map((hit) => hit[1]).sort())
      const output = userErrorText({ errorCode, errorParams: { status: 401, injected: 'FAKE-SECRET' }, error: 'FAKE-SECRET' }, lang)
      expect(output).toBe(`${dict[errorCode]} [${errorCode}; HTTP 401]`)
      expect(output).not.toContain('FAKE-SECRET')
      expect(output).not.toMatch(/\{\w+\}/)
      if (!['zh-CN', 'zh-TW', 'ja'].includes(lang)) expect(dict[errorCode]).not.toMatch(/[\u4e00-\u9fff]/u)
    }
    const modelHelp = t('opt.s30', lang, '可查询模型列表或手动填写；模型以接口实际提供的 ID 为准，能否留空由服务决定。')
    expect(modelHelp).not.toContain('gpt-')
    expect(modelHelp).toMatch(/ID|identifiant/)
  })
  it('resolves auto and legacy language variants for errors', () => {
    expect(userErrorText({ errorCode: 'TIMEOUT' }, 'zh-HK')).toContain(ERROR_MESSAGES['zh-TW'].TIMEOUT)
    expect(userErrorText({ errorCode: 'TIMEOUT' }, 'pt-PT')).toContain(ERROR_MESSAGES['pt-BR'].TIMEOUT)
    expect(userErrorText({ errorCode: 'TIMEOUT' }, 'unknown')).toContain(ERROR_MESSAGES.en.TIMEOUT)
  })
})
