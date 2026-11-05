import { UserFacingError } from '../shared/errors'
import type { Config } from '../shared/config'
import { FOXMORI_ENDPOINT } from '../shared/brand'

export function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(Object.assign(new UserFacingError('TIMEOUT', { timeoutMs: ms }), { name: 'TimeoutError' }))
    }, ms)
  })
  return Promise.race([Promise.resolve().then(() => fn(controller.signal)), timeout])
    .finally(() => clearTimeout(timer))
}

export function endpointUrlOf(config: Config): string | null {
  const provider = config.engine.provider
  if (provider.startsWith('custom:')) {
    const entry = config.engine.customEngines.find((e) => e.id === provider.slice('custom:'.length))
    return entry?.endpoint.trim() ? entry.endpoint : null
  }
  switch (provider) {
    case 'openai':
      return config.engine.openai.endpoint || 'https://api.openai.com/v1'
    case 'deepseek':
      return config.engine.deepseek.endpoint || 'https://api.deepseek.com/v1'
    case 'claude':
      return 'https://api.anthropic.com'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com'
    case 'foxmori':
      return FOXMORI_ENDPOINT
    case 'libretranslate':
      return config.engine.keys.libreUrl || 'https://libretranslate.com'
    case 'custom':
      return config.engine.custom.url
    default:
      return null
  }
}

export async function assertEndpointPermission(config: Config): Promise<void> {
  const url = endpointUrlOf(config)
  if (!url) return
  let origin: string
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error()
    origin = parsed.origin
  } catch {
    throw new UserFacingError('ENDPOINT_INVALID')
  }
  const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] })
  if (!granted) {
    throw new UserFacingError('HOST_PERMISSION_REQUIRED')
  }
}

export async function requestWithPolicy<T>(config: Config, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  await assertEndpointPermission(config)
  return withTimeout(operation, config.engine.timeoutMs)
}
