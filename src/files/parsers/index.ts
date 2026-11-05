/**
 * 解析器路由：按扩展名分发到对应 parser。
 * 支持：pdf epub docx pptx xlsx html htm json txt md markdown srt vtt ass（ssa 归入 ass parser）。
 */
import type { DocParser } from './types'
import { extOf } from './types'
import { textParser, markdownParser } from './text'
import { srtParser, vttParser, assParser } from './subtitle'
import { jsonParser } from './jsonParser'
import { htmlParser } from './htmlParser'
import { lazyParser } from './lazy'

const PARSERS: DocParser[] = [
  textParser,
  markdownParser,
  srtParser,
  vttParser,
  assParser,
  jsonParser,
  htmlParser,
  // Literal import paths give each heavy format its own build chunk. Metadata is
  // intentionally eager: parserFor / SUPPORTED_EXTS must not start any downloads.
  lazyParser(['epub'], () => import('./epub').then((m) => m.epubParser)),
  lazyParser(['docx'], () => import('./docx').then((m) => m.docxParser)),
  lazyParser(['pptx'], () => import('./pptx').then((m) => m.pptxParser)),
  lazyParser(['xlsx'], () => import('./xlsx').then((m) => m.xlsxParser)),
  lazyParser(['pdf'], () => import('./pdf').then((m) => m.pdfParser)),
]

const BY_EXT = new Map<string, DocParser>()
for (const p of PARSERS) {
  for (const ext of p.exts) BY_EXT.set(ext, p)
}

/** 全部受支持的扩展名（小写、不含点），UI accept/提示用 */
export const SUPPORTED_EXTS: string[] = Array.from(BY_EXT.keys())

/** 按文件名取 parser；不支持返回 null */
export function parserFor(name: string): DocParser | null {
  return BY_EXT.get(extOf(name)) ?? null
}
