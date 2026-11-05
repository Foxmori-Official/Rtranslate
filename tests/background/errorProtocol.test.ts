import { beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ error: undefined as unknown, listener: undefined as undefined | ((msg: unknown, sender: unknown, reply: (value: unknown) => void) => void) }))
vi.mock('../../src/background/translate', () => ({
  translate: vi.fn(async () => { throw state.error }), translateTexts: vi.fn(), detectLang: vi.fn(), aiAssist: vi.fn(), aiChat: vi.fn(),
}))
vi.stubGlobal('chrome', {
  runtime: { onMessage: { addListener: (fn: typeof state.listener) => { state.listener = fn } }, onInstalled: { addListener: vi.fn() } },
  storage: { local: { get: (_key: string, cb: (data: unknown) => void) => cb({}), set: (_data: unknown, cb: () => void) => cb() }, onChanged: { addListener: vi.fn() } },
  tabs: { onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } }, contextMenus: { onClicked: { addListener: vi.fn() } },
})
beforeAll(async () => { await import('../../src/background/index') })
async function send(kind: string) {
  return new Promise<Record<string, unknown>>((resolve) => state.listener!({ kind, text: 'fixture', targetLang: 'en' }, {}, (value) => resolve(value as Record<string, unknown>)))
}
describe('background additive error protocol', () => {
  it('serializes errors at the runtime listener boundary, not raw error.message', async () => {
    state.error = new Error('HTTP 401 provider echoed FAKE-SECRET')
    const result = await send('translate')
    expect(result).toMatchObject({ ok: false, errorCode: 'AUTH_FAILED', errorType: 'authentication', errorParams: { status: 401 } })
    expect(JSON.stringify(result)).not.toContain('FAKE-SECRET')
  })
  it('also attaches error metadata inside a successful testEngine transport response', async () => {
    state.error = new Error('HTTP 429 provider echoed FAKE-SECRET')
    const result = await send('testEngine')
    expect(result).toMatchObject({ ok: true, data: { ok: false, errorCode: 'RATE_LIMITED', errorType: 'rate_limit', errorParams: { status: 429 } } })
    expect(JSON.stringify(result)).not.toContain('FAKE-SECRET')
  })
})
