// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { JSZip } from '../../src/files/parsers/jszip'
import { parserFor } from '../../src/files/parsers'
import type { OutputMode } from '../../src/files/parsers/types'

// jsdom supplies DOMParser/XMLSerializer; Node's Blob supplies arrayBuffer/text.
beforeAll(() => { vi.stubGlobal('Blob', NodeBlob) })
afterAll(() => { vi.unstubAllGlobals() })

async function officeFixture(ext: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('untouched.bin', new Uint8Array([0, 1, 255, 42]))
  if (ext === 'docx') {
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello world</w:t></w:r></w:p><w:p><w:r><w:t>Keep original</w:t></w:r></w:p></w:body></w:document>')
  } else if (ext === 'pptx') {
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Hello world</a:t></a:r></a:p><a:p><a:r><a:t>Keep original</a:t></a:r></a:p></p:sld>')
  } else {
    zip.file('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Hello world</t></si><si><t>Keep original</t></si></sst>')
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function epubFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>')
  zip.file('OEBPS/book.opf', '<package><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
  zip.file('OEBPS/chapter.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Book</title></head><body><p>Hello world</p><p>Keep original</p></body></html>')
  zip.file('OEBPS/image.bin', new Uint8Array([0, 1, 255, 42]))
  return zip.generateAsync({ type: 'arraybuffer' })
}

const modes: OutputMode[] = ['translationOnly', 'bilingual']
const translated = 'Translated <world> & friends'

describe.each(['docx', 'pptx', 'xlsx'])('lazy %s roundtrip', (ext) => {
  it.each(modes)('%s preserves output contract, untranslated content and non-text ZIP entries', async (mode) => {
    const parser = parserFor(`demo.${ext}`)!
    const parsed = await parser.parse(await officeFixture(ext), `demo.${ext}`)
    expect(parsed.kind).toBe(ext)
    expect(parsed.segments.map((s) => s.text)).toEqual(['Hello world', 'Keep original'])
    const built = await parser.build(parsed, new Map([[0, translated]]), mode)
    expect(built.filename).toBe(`demo_已翻译.${ext}`)
    const bytes = await built.blob.arrayBuffer()
    const reParsed = await parserFor(built.filename)!.parse(bytes, built.filename)
    const texts = reParsed.segments.map((s) => s.text)
    if (mode === 'translationOnly') expect(texts).toEqual([translated, 'Keep original'])
    else if (ext === 'xlsx') expect(texts).toEqual([`Hello world | ${translated}`, 'Keep original'])
    else expect(texts).toEqual(['Hello world', translated, 'Keep original'])
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('untouched.bin')!.async('uint8array')).toEqual(new Uint8Array([0, 1, 255, 42]))
  })
})

describe('lazy EPUB roundtrip', () => {
  it.each(modes)('%s preserves chapters, package metadata and mimetype-first STORE layout', async (mode) => {
    const parser = parserFor('demo.EPUB')!
    const doc = await parser.parse(await epubFixture(), 'demo.EPUB')
    expect(doc.segments.map((s) => s.text)).toEqual(['Hello world', 'Keep original'])
    const built = await parser.build(doc, new Map([[0, translated]]), mode)
    expect(built.filename).toBe('demo_已翻译.epub')
    const bytes = await built.blob.arrayBuffer()
    const view = new DataView(bytes)
    expect(view.getUint32(0, true)).toBe(0x04034b50) // first ZIP local file header
    expect(view.getUint16(8, true)).toBe(0) // STORE
    expect(new TextDecoder().decode(bytes.slice(30, 30 + view.getUint16(26, true)))).toBe('mimetype')
    const again = await parser.parse(bytes, built.filename)
    const texts = again.segments.map((s) => s.text)
    expect(texts[0]).toBe(mode === 'translationOnly' ? translated : `Hello world${translated}`)
    expect(texts[1]).toBe('Keep original')
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('OEBPS/image.bin')!.async('uint8array')).toEqual(new Uint8Array([0, 1, 255, 42]))
    expect(await zip.file('OEBPS/book.opf')!.async('string')).toContain('idref="chapter"')
  })
})

const lightweight: Array<[string, string]> = [
  ['txt', 'Hello world'],
  ['md', 'Hello world\n\n```js\nconst untouched = 42\n```'],
  ['markdown', 'Hello world'],
  ['json', '{"title":"Hello world","id":42}'],
  ['html', '<!DOCTYPE html><html><body><p>Hello world</p></body></html>'],
  ['htm', '<p>Hello world</p>'],
  ['srt', '1\n00:00:01,000 --> 00:00:02,000\nHello world\n'],
  ['vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello world\n'],
  ['ass', '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello world\n'],
  ['ssa', '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello world\n'],
]

describe('lightweight dispatch remains compatible', () => {
  it.each(lightweight)('%s parse/build/reparse', async (ext, content) => {
    const parser = parserFor(`demo.${ext}`)!
    const doc = await parser.parse(new TextEncoder().encode(content).buffer, `demo.${ext}`)
    expect(doc.segments.map((s) => s.text)).toEqual(['Hello world'])
    const built = await parser.build(doc, new Map([[0, translated]]), 'translationOnly')
    const again = await parserFor(built.filename)!.parse(await built.blob.arrayBuffer(), built.filename)
    expect(again.segments.map((s) => s.text)).toEqual([translated])
    if (ext === 'md') expect(await built.blob.text()).toContain('const untouched = 42')
    if (ext === 'srt') expect(await built.blob.text()).toContain('00:00:01,000 --> 00:00:02,000')
    if (ext === 'json') expect(JSON.parse(await built.blob.text()).id).toBe(42)
  })
})
