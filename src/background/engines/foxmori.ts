// Foxmori（foxmori.com）内置引擎：OpenAI 兼容协议，端点固定，无需用户填 endpoint。
// key 走 config.engine.keys.foxmori，model 走 config.engine.foxmori.model；
// system prompt / 批协议 / stripThinking 全部复用 openaiCompat 工厂，与其他 AI 引擎行为一致。
import { createOpenAICompatEngine } from './openaiCompat'

/** Foxmori固定端点（endpointUrlOf 与引擎共用此常量，避免两处漂移）。 */
export { FOXMORI_ENDPOINT } from '../../shared/brand'
import { FOXMORI_ENDPOINT } from '../../shared/brand'

export const foxmoriEngine = createOpenAICompatEngine({
  id: 'foxmori',
  name: 'Foxmori',
  getEndpoint: () => FOXMORI_ENDPOINT,
  getApiKey: (ctx) => {
    if (!ctx.config.engine.keys.foxmori.trim()) throw new Error('Foxmori: enter a new API key on the options page (Settings → Engines).')
    return ctx.config.engine.keys.foxmori
  },
  getModel: (ctx) => {
    if (!ctx.config.engine.foxmori.model.trim()) throw new Error('Foxmori: enter a supported model ID on the options page (Settings → Engines).')
    return ctx.config.engine.foxmori.model
  },
})
