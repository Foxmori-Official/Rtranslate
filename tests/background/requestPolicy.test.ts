import { aiWrite } from '../../src/background/aiWrite'
import { extractTermsWithAI } from '../../src/background/glossaryLibs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/shared/config'
import { aiAssist, translate, translateTexts } from '../../src/background/translate'
import { setFetchImpl } from '../../src/background/engines/fetch'
import { clearAll, flushCache } from '../../src/background/cache'
import { resetBatchQueues } from '../../src/background/batch'

type Call = { url: string; init?: RequestInit; body: { model?: string; messages: Array<{ role: string; content: string }> } }
let permissionGranted: boolean
let calls: Call[]
let data: Record<string, unknown>
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const config = () => {
  const value = structuredClone(DEFAULT_CONFIG)
  value.engine.provider = 'openai'; value.engine.keys.openai = 'FAKE-LOCAL-KEY'
  value.batch.enabled = false; value.batch.intervalMs = 0
  return value
}
function record(url: string, init?: RequestInit) {
  const call = { url, init, body: JSON.parse(String(init?.body)) } as Call
  calls.push(call)
  return call
}
function translatedBatch(call: Call): Response {
  const items = call.body.messages.at(-1)!.content.split('\n').map(line => JSON.parse(line) as { id: number; text: string })
  return reply(JSON.stringify({ translations: items.map(({ id, text }) => ({ id, text: `译:${text}` })) }))
}
beforeEach(async () => {
  calls = []; data = {}; permissionGranted = true
  vi.stubGlobal('chrome', {
    permissions: { contains: vi.fn(async () => permissionGranted) },
    runtime: {},
    storage: { local: { get: (key: string, cb: (value: unknown) => void) => cb({ [key]: data[key] }), set: (patch: Record<string, unknown>, cb: () => void) => { Object.assign(data, patch); cb() } } },
  })
  await clearAll()
  setFetchImpl(async (url, init) => { record(url, init); return reply(`译文-${calls.length}`) })
})
afterEach(async () => { await clearAll(); resetBatchQueues(); setFetchImpl(null); vi.unstubAllGlobals() })

describe('request policy, credentials and shared limits', () => {
  it('invalidates cached translations when model, endpoint, expert or credential changes', async () => {
    const value = config()
    const run = () => translate('Same source sentence.', { targetLang: 'zh-CN' }, value)
    expect((await run()).text).toBe('译文-1')
    expect((await run()).text).toBe('译文-1')
    value.engine.openai.model = 'second-model'; expect((await run()).text).toBe('译文-2')
    value.engine.openai.endpoint = 'https://changed.example/v1'; expect((await run()).text).toBe('译文-3')
    value.experts.list[0].systemPrompt += '\nUse formal language.'; expect((await run()).text).toBe('译文-4')
    value.engine.keys.openai = 'FAKE-SECOND-KEY'; expect((await run()).text).toBe('译文-5')
    expect(calls).toHaveLength(5)
    await flushCache()
    expect(JSON.stringify(data)).not.toContain('FAKE-')
  })
  it('bypassCache makes connectivity tests reach the network every time', async () => {
    const value = config()
    await translate('Hello', { targetLang: 'zh-CN' }, value)
    await translate('Hello', { targetLang: 'zh-CN', bypassCache: true }, value)
    await translate('Hello', { targetLang: 'zh-CN', bypassCache: true }, value)
    expect(calls).toHaveLength(3)
  })
  it('a connectivity check does not report success from a different free provider', async () => {
    const value = structuredClone(DEFAULT_CONFIG)
    const urls: string[] = []
    setFetchImpl(async url => { urls.push(url); return new Response('unavailable', { status: 500 }) })
    await expect(translate('Hello', { targetLang: 'zh-CN', bypassCache: true, exactProvider: true }, value)).rejects.toThrow('google: HTTP 500')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('translate.googleapis.com')
  })
  it('does not reuse an old in-flight batch configuration after editing endpoint/key/model', async () => {
    const old = config(); old.batch.enabled = true; old.batch.maxTexts = 1
    const newer = structuredClone(old); newer.engine.openai.endpoint = 'https://new.example/v1'; newer.engine.openai.model = 'new-model'; newer.engine.keys.openai = 'FAKE-NEW-KEY'
    let release!: () => void
    const oldRequest = new Promise<void>(resolve => { release = resolve })
    setFetchImpl(async (url, init) => { const call = record(url, init); if (!url.includes('new.example')) await oldRequest; return translatedBatch(call) })
    const first = translate('Old text', { targetLang: 'zh-CN' }, old)
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const second = translate('New text', { targetLang: 'zh-CN' }, newer)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].url).toBe('https://new.example/v1/chat/completions')
    expect(calls[1].body.model).toBe('new-model')
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer FAKE-NEW-KEY')
    release(); await Promise.all([first, second])
  })
  it('applies permission preflight to documents and does not fetch without permission', async () => {
    permissionGranted = false
    const value = config(); value.batch.enabled = true
    await expect(translateTexts(['A sentence'], { targetLang: 'zh-CN' }, value)).rejects.toThrow(/权限|permission/i)
    expect(calls).toHaveLength(0)
  })
  it('bounds batch count, size and total concurrency across simultaneous documents', async () => {
    const value = config(); value.batch.enabled = true; value.batch.maxTexts = 2; value.batch.maxChars = 6; value.batch.concurrency = 2
    let inFlight = 0, peak = 0
    setFetchImpl(async (url, init) => {
      const call = record(url, init); inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 10)); inFlight--
      return translatedBatch(call)
    })
    const [first, second] = await Promise.all([
      translateTexts(['aa', 'bb', 'cc', 'dd', 'ee'], { targetLang: 'zh-CN' }, value),
      translateTexts(['ff', 'gg', 'hh'], { targetLang: 'zh-CN' }, value),
    ])
    expect(first).toEqual(['译:aa', '译:bb', '译:cc', '译:dd', '译:ee'])
    expect(second).toEqual(['译:ff', '译:gg', '译:hh'])
    expect(peak).toBeLessThanOrEqual(2)
    for (const call of calls) {
      const items = call.body.messages.at(-1)!.content.split('\n').map(line => JSON.parse(line))
      expect(items.length).toBeLessThanOrEqual(2)
      expect(items.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(6)
      expect(call.init?.signal).toBeDefined()
    }
  })
  it('timeouts settle even if a provider ignores abort; no retry amplification', async () => {
    const value = config(); value.batch.enabled = true; value.engine.timeoutMs = 20
    setFetchImpl((url, init) => { record(url, init); return new Promise(() => {}) })
    await expect(translateTexts(['Hanging request'], { targetLang: 'zh-CN' }, value)).rejects.toThrow('timed out')
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.signal?.aborted).toBe(true)
  })
  it.each([401, 403, 429])('does not fan out HTTP %s into single retries', async status => {
    const value = config(); value.batch.enabled = true
    setFetchImpl(async (url, init) => { record(url, init); return new Response('failed', { status }) })
    await expect(translateTexts(['one', 'two', 'three'], { targetLang: 'zh-CN' }, value)).rejects.toThrow(`HTTP ${status}`)
    expect(calls).toHaveLength(1)
  })
  it('discards unsent batches when a provider rejects quota or credentials', async () => {
    const value = config(); value.batch.enabled = true; value.batch.maxTexts = 1; value.batch.concurrency = 2
    setFetchImpl(async (url, init) => { record(url, init); return new Response('rate limited', { status: 429 }) })
    await expect(translateTexts(Array.from({ length: 100 }, (_, i) => `sentence-${i}`), { targetLang: 'zh-CN' }, value)).rejects.toThrow('429')
    expect(calls.length).toBeLessThanOrEqual(2)
  })
  it('does not retry a typed quota rejection returned with HTTP 200', async () => {
    const value = config(); value.batch.enabled = true; value.batch.maxTexts = 1; value.batch.concurrency = 1
    setFetchImpl(async (url, init) => { record(url, init); return new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'unused provider detail' } }), { status: 200 }) })
    await expect(translateTexts(['one', 'two', 'three'], { targetLang: 'zh-CN' }, value)).rejects.toMatchObject({ errorCode: 'QUOTA_EXCEEDED' })
    expect(calls).toHaveLength(1)
  })
  const auxiliaryActions = [
    { name: 'AI reading', invoke: (value: ReturnType<typeof config>) => aiAssist('meaning', 'A source', 'en', value) },
    { name: 'AI writing', invoke: (value: ReturnType<typeof config>) => aiWrite('polish', 'A source', {}, value) },
    { name: 'AI terms', invoke: (value: ReturnType<typeof config>) => extractTermsWithAI('A source', 'en', value) },
  ]
  it.each(auxiliaryActions)('$name uses the Foxmori endpoint and enforces permissions and timeout', async ({ invoke }) => {
    const value = config(); value.engine.provider = 'foxmori'; value.engine.keys.foxmori = 'FAKE-FOXMORI-KEY'; value.engine.foxmori.model = 'configured-model'
    setFetchImpl(async (url, init) => { record(url, init); return reply('[]') })
    await invoke(value)
    expect(calls[0].url).toBe('https://api.foxmori.com/v1/chat/completions')
    expect(calls[0].init?.signal).toBeDefined()
    permissionGranted = false
    await expect(invoke(value)).rejects.toThrow(/权限|permission/i)
    expect(calls).toHaveLength(1)
    permissionGranted = true
    value.engine.timeoutMs = 20
    setFetchImpl(() => new Promise(() => {}))
    await expect(invoke(value)).rejects.toThrow('timed out')
  })
  it('sends only a separately configured Foxmori key and model to the new endpoint', async () => {
    const legacy = structuredClone(DEFAULT_CONFIG)
    legacy.engine.provider = 'aimao'; legacy.engine.keys.aimao = 'FAKE-OLD-KEY'
    const migrated = normalizeConfig(legacy)
    await expect(translate('A source', { targetLang: 'zh-CN' }, migrated)).rejects.toThrow(/key/i)
    expect(calls).toHaveLength(0)
    migrated.engine.keys.foxmori = 'FAKE-FOXMORI-KEY'
    await expect(translate('A source', { targetLang: 'zh-CN' }, migrated)).rejects.toThrow(/model/i)
    migrated.engine.foxmori.model = 'configured-model'; migrated.batch.enabled = false
    await translate('A source', { targetLang: 'zh-CN' }, migrated)
    expect(calls[0].url).toBe('https://api.foxmori.com/v1/chat/completions')
    expect(JSON.stringify(calls[0])).not.toContain('FAKE-OLD-KEY')
  })
})
