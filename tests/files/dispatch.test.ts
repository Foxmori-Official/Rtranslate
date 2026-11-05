import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocParser } from '../../src/files/parsers/types'

const state = vi.hoisted(() => ({ loaded: [] as string[] }))
function stub(ext: string): DocParser {
  state.loaded.push(ext)
  return {
    exts: [ext],
    parse: async (_buf, name) => ({ kind: ext, baseName: name, segments: [], state: null }),
    build: () => ({ blob: new Blob(), filename: `output.${ext}` }),
  }
}
vi.mock('../../src/files/parsers/epub', () => ({ epubParser: stub('epub') }))
vi.mock('../../src/files/parsers/docx', () => ({ docxParser: stub('docx') }))
vi.mock('../../src/files/parsers/pptx', () => ({ pptxParser: stub('pptx') }))
vi.mock('../../src/files/parsers/xlsx', () => ({ xlsxParser: stub('xlsx') }))
vi.mock('../../src/files/parsers/pdf', () => ({ pdfParser: stub('pdf') }))

beforeEach(() => {
  vi.resetModules()
  state.loaded.length = 0
})

describe('parserFor synchronous dispatch and lazy boundaries', () => {
  it('keeps the complete ordered format list and aliases without loading heavy formats', async () => {
    const { parserFor, SUPPORTED_EXTS } = await import('../../src/files/parsers')
    expect(SUPPORTED_EXTS).toEqual([
      'txt', 'md', 'markdown', 'srt', 'vtt', 'ass', 'ssa', 'json', 'html', 'htm',
      'epub', 'docx', 'pptx', 'xlsx', 'pdf',
    ])
    for (const ext of SUPPORTED_EXTS) {
      const parser = parserFor(`UPPERCASE.${ext.toUpperCase()}`)!
      expect(parser).not.toBeInstanceOf(Promise)
      expect(parser.exts).toContain(ext)
      expect(parser.parse).toBeTypeOf('function')
      expect(parser.build).toBeTypeOf('function')
      expect(parserFor(`other.${ext}`)).toBe(parser)
    }
    expect(parserFor('a.md')).toBe(parserFor('b.markdown'))
    expect(parserFor('a.ass')).toBe(parserFor('b.ssa'))
    expect(parserFor('a.html')).toBe(parserFor('b.htm'))
    expect(parserFor('no-extension')).toBeNull()
    expect(parserFor('a.zip')).toBeNull()
    expect(state.loaded).toEqual([])
  })

  it('parses and builds a text file without evaluating PDF, Office or EPUB', async () => {
    const { parserFor } = await import('../../src/files/parsers')
    const parser = parserFor('demo.txt')!
    const doc = await parser.parse(new TextEncoder().encode('Hello world').buffer, 'demo.txt')
    expect(doc.segments[0].text).toBe('Hello world')
    expect((await parser.build(doc, new Map([[0, 'Translated text']]), 'translationOnly')).filename)
      .toBe('demo_已翻译.txt')
    expect(state.loaded).toEqual([])
  })

  it.each(['epub', 'docx', 'pptx', 'xlsx', 'pdf'])('loads only %s on first use', async (ext) => {
    const { parserFor } = await import('../../src/files/parsers')
    const parser = parserFor(`demo.${ext}`)!
    expect(state.loaded).toEqual([])
    const docs = await Promise.all([
      parser.parse(new ArrayBuffer(0), `first.${ext}`),
      parser.parse(new ArrayBuffer(0), `second.${ext}`),
    ])
    expect(docs.map((doc) => doc.kind)).toEqual([ext, ext])
    expect(state.loaded).toEqual([ext])
    await parser.build(docs[0], new Map(), 'bilingual')
    expect(state.loaded).toEqual([ext])
  })
})
