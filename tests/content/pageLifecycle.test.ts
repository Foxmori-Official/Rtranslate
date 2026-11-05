// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { PageTranslator } from '../../src/content/page'

class Observer {
  static all: Observer[] = []
  observed = new Set<Element>()
  constructor(private callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) { Observer.all.push(this) }
  observe(el: Element) { this.observed.add(el) }
  unobserve(el: Element) { this.observed.delete(el) }
  disconnect() { this.observed.clear() }
  enter(el: Element) { this.callback([{ target: el, isIntersecting: true }]) }
}
let pending: Array<(result: unknown) => void>
let send: ReturnType<typeof vi.fn>
let page: PageTranslator
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const settle = async () => { pending.splice(0).forEach(resolve => resolve({ ok: true, data: { text: '这是一段与原文不同的测试译文。' } })); await tick() }
const paragraph = () => document.querySelector('p')!
beforeEach(() => {
  Observer.all = []; pending = []
  document.body.innerHTML = ''
  send = vi.fn(() => new Promise(resolve => pending.push(resolve)))
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  vi.stubGlobal('IntersectionObserver', Observer)
  page = new PageTranslator(() => structuredClone(DEFAULT_CONFIG))
})
afterEach(async () => {
  if (page.isActive()) await page.toggle()
  await settle()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('translation lifecycle regressions', () => {
  it('registers the first scan with IO; does not request off-screen paragraphs', async () => {
    document.body.innerHTML = Array.from({ length: 1000 }, (_, i) => `<p>An English paragraph with enough words for translation ${i}.</p>`).join('')
    await page.toggle()
    expect(send).not.toHaveBeenCalled()
    expect(Observer.all[0].observed.size).toBe(1000)
    Observer.all[0].enter(paragraph())
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('discards late responses after disabling, with no new error or translated nodes', async () => {
    document.body.innerHTML = '<p>This is a long English sentence for testing.</p>'
    await page.toggle(); Observer.all[0].enter(paragraph())
    await page.toggle(); await settle()
    expect(document.querySelector('tv-translation,[data-tv-loading],[data-tv-error]')).toBeNull()
    expect(page.counts()).toEqual({ translatedCount: 0, failedCount: 0 })
  })
  it('an old request cannot mutate a newly enabled run or its counters', async () => {
    document.body.innerHTML = '<p>This is a long English sentence for testing.</p>'
    await page.toggle(); Observer.all[0].enter(paragraph())
    const old = pending.shift()!
    await page.toggle(); await page.toggle(); Observer.all[1].enter(paragraph())
    old({ ok: true, data: { text: '过期译文' } }); await tick()
    expect(document.querySelector('tv-translation')).toBeNull()
    expect(page.counts().translatedCount).toBe(0)
    await settle()
    expect(page.counts().translatedCount).toBe(1)
  })
  it('accumulates both MutationObserver callbacks within one debounce window', async () => {
    await page.toggle()
    const a = document.createElement('p'); a.textContent = 'This first English paragraph should be translated.'
    document.body.append(a); await tick()
    const b = document.createElement('p'); b.textContent = 'This second English paragraph should be translated.'
    document.body.append(b); await tick()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(Observer.all[0].observed.has(a)).toBe(true)
    expect(Observer.all[0].observed.has(b)).toBe(true)
  })
  it('cleans queued markers on disable and can observe those elements again', async () => {
    document.body.innerHTML = '<p>This offscreen paragraph has not been translated.</p>'
    await page.toggle()
    expect(paragraph().hasAttribute('data-tv-queued')).toBe(true)
    await page.toggle()
    expect(paragraph().hasAttribute('data-tv-queued')).toBe(false)
    await page.toggle()
    expect(Observer.all[1].observed.has(paragraph())).toBe(true)
  })
  it('restores original HTML in translation-only mode before removing markers', async () => {
    const config = structuredClone(DEFAULT_CONFIG); config.general.displayMode = 'translationOnly'
    page = new PageTranslator(() => config)
    document.body.innerHTML = '<p>Read the <strong>original English paragraph</strong> carefully.</p>'
    const original = paragraph().innerHTML
    await page.toggle(); Observer.all[0].enter(paragraph()); await settle()
    expect(document.querySelector('template.tv-backup')).not.toBeNull()
    await page.toggle()
    expect(paragraph().innerHTML).toBe(original)
  })
  it('does not start more than four paragraph requests at once', async () => {
    document.body.innerHTML = Array.from({ length: 12 }, (_, i) => `<p>This is English paragraph number ${i} for a test.</p>`).join('')
    await page.toggle()
    for (const el of document.querySelectorAll('p')) Observer.all[0].enter(el)
    expect(send).toHaveBeenCalledTimes(4)
    await page.toggle(); await settle()
    expect(send).toHaveBeenCalledTimes(4)
  })
})


describe('source edits during page translation', () => {
  const waitForScan = () => new Promise(resolve => setTimeout(resolve, 160))
  const setup = async () => {
    document.body.innerHTML = '<p>The original English paragraph describes a forest.</p>'
    await page.toggle(); Observer.all[0].enter(paragraph())
  }
  it('removes stale completed output and observes the edited paragraph again', async () => {
    await setup(); await settle()
    paragraph().firstChild!.textContent = 'The revised English paragraph describes an ocean.'
    await tick()
    expect(document.querySelector('tv-translation')).toBeNull()
    await waitForScan()
    expect(Observer.all[0].observed.has(paragraph())).toBe(true)
    Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].text).toContain('ocean')
    expect(page.counts()).toEqual({ translatedCount: 1, failedCount: 0 })
  })
  it('rejects a pending old result, then translates the latest source once', async () => {
    await setup()
    paragraph().firstChild!.textContent = 'The revised English paragraph describes an ocean.'
    await waitForScan()
    expect(send).toHaveBeenCalledTimes(1)
    await settle()
    expect(document.querySelector('tv-translation')).toBeNull()
    expect(page.counts()).toEqual({ translatedCount: 0, failedCount: 0 })
    await waitForScan(); Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].text).toContain('ocean')
    expect(page.counts()).toEqual({ translatedCount: 1, failedCount: 0 })
  })
  it('rejects stale text even if the response arrives before the observer debounce', async () => {
    await setup()
    paragraph().firstChild!.textContent = 'The revised English paragraph describes an ocean.'
    await settle()
    expect(document.querySelector('tv-translation')).toBeNull()
    expect(document.querySelector('[data-tv-error],[data-tv-loading]')).toBeNull()
  })
  it('coalesces streaming edits and detects textContent child replacement', async () => {
    await setup(); await settle()
    for (let i=0;i<8;i++) { paragraph().textContent = `This is revised English sentence number ${i} about an ocean.`; await tick() }
    await waitForScan(); Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].text).toContain('number 7')
  })
  it('detects edits inside inline markup without observing the whole document again', async () => {
    document.body.innerHTML='<p>Read the <strong>original forest article</strong> carefully.</p>'
    await page.toggle(); Observer.all[0].enter(paragraph()); await settle()
    document.querySelector('strong')!.firstChild!.textContent='updated ocean article'
    await waitForScan(); Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].text).toContain('updated ocean')
  })
  it('keeps translation-only output stable under its own DOM mutations and restores the new source', async () => {
    const config=structuredClone(DEFAULT_CONFIG); config.general.displayMode='translationOnly'
    page=new PageTranslator(()=>config)
    await setup(); await settle(); await waitForScan()
    expect(send).toHaveBeenCalledTimes(1)
    expect(document.querySelector('tv-translation')).not.toBeNull()
    paragraph().textContent='This replacement English paragraph describes an ocean.'
    await waitForScan(); Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    await page.toggle()
    expect(paragraph().textContent).toBe('This replacement English paragraph describes an ocean.')
  })
  it('can translate a paragraph that originally matched the target language', async () => {
    document.body.innerHTML='<p>这是一个足够长的中文句子，用于测试语言变化。</p>'
    await page.toggle()
    paragraph().textContent='This new English sentence should now be translated.'
    await waitForScan(); Observer.all[0].enter(paragraph()); await settle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(document.querySelector('tv-translation')).not.toBeNull()
  })
  it('refreshes a translated node edited while detached and reinserted in a new container', async () => {
    await setup(); await settle()
    const p=paragraph(); p.remove(); await tick()
    p.firstChild!.textContent='This recycled English paragraph now describes an ocean.'
    const container=document.createElement('article'); container.append(p); document.body.append(container)
    await waitForScan(); Observer.all[0].enter(p); await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].text).toContain('ocean')
    expect(page.counts()).toEqual({translatedCount:1,failedCount:0})
  })
  it('ignores edits inside injected translations and never loops on its own spinner', async () => {
    await setup(); await settle()
    document.querySelector('.tv-tr-inner')!.textContent='修改译文展示文本'
    await waitForScan()
    expect(send).toHaveBeenCalledTimes(1)
    expect(page.counts()).toEqual({ translatedCount: 1, failedCount: 0 })
  })
})
