import { contentRequest, contentErrorText } from './uiLang'
import { sourceSignature } from './source'
// PageTranslator：整页双语翻译编排。
// IntersectionObserver 可见才译 + 并发队列 + MutationObserver 动态跟进 + 完全可逆开关。
import { findCandidates, extractText, buildTranslationHtml } from './dom'
import { injectTranslation, removeTranslation, removeAllTranslations, showLoading, showError, clearStatus } from './render'
import { normalizeText, sameText, splitLongText } from '../core/text'
import type { Config } from '../shared/config'
import type { TranslateResult } from '../shared/protocol'

const MAX_CONCURRENT = 4
const IO_ROOT_MARGIN = '1000px 0px'
const LONG_TEXT_SPLIT = 1500
const MO_DEBOUNCE_MS = 120
const CTX_DESC_MAX = 200
const CTX_BODY_MAX = 400
const CTX_TOTAL_MAX = 800

// 页面级上下文缓存：整页翻译期间所有段落共享同一份，不每段重取。
// undefined = 页面无可用上下文；null = 尚未提取。
let pageContextCache: string | undefined | null = null

/**
 * 全页摘要上下文（contextAware.enabled 时随 translate 消息发送，仅 AI 引擎使用）：
 * 标题 + meta description（截 200）+ 正文前 400 字符（空白归一化），总长截 800。
 * 页面无任何可用片段时返回 undefined。结果模块级缓存一次。
 */
export function getPageContext(): string | undefined {
  if (pageContextCache !== null) return pageContextCache
  const parts: string[] = []
  const title = document.title?.trim()
  if (title) parts.push(title)
  const desc = document
    .querySelector('meta[name="description"]')
    ?.getAttribute('content')
    ?.trim()
  if (desc) parts.push(desc.slice(0, CTX_DESC_MAX))
  // jsdom 无 innerText 实现，退 textContent（浏览器环境恒走 innerText）
  const bodyText = normalizeText(document.body?.innerText ?? document.body?.textContent ?? '')
  if (bodyText) parts.push(bodyText.slice(0, CTX_BODY_MAX))
  const joined = parts.join('\n').slice(0, CTX_TOTAL_MAX)
  pageContextCache = joined.length > 0 ? joined : undefined
  return pageContextCache
}

/** 清空页面上下文缓存（测试与 SPA 路由切换时用）。 */
export function resetPageContext(): void {
  pageContextCache = null
}

async function requestTranslate(text: string, config: Config): Promise<TranslateResult> {
  return contentRequest<TranslateResult>({
    kind: 'translate',
    text,
    targetLang: config.general.targetLang,
    sourceLang: config.general.sourceLang,
    // 仅开关开启时附带页面上下文；机器引擎在 background 侧忽略
    ...(config.contextAware.enabled ? { context: getPageContext() } : {}),
  })
}

/** 长文按句切分后顺序翻译拼接 */
async function translateLongText(text: string, config: Config, isCurrent: () => boolean): Promise<string> {
  if (text.length <= LONG_TEXT_SPLIT) {
    const r = await requestTranslate(text, config)
    return r.text
  }
  const parts = splitLongText(text, LONG_TEXT_SPLIT)
  const out: string[] = []
  for (const part of parts) {
    if (!isCurrent()) throw new Error('Translation cancelled')
    const r = await requestTranslate(part, config)
    out.push(r.text)
  }
  return out.join('\n')
}

/** 立即翻译单个元素（悬停翻译复用）。返回是否成功注入。 */
export async function translateElement(el: Element, config: Config, isCurrent: () => boolean = () => el.isConnected): Promise<boolean> {
  if (!isCurrent()) return false
  if (el.hasAttribute('data-tv-translated')) return true
  const extracted = extractText(el)
  if (!extracted) return false
  const signature = sourceSignature(el)
  const sourceIsCurrent = () => isCurrent() && el.isConnected && sourceSignature(el) === signature
  const spinner = showLoading(el)
  try {
    const translated = await translateLongText(extracted.text, config, sourceIsCurrent)
    if (!sourceIsCurrent()) return false
    clearStatus(el)
    if (sameText(translated, extracted.text)) {
      el.setAttribute('data-tv-translated', 'skipped')
      return true
    }
    injectTranslation(el, buildTranslationHtml(translated, extracted.placeholders), config)
    return true
  } catch (err) {
    if (!sourceIsCurrent()) return false
    showError(el, {
      message: contentErrorText(err),
      onRetry: () => { if (sourceIsCurrent()) void translateElement(el, config, isCurrent) },
    })
    return false
  } finally {
    // Remove only this request's spinner; an old response must not clear newer UI.
    spinner.remove()
  }
}

interface SourceState { signature: string; version: number; result?: 'translated' | 'failed' }

export class PageTranslator {
  private getConfig: () => Config
  private io: IntersectionObserver | null = null
  private mo: MutationObserver | null = null
  private pending = new Set<Element>()
  private running = 0
  private generation = 0
  private inFlight = new Set<Element>()
  private mutationRoots = new Set<Element>()
  private sources = new WeakMap<Element, SourceState>()
  private moTimer: ReturnType<typeof setTimeout> | null = null
  private activeFlag = false
  translatedCount = 0
  failedCount = 0

  constructor(getConfig: () => Config) {
    this.getConfig = getConfig
  }

  isActive(): boolean {
    return this.activeFlag
  }

  counts(): { translatedCount: number; failedCount: number } {
    return { translatedCount: this.translatedCount, failedCount: this.failedCount }
  }

  /** 切换整页翻译状态，返回切换后状态 */
  async toggle(): Promise<boolean> {
    if (this.activeFlag) {
      this.deactivate()
      return false
    }
    this.activate()
    return true
  }

  private activate() {
    this.activeFlag = true
    this.generation += 1
    this.sources = new WeakMap()
    resetPageContext()
    this.translatedCount = 0
    this.failedCount = 0
    const generation = this.generation
    this.io = new IntersectionObserver(
      (entries) => {
        if (!this.activeFlag || generation !== this.generation) return
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as Element
          this.io?.unobserve(el)
          this.enqueue(el)
        }
      },
      { rootMargin: IO_ROOT_MARGIN, threshold: 0 },
    )
    this.mo = new MutationObserver((records) => this.onMutations(records))
    this.mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    this.scan(document.body)
  }

  private deactivate() {
    this.activeFlag = false
    this.generation += 1
    this.io?.disconnect()
    this.io = null
    this.mo?.disconnect()
    this.mo = null
    if (this.moTimer) clearTimeout(this.moTimer)
    this.moTimer = null
    this.pending.clear()
    this.mutationRoots.clear()
    this.inFlight.clear()
    this.running = 0
    document.querySelectorAll('[data-tv-queued]').forEach((el) => el.removeAttribute('data-tv-queued'))
    removeAllTranslations()
  }

  /** 扫描根节点下的候选并交给 IO/队列 */
  scan(root: ParentNode) {
    if (!this.activeFlag || !root) return
    const config = this.getConfig()
    // Virtualized sites can edit detached nodes and reinsert them with our old
    // marker still attached; their characterData mutations were not observed.
    if (root instanceof Element && this.sources.has(root)) this.invalidateSource(root, false)
    for (const el of root.querySelectorAll('[data-tv-translated]')) this.invalidateSource(el, false)
    const candidates = findCandidates(root, config.general.targetLang)
    for (const el of candidates) {
      if (el.hasAttribute('data-tv-queued') || this.inFlight.has(el) || this.pending.has(el)) continue
      if (!this.sources.has(el)) this.sources.set(el, { signature: sourceSignature(el), version: 0 })
      el.setAttribute('data-tv-queued', '1')
      if (this.io) this.io.observe(el)
      else this.enqueue(el)
    }
  }

  /** Invalidate immediately; debounce only the next scan, never stale-result rejection. */
  private invalidateSource(el: Element, queue = true): boolean {
    const state = this.sources.get(el)
    const signature = sourceSignature(el)
    if (state && signature === state.signature) return false
    if (state) {
      if (state.result === 'translated') this.translatedCount -= 1
      if (state.result === 'failed') this.failedCount -= 1
      state.result = undefined
      state.signature = signature
      state.version += 1
    } else {
      this.sources.set(el, { signature, version: 0 })
    }
    removeTranslation(el)
    clearStatus(el)
    el.removeAttribute('data-tv-translated')
    el.removeAttribute('data-tv-queued')
    this.io?.unobserve(el)
    this.pending.delete(el)
    if (queue) this.mutationRoots.add(el)
    return true
  }

  private onMutations(records: MutationRecord[]) {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (!target || target.closest('[data-tv-owned], tv-translation')) continue
      const authored = (node: Node) => !(node instanceof Element && node.hasAttribute('data-tv-owned'))
      if (record.type === 'childList' && ![...record.addedNodes, ...record.removedNodes].some(authored)) continue
      // Inline edits belong to their tracked semantic parent, not only the <strong>/<a>.
      for (let parent: Element | null = target; parent; parent = parent.parentElement) {
        if (this.sources.has(parent) || parent.hasAttribute('data-tv-translated')) this.invalidateSource(parent)
        if (parent === document.body) break
      }
      if (record.type === 'characterData' || [...record.removedNodes].some(authored) ||
          [...record.addedNodes].some(node => node.nodeType === Node.TEXT_NODE)) this.mutationRoots.add(target)
      for (const node of record.addedNodes) {
        if (node instanceof Element && authored(node)) this.mutationRoots.add(node)
      }
    }
    if (this.mutationRoots.size) this.scheduleScan()
  }

  private scheduleScan(reset = true) {
    if (this.moTimer) {
      if (!reset) return
      clearTimeout(this.moTimer)
    }
    this.moTimer = setTimeout(() => {
      this.moTimer = null
      if (!this.activeFlag) return
      const roots = [...this.mutationRoots]
      this.mutationRoots.clear()
      for (const el of roots) if (el.isConnected) this.scan(el)
    }, MO_DEBOUNCE_MS)
  }

  private enqueue(el: Element) {
    if (!this.activeFlag) return
    el.removeAttribute('data-tv-queued')
    if (this.inFlight.has(el)) return
    if (el.hasAttribute('data-tv-translated') || !el.isConnected) return
    if (this.running >= MAX_CONCURRENT) {
      this.pending.add(el)
      return
    }
    void this.process(el)
  }

  private drain() {
    while (this.activeFlag && this.running < MAX_CONCURRENT && this.pending.size) {
      const el = this.pending.values().next().value as Element
      this.pending.delete(el)
      if (!el.isConnected) continue
      void this.process(el)
    }
  }

  private async process(el: Element) {
    const generation = this.generation
    const runIsCurrent = () => this.activeFlag && this.generation === generation
    const state = this.sources.get(el) ?? { signature: sourceSignature(el), version: 0 }
    this.sources.set(el, state)
    const version = state.version
    const isCurrent = () => runIsCurrent() && state.version === version
    this.inFlight.add(el)
    this.running += 1
    try {
      const ok = await translateElement(el, this.getConfig(), isCurrent)
      if (!isCurrent() || sourceSignature(el) !== state.signature || !el.isConnected) return
      state.result = ok ? 'translated' : 'failed'
      if (ok) this.translatedCount += 1
      else this.failedCount += 1
    } finally {
      if (runIsCurrent()) {
        this.inFlight.delete(el)
        this.running -= 1
        if (el.isConnected) {
          this.invalidateSource(el)
          if (state.version !== version) {
            this.mutationRoots.add(el)
            this.scheduleScan(false)
          }
        }
        this.drain()
      }
    }
  }
}
