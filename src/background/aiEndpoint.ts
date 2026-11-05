import { UserFacingError } from '../shared/errors'
import type { Config } from '../shared/config'
import { FOXMORI_ENDPOINT } from '../shared/brand'

/** AI 类 provider：openai/deepseek/claude/gemini/foxmori。 */
const AI_PROVIDERS = new Set(['openai', 'deepseek', 'claude', 'gemini', 'foxmori'])

/**
 * 是否 AI 类 provider（aiAssist / aiChat / aiWrite 共用的准入判定）：
 * 内置 AI 名单（openai/deepseek/claude/gemini/foxmori），或 custom:<id> 动态
 * 自定义引擎实例（OpenAI 兼容协议，天然是 AI 引擎）。
 */
export function isAiProvider(provider: string): boolean {
  return AI_PROVIDERS.has(provider) || provider.startsWith('custom:')
}


/**
 * AI 兼容端点解析（aiAssist / aiChat / aiWrite 共用，导出供 aiWrite 与单测）：
 * - openai/deepseek：各自 config 段的 endpoint/model，key 共用 keys.openai
 * - foxmori：固定端点 FOXMORI_ENDPOINT，key 走 keys.foxmori，model 走 engine.foxmori.model
 * - custom:<id>：endpoint/model/apiKey 均取 config.engine.customEngines 里的 entry
 * 非 AI provider、缺 key、或 custom 条目缺失时抛配置引导错误。
 * claude/gemini 为原生协议引擎，阅读辅助/写作的 OpenAI 兼容通道暂不支持（同旧行为抛引导错误）。
 */
export function resolveAiEndpoint(config: Config): { base: string; model: string; apiKey: string } {
  const provider = config.engine.provider
  if (!isAiProvider(provider)) throw new UserFacingError('AI_PROVIDER_UNSUPPORTED')
  if (provider === 'openai' || provider === 'deepseek') {
    if (!config.engine.keys.openai.trim()) throw new UserFacingError('KEY_MISSING')
    const ep = provider === 'deepseek' ? config.engine.deepseek : config.engine.openai
    if (!ep.model.trim()) throw new UserFacingError('MODEL_MISSING')
    const fallback =
      provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'
    return {
      base: (ep.endpoint || fallback).replace(/\/+$/, ''),
      model: ep.model,
      apiKey: config.engine.keys.openai,
    }
  }
  if (provider === 'foxmori') {
    if (!config.engine.keys.foxmori.trim()) throw new UserFacingError('KEY_MISSING')
    if (!config.engine.foxmori.model.trim()) throw new UserFacingError('MODEL_MISSING')
    return {
      base: FOXMORI_ENDPOINT,
      model: config.engine.foxmori.model,
      apiKey: config.engine.keys.foxmori,
    }
  }
  if (provider.startsWith('custom:')) {
    const entry = config.engine.customEngines.find((e) => e.id === provider.slice('custom:'.length))
    if (!entry) throw new UserFacingError('ENGINE_NOT_CONFIGURED')
    if (!entry.endpoint.trim()) throw new UserFacingError('ENDPOINT_INVALID')
    if (!entry.apiKey.trim()) throw new UserFacingError('KEY_MISSING')
    if (!entry.model.trim()) throw new UserFacingError('MODEL_MISSING')
    return {
      base: entry.endpoint.replace(/\/+$/, ''),
      model: entry.model,
      apiKey: entry.apiKey,
    }
  }
  // claude / gemini：原生协议，无 OpenAI 兼容端点可解析
  throw new UserFacingError('AI_PROVIDER_UNSUPPORTED')
}

