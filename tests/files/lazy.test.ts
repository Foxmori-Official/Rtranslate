import { describe, expect, it, vi } from 'vitest'
import { lazyParser } from '../../src/files/parsers/lazy'
import type { DocParser, ParsedDoc } from '../../src/files/parsers/types'

const doc: ParsedDoc = { kind: 'test', baseName: 'demo', segments: [], state: {} }
const translations = new Map([[0, 'Translated text']])

function implementation(): DocParser {
  return {
    exts: ['test'],
    parse: vi.fn(async () => doc),
    build: vi.fn(() => ({ blob: new Blob(['output']), filename: 'demo.test' })),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('lazyParser', () => {
  it('exposes synchronous metadata without invoking the loader', () => {
    const loader = vi.fn(async () => implementation())
    const parser = lazyParser(['test', 'alias'], loader)
    expect(parser.exts).toEqual(['test', 'alias'])
    expect(parser.parse).toBeTypeOf('function')
    expect(parser.build).toBeTypeOf('function')
    expect(loader).not.toHaveBeenCalled()
  })

  it('shares the first pending load across concurrent parse and build calls', async () => {
    const gate = deferred<DocParser>()
    const loader = vi.fn(() => gate.promise)
    const real = implementation()
    const parser = lazyParser(['test'], loader)
    const buf = new ArrayBuffer(0)
    const parse1 = parser.parse(buf, 'first.test')
    const parse2 = parser.parse(buf, 'second.test')
    const build = parser.build(doc, translations, 'bilingual')
    await Promise.resolve()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(real.parse).not.toHaveBeenCalled()
    expect(real.build).not.toHaveBeenCalled()
    gate.resolve(real)
    expect(await parse1).toBe(doc)
    expect(await parse2).toBe(doc)
    expect((await build).filename).toBe('demo.test')
    expect(real.parse).toHaveBeenNthCalledWith(1, buf, 'first.test')
    expect(real.parse).toHaveBeenNthCalledWith(2, buf, 'second.test')
    expect(real.build).toHaveBeenCalledWith(doc, translations, 'bilingual')
    await parser.parse(buf, 'later.test')
    await parser.build(doc, translations, 'translationOnly')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(real.build).toHaveBeenLastCalledWith(doc, translations, 'translationOnly')
  })

  it('also loads on build before any parse, preserving method receivers', async () => {
    const real = implementation()
    real.build = vi.fn(function (this: DocParser) {
      expect(this).toBe(real)
      return { blob: new Blob(), filename: 'build-first.test' }
    })
    const loader = vi.fn(async () => real)
    const parser = lazyParser(['test'], loader)
    expect((await parser.build(doc, translations, 'translationOnly')).filename).toBe('build-first.test')
    expect(real.parse).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('rejects all waiters on load failure, then shares one fresh retry', async () => {
    const first = deferred<DocParser>()
    const retry = deferred<DocParser>()
    const error = new Error('chunk unavailable')
    const loader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise)
    const parser = lazyParser(['test'], loader)
    const failed = Promise.allSettled([
      parser.parse(new ArrayBuffer(0), 'first.test'),
      parser.build(doc, translations, 'bilingual'),
    ])
    first.reject(error)
    expect(await failed).toEqual([
      { status: 'rejected', reason: error }, { status: 'rejected', reason: error },
    ])
    const pending = Promise.all([
      parser.parse(new ArrayBuffer(0), 'retry.test'),
      parser.build(doc, translations, 'bilingual'),
    ])
    await Promise.resolve()
    expect(loader).toHaveBeenCalledTimes(2)
    retry.resolve(implementation())
    expect(await pending).toHaveLength(2)
  })

  it('converts synchronous loader throws into rejections and allows retry', async () => {
    const error = new Error('synchronous loader failure')
    const loader = vi.fn<() => Promise<DocParser>>()
      .mockImplementationOnce(() => { throw error })
      .mockResolvedValue(implementation())
    const parser = lazyParser(['test'], loader)
    await expect(parser.parse(new ArrayBuffer(0), 'demo.test')).rejects.toBe(error)
    await expect(parser.parse(new ArrayBuffer(0), 'demo.test')).resolves.toBe(doc)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not reload a successfully loaded module after parse/build errors', async () => {
    const error = new Error('bad document')
    const real = implementation()
    real.parse = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(doc)
    real.build = vi.fn().mockImplementationOnce(() => { throw error })
      .mockResolvedValue({ blob: new Blob(), filename: 'retry.test' })
    const loader = vi.fn(async () => real)
    const parser = lazyParser(['test'], loader)
    await expect(parser.parse(new ArrayBuffer(0), 'bad.test')).rejects.toBe(error)
    await expect(parser.build(doc, translations, 'bilingual')).rejects.toBe(error)
    await expect(parser.parse(new ArrayBuffer(0), 'good.test')).resolves.toBe(doc)
    expect((await parser.build(doc, translations, 'bilingual')).filename).toBe('retry.test')
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
