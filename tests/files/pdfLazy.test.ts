import { afterEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  evaluations: 0,
  workerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}))
vi.mock('pdfjs-dist', () => {
  mock.evaluations++
  return { GlobalWorkerOptions: mock.workerOptions, getDocument: mock.getDocument }
})
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks() })

describe('lazy PDF boundary (PDF.js document API stub, real parser/export)', () => {
  it('delays PDF.js evaluation until parse, then exports escaped HTML through the proxy', async () => {
    const before = mock.evaluations
    const { parserFor } = await import('../../src/files/parsers')
    const parser = parserFor('demo.PDF')!
    expect(mock.evaluations).toBe(before)
    const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`)
    vi.stubGlobal('chrome', { runtime: { getURL } })
    const destroy = vi.fn()
    mock.getDocument.mockReturnValue({
      destroy,
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({
          items: [{ str: 'Hello world', transform: [1, 0, 0, 1, 0, 100], height: 12 }],
        }) }),
      }),
    })
    const bytes = new ArrayBuffer(8)
    const doc = await parser.parse(bytes, 'demo.PDF')
    expect(mock.evaluations).toBe(before + 1)
    expect(mock.workerOptions.workerSrc).toBe('chrome-extension://test/pdf.worker.min.js')
    expect(mock.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: new Uint8Array(bytes),
      cMapUrl: 'chrome-extension://test/pdfjs/cmaps/',
      standardFontDataUrl: 'chrome-extension://test/pdfjs/standard_fonts/',
    }))
    expect(doc.segments).toEqual([{ id: 0, text: 'Hello world' }])
    expect(destroy).toHaveBeenCalledTimes(1)
    const built = await parser.build(doc, new Map([[0, 'Translated <world> & friends']]), 'bilingual')
    expect(built.filename).toBe('demo_已翻译.html')
    const html = await built.blob.text()
    expect(html).toContain('Hello world')
    expect(html).toContain('Translated &lt;world&gt; &amp; friends')
    expect(mock.getDocument).toHaveBeenCalledTimes(1)
  })
})
