/** Additive wire fields: existing consumers can still read the safe English `error`. */
export const ERROR_TYPES = {
  HOST_PERMISSION_REQUIRED: 'permission', KEY_MISSING: 'configuration', MODEL_MISSING: 'configuration',
  ENDPOINT_INVALID: 'configuration', ENGINE_NOT_CONFIGURED: 'configuration', AI_PROVIDER_UNSUPPORTED: 'configuration',
  TIMEOUT: 'timeout', AUTH_FAILED: 'authentication', ACCESS_DENIED: 'permission', RATE_LIMITED: 'rate_limit',
  QUOTA_EXCEEDED: 'rate_limit', PROVIDER_UNAVAILABLE: 'provider', NETWORK_ERROR: 'network',
  INVALID_RESPONSE: 'response', MODEL_UNAVAILABLE: 'configuration', MODEL_LIST_UNAVAILABLE: 'response',
  PARSER_ERROR: 'parser', FILE_UNSUPPORTED: 'parser', FILE_TOO_LARGE: 'parser', FILE_ENCRYPTED: 'parser',
  FILE_NO_TEXT: 'parser', BACKGROUND_UNAVAILABLE: 'network', STORAGE_UNAVAILABLE: 'storage', UNKNOWN_ERROR: 'unknown',
} as const
export type ErrorCode = keyof typeof ERROR_TYPES
export type ErrorType = typeof ERROR_TYPES[ErrorCode]
export interface ErrorParams { status?: number; timeoutMs?: number }
export interface ErrorMetadata {
  errorCode: ErrorCode
  errorType: ErrorType
  errorParams: ErrorParams
}
export type ErrorFailure = ErrorMetadata & { ok: false; error: string }

export class UserFacingError extends Error {
  readonly errorCode: ErrorCode
  readonly errorType: ErrorType
  readonly errorParams: ErrorParams
  get statusCode(): number | undefined { return this.errorParams.status }
  /** No cause, request, URL, headers, response body or provider message is retained. */
  constructor(code: ErrorCode, params: ErrorParams = {}) {
    const safe = safeParams(params)
    super(ERROR_EN[code] + (safe.status ? ` (HTTP ${safe.status})` : ''))
    this.name = 'UserFacingError'
    this.errorCode = code
    this.errorType = ERROR_TYPES[code]
    this.errorParams = safe
  }
}

function safeParams(value: unknown): ErrorParams {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const out: ErrorParams = {}
  if (Number.isInteger(raw.status) && Number(raw.status) >= 100 && Number(raw.status) <= 599) out.status = Number(raw.status)
  if (Number.isFinite(raw.timeoutMs) && Number(raw.timeoutMs) > 0 && Number(raw.timeoutMs) <= 3_600_000) out.timeoutMs = Number(raw.timeoutMs)
  return out
}
function isCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_TYPES, value)
}

/** Provider codes are inspected only to classify; never copied into the response or logs. */
export function httpUserError(status: number, providerCode?: unknown): UserFacingError {
  const code = typeof providerCode === 'string' ? providerCode.toLowerCase() : ''
  const params = { status }
  if (/^(insufficient_quota|quota_exceeded|billing_hard_limit_reached|credit_balance_too_low)$/.test(code)) return new UserFacingError('QUOTA_EXCEEDED', params)
  if (status === 401 || /^(invalid_api_key|authentication_error)$/.test(code)) return new UserFacingError('AUTH_FAILED', params)
  if (status === 403 || code === 'permission_denied') return new UserFacingError('ACCESS_DENIED', params)
  if (status === 429 || /^(rate_limit_exceeded|rate_limit_error)$/.test(code)) return new UserFacingError('RATE_LIMITED', params)
  if (status === 408 || status === 504) return new UserFacingError('TIMEOUT', params)
  if (status >= 500) return new UserFacingError('PROVIDER_UNAVAILABLE', params)
  if (/^(model_not_found|model_not_available|invalid_model)$/.test(code)) return new UserFacingError('MODEL_UNAVAILABLE', params)
  return new UserFacingError('INVALID_RESPONSE', params)
}

/** Legacy adapters still throw plain Errors. Keep matching here, not in individual UIs. */
export function asUserError(error: unknown, fallback: ErrorCode = 'UNKNOWN_ERROR'): UserFacingError {
  if (error instanceof UserFacingError) return error
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  if (isCode(value.errorCode)) return new UserFacingError(value.errorCode, safeParams(value.errorParams))
  const message = typeof error === 'string' ? error : typeof value.message === 'string' ? value.message : typeof value.error === 'string' ? value.error : ''
  const status = typeof value.statusCode === 'number' ? value.statusCode : typeof value.status === 'number' ? value.status : Number((message.match(/\bHTTP\s+(\d{3})\b/i) ?? message.match(/^(401|403|429|5\d{2})\b/))?.[1])
  if (status >= 400 && status <= 599) {
    const quota = /insufficient_quota|quota.exceeded|billing.hard.limit|credit.balance|余额不足|配额.*(?:耗尽|不足)/i.test(message)
    return httpUserError(status, quota ? 'insufficient_quota' : undefined)
  }
  if (/all free engines failed|service unavailable|provider unavailable|temporarily unavailable/i.test(message)) return new UserFacingError('PROVIDER_UNAVAILABLE')
  if (/permission|缺少.*权限|访问权限|未.*授权/i.test(message)) return new UserFacingError('HOST_PERMISSION_REQUIRED')
  if (/missing.*(?:api.?key|key)|(?:enter|fill|provide).*api.?key|api.?key.*(?:missing|required)|缺少.*(?:密钥|key)/i.test(message)) return new UserFacingError('KEY_MISSING')
  if (/(?:configure|enter|missing|required).*model|model.*(?:missing|required)|模型.*(?:必填|缺少)/i.test(message)) return new UserFacingError('MODEL_MISSING')
  if (/missing endpoint|endpoint.*(?:invalid|required)|接口地址无效|Invalid URL/i.test(message)) return new UserFacingError('ENDPOINT_INVALID')
  if (/unknown engine|请先在设置页配置 AI 引擎/i.test(message)) return new UserFacingError('ENGINE_NOT_CONFIGURED')
  if (value.name === 'TimeoutError' || value.name === 'AbortError' || /timed?\s*out|timeout|超时/i.test(message)) return new UserFacingError('TIMEOUT')
  if (/insufficient_quota|quota.exceeded|billing.hard.limit|credit.balance|余额不足|配额.*(?:耗尽|不足)/i.test(message)) return new UserFacingError('QUOTA_EXCEEDED')
  if (/rate.limit|too many requests/i.test(message)) return new UserFacingError('RATE_LIMITED')
  if (/invalid_api_key|authentication_error/i.test(message)) return new UserFacingError('AUTH_FAILED')
  if (/model_not_found|model_not_available/i.test(message)) return new UserFacingError('MODEL_UNAVAILABLE')
  if (/unexpected response|empty response|no content|missing.*translations|batch.*(?:JSON|array)|response.*(?:JSON|shape)/i.test(message)) return new UserFacingError('INVALID_RESPONSE')
  if (/failed to fetch|networkerror|network error|fetch failed|load failed|offline/i.test(message)) return new UserFacingError('NETWORK_ERROR')
  if (/receiving end does not exist|message (?:port|channel).*closed|background.*(?:未响应|unavailable)|extension context invalidated/i.test(message)) return new UserFacingError('BACKGROUND_UNAVAILABLE')
  if (/QUOTA_BYTES|storage.*quota|storage.*(?:failed|unavailable)|存储.*(?:不足|失败)/i.test(message)) return new UserFacingError('STORAGE_UNAVAILABLE')
  return new UserFacingError(fallback)
}

/** File parsers are intentionally unchanged; map their legacy errors at the display boundary. */
export function parserUserError(error: unknown): UserFacingError {
  if (error instanceof UserFacingError) return error
  const value = error as { message?: unknown; name?: unknown } | null
  const message = typeof value?.message === 'string' ? value.message : typeof error === 'string' ? error : ''
  if (/DRM|加密|password|encrypted/i.test(message) || value?.name === 'PasswordException') return new UserFacingError('FILE_ENCRYPTED')
  if (/超过|过多|too (?:large|many)|size limit|zip.bomb/i.test(message)) return new UserFacingError('FILE_TOO_LARGE')
  if (/没有可翻译|无可翻译|no (?:translatable )?text|no text/i.test(message)) return new UserFacingError('FILE_NO_TEXT')
  if (/不支持|unsupported/i.test(message)) return new UserFacingError('FILE_UNSUPPORTED')
  return asUserError(error, 'PARSER_ERROR')
}

export function errorFailure(error: unknown): ErrorFailure {
  const safe = asUserError(error)
  return { ok: false, error: ERROR_EN[safe.errorCode], errorCode: safe.errorCode, errorType: safe.errorType, errorParams: { ...safe.errorParams } }
}

/** Safe English fallback for older clients; no locale tables in the background bundle. */
export const ERROR_EN: Record<ErrorCode, string> = {
    HOST_PERMISSION_REQUIRED: 'Endpoint permission has not been granted. Save the engine again in Settings and allow access.',
    KEY_MISSING: 'API key missing. Enter a new key in Settings → Engines.',
    MODEL_MISSING: 'Model ID missing. Query the service model list or enter a supported model manually.',
    ENDPOINT_INVALID: 'Invalid endpoint. Enter a valid HTTP(S) URL.',
    ENGINE_NOT_CONFIGURED: 'The engine is not configured or was removed. Select and configure an engine in Settings.',
    AI_PROVIDER_UNSUPPORTED: 'This feature requires an OpenAI-compatible AI engine. Switch engines in Settings.',
    TIMEOUT: 'The request timed out. Retry later or increase the timeout in Settings.',
    AUTH_FAILED: 'API key authentication failed. Check that the key is valid and has not expired.',
    ACCESS_DENIED: 'The service denied access. Check account, region and model permissions.',
    RATE_LIMITED: 'Too many requests. Retry later or reduce concurrency.',
    QUOTA_EXCEEDED: 'Service quota or credit exhausted. Check your provider account quota and billing.',
    PROVIDER_UNAVAILABLE: 'The translation service is temporarily unavailable. Retry later or switch engines.',
    NETWORK_ERROR: 'Cannot connect to the service. Check your network and endpoint, then retry.',
    INVALID_RESPONSE: 'The service returned an unrecognized response. Retry or check API compatibility.',
    MODEL_UNAVAILABLE: 'The model is unavailable. Query the service model list and select a model you can access.',
    MODEL_LIST_UNAVAILABLE: 'The endpoint returned no usable models. Enter a supported model ID manually.',
    PARSER_ERROR: 'Cannot parse the file. Check its format and integrity, or convert it and retry.',
    FILE_UNSUPPORTED: 'This file format is not supported. Choose a supported format.',
    FILE_TOO_LARGE: 'File size or content count exceeds safety limits. Split the file and retry.',
    FILE_ENCRYPTED: 'Encrypted or DRM-protected files cannot be read. Use an unencrypted copy you are authorized to access.',
    FILE_NO_TEXT: 'The file has no translatable text. Scanned files may need OCR first.',
    BACKGROUND_UNAVAILABLE: 'The extension background is unavailable. Reopen the page or reload the extension if needed.',
    STORAGE_UNAVAILABLE: 'Local data could not be saved. Check browser storage space and retry.',
    UNKNOWN_ERROR: 'The operation failed. Retry; if it persists, include the error code in your report.',
  }
