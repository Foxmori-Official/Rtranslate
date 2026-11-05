import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { asUserError, errorFailure, httpUserError, parserUserError, UserFacingError } from '../../src/shared/i18n-errors'
import { assertEndpointPermission, withTimeout } from '../../src/background/request'
import { resolveAiEndpoint } from '../../src/background/aiEndpoint'
import { createOpenAICompatEngine, parseBatchResponse } from '../../src/background/engines/openaiCompat'
import { setFetchImpl } from '../../src/background/engines/fetch'
import { err } from '../../src/shared/protocol'
import { translate } from '../../src/background/translate'
import { resetBatchQueues } from '../../src/background/batch'
import { clearAll } from '../../src/background/cache'

const secret = 'FAKE-TEST-CREDENTIAL-DO-NOT-EXPOSE'
const cfg = () => structuredClone(DEFAULT_CONFIG)
afterEach(() => { vi.unstubAllGlobals(); setFetchImpl(null); vi.useRealTimers() })

describe('stable user-facing error metadata', () => {
  it.each([
    [401, 'AUTH_FAILED'], [403, 'ACCESS_DENIED'], [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'], [502, 'PROVIDER_UNAVAILABLE'], [503, 'PROVIDER_UNAVAILABLE'], [504, 'TIMEOUT'],
  ] as const)('classifies HTTP %s and preserves status for terminal batch failures', (status, errorCode) => {
    const e = httpUserError(status)
    expect(e).toMatchObject({ errorCode, statusCode: status })
    expect(errorFailure(e)).toMatchObject({ ok: false, errorCode, errorParams: { status } })
  })
  it.each(['insufficient_quota', 'quota_exceeded', 'billing_hard_limit_reached', 'credit_balance_too_low'])('recognizes quota code %s', (code) => {
    expect(httpUserError(429, code)).toMatchObject({ errorCode: 'QUOTA_EXCEEDED', statusCode: 429, errorParams: { status: 429 } })
  })
  it.each([
    ['Foxmori: enter a new API key on the options page', 'KEY_MISSING'],
    ['Foxmori: configure a supported model ID in Settings', 'MODEL_MISSING'],
    ['resolveEngine: unknown engine "removed"', 'ENGINE_NOT_CONFIGURED'],
    ['Failed to fetch', 'NETWORK_ERROR'], ['google: HTTP 503 Service Unavailable', 'PROVIDER_UNAVAILABLE'],
    ['translate: all free engines failed (google | bing)', 'PROVIDER_UNAVAILABLE'],
    ['aiChat: quota exceeded', 'QUOTA_EXCEEDED'],
    ['The message port closed before a response was received.', 'BACKGROUND_UNAVAILABLE'],
    ['storage unavailable', 'STORAGE_UNAVAILABLE'], ['an unknown failure', 'UNKNOWN_ERROR'],
  ] as const)('normalizes legacy error %s', (message, code) => {
    expect(asUserError(new Error(message)).errorCode).toBe(code)
  })
  it('never serializes credentials, provider messages, paths, URLs or unrecognized params', () => {
    const payload = { errorCode: 'AUTH_FAILED', errorType: secret, error: secret, errorParams: { status: 401, timeoutMs: 1200, apiKey: secret, endpoint: `https://user:${secret}@example.com` } }
    const response = err(payload)
    expect(response).toMatchObject({ ok: false, errorCode: 'AUTH_FAILED', errorType: 'authentication', errorParams: { status: 401, timeoutMs: 1200 } })
    expect(JSON.stringify(response)).not.toContain(secret)
    expect(JSON.stringify(errorFailure(new Error(`provider echo ${secret}`)))).not.toContain(secret)
    expect(errorFailure({ errorCode: '__proto__', errorParams: { status: secret } }).errorCode).toBe('UNKNOWN_ERROR')
  })
  it('returns a coded permission error without revealing the endpoint URL or key', async () => {
    vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => false) } })
    const config = cfg(); config.engine.provider = 'openai'; config.engine.openai.endpoint = `https://example.com/v1?key=${secret}`
    await expect(assertEndpointPermission(config)).rejects.toMatchObject({ errorCode: 'HOST_PERMISSION_REQUIRED' })
    config.engine.openai.endpoint = `https://user:${secret}@example.com/v1`
    await expect(assertEndpointPermission(config)).rejects.toMatchObject({ errorCode: 'ENDPOINT_INVALID' })
  })
  it('bounds a hung request and returns stable timeout metadata', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const response = withTimeout(async (s) => { signal = s; return new Promise<never>(() => {}) }, 50)
    const check = expect(response).rejects.toMatchObject({ errorCode: 'TIMEOUT', errorParams: { timeoutMs: 50 } })
    await vi.advanceTimersByTimeAsync(50); await check
    expect(signal?.aborted).toBe(true)
  })
  it('distinguishes missing key, missing model and unsupported AI protocol without requests', () => {
    const config = cfg(); config.engine.provider = 'foxmori'
    expect(() => resolveAiEndpoint(config)).toThrow(expect.objectContaining({ errorCode: 'KEY_MISSING' }))
    config.engine.keys.foxmori = secret
    expect(() => resolveAiEndpoint(config)).toThrow(expect.objectContaining({ errorCode: 'MODEL_MISSING' }))
    config.engine.provider = 'gemini'
    expect(() => resolveAiEndpoint(config)).toThrow(expect.objectContaining({ errorCode: 'AI_PROVIDER_UNSUPPORTED' }))
  })
  it.each([
    ['不是合法的 DOCX：缺少 word/document.xml', 'PARSER_ERROR'], ['JSON 解析失败：secret text', 'PARSER_ERROR'],
    ['ePub 解压总大小超过 200MB，拒绝处理', 'FILE_TOO_LARGE'], ['DOCX 条目过多，拒绝处理', 'FILE_TOO_LARGE'],
    ['该 ePub 含 DRM 加密，无法翻译', 'FILE_ENCRYPTED'], ['DOCX 中没有可翻译的文本', 'FILE_NO_TEXT'],
    ['不支持的格式', 'FILE_UNSUPPORTED'],
  ] as const)('localizes legacy parser errors at the display boundary: %s', (message, code) => {
    expect(parserUserError(new Error(message)).errorCode).toBe(code)
  })
})

const engine = createOpenAICompatEngine({ id: 'fixture', name: 'Fixture', getEndpoint: () => 'https://example.invalid/v1', getApiKey: () => secret, getModel: () => 'test-only-model-id' })
describe('OpenAI-compatible safe failures (fake fetch only)', () => {
  it.each([401, 403, 429, 500, 503])('does not expose the provider body for HTTP %s', async (status) => {
    setFetchImpl(async () => new Response(JSON.stringify({ error: { message: `echo ${secret}`, code: status === 429 ? 'insufficient_quota' : '' } }), { status }))
    const failure = await engine.translate('source', 'en', 'zh-CN', { config: cfg() }).catch((e: unknown) => errorFailure(e))
    expect(JSON.stringify(failure)).not.toContain(secret)
    expect(failure).toMatchObject({ ok: false, errorParams: { status } })
  })
  it.each([null, {}, { error: { message: secret } }, { choices: [{ message: { content: '' } }] }])('rejects malformed success responses without echoing them', async (payload) => {
    setFetchImpl(async () => new Response(JSON.stringify(payload), { status: 200 }))
    await expect(engine.translate('source', 'en', 'zh-CN', { config: cfg() })).rejects.toMatchObject({ errorCode: 'INVALID_RESPONSE' })
  })
  it('detects provider model-not-found codes on an HTTP 200 error envelope', async () => {
    setFetchImpl(async () => new Response(JSON.stringify({ error: { code: 'model_not_found', message: secret } })))
    await expect(engine.translate('source', 'en', 'zh-CN', { config: cfg() })).rejects.toMatchObject({ errorCode: 'MODEL_UNAVAILABLE' })
  })
  it('rejects invalid batch JSON and null with a stable code', () => {
    for (const text of ['null', 'invalid json', '{"data":[]}']) {
      expect(() => parseBatchResponse(text, ['source'])).toThrow(UserFacingError)
    }
  })
})


/** Full translation route: the timeout must include both fetch headers and error-body parsing. */
describe('error-body timeout boundary and quota status compatibility', () => {
  beforeEach(async () => {
    vi.stubGlobal('chrome', {
      permissions: { contains: async () => true }, runtime: {},
      storage: { local: {
        get: (key: string, callback: (value: unknown) => void) => callback({ [key]: undefined }),
        set: (_value: unknown, callback: () => void) => callback(),
      } },
    })
    await clearAll()
  })
  afterEach(async () => { await clearAll(); resetBatchQueues() })
  const config = (batch: boolean) => {
    const value = cfg()
    value.engine.provider = 'openai'; value.engine.keys.openai = secret
    value.engine.timeoutMs = 25
    value.batch.enabled = batch; value.batch.intervalMs = 0; value.batch.concurrency = 1
    return value
  }
  const routes = [false, true].flatMap(batch => [200, 401, 403, 429, 503].map(status => ({ batch, status })))
  it.each(routes)('bounds a hanging HTTP $status body (batch=$batch), even if fake fetch ignores abort', async ({ batch, status }) => {
    let signal: AbortSignal | undefined
    let finishBody!: (value: unknown) => void
    let bodyStarted = false
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      const response = new Response(null, { status })
      response.json = async () => {
        bodyStarted = true
        return new Promise<unknown>((resolve) => { finishBody = resolve })
      }
      return response
    })
    setFetchImpl(fetch)
    await expect(translate('Fixture body timeout source', { targetLang: 'zh-CN', bypassCache: true }, config(batch))).rejects.toMatchObject({
      name: 'TimeoutError', errorCode: 'TIMEOUT', errorParams: { timeoutMs: 25 },
    })
    expect(bodyStarted).toBe(true)
    expect(signal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    // A provider replying after the timeout must not cause a single-request fallback or another fetch.
    finishBody({ error: { code: 'insufficient_quota', message: secret } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([200, 201, 202, 403, 429])('preserves actual HTTP %s on a typed quota error and discards its raw body', async (status) => {
    setFetchImpl(async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: secret } }), { status }))
    const failure = await translate('Fixture quota source', { targetLang: 'zh-CN', bypassCache: true }, config(false)).catch((error: unknown) => error)
    expect(failure).toMatchObject({ errorCode: 'QUOTA_EXCEEDED', statusCode: status, errorParams: { status } })
    expect(errorFailure(failure)).toMatchObject({ errorCode: 'QUOTA_EXCEEDED', errorParams: { status } })
    expect(JSON.stringify(errorFailure(failure))).not.toContain(secret)
  })
})
