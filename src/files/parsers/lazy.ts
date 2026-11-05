import type { DocParser } from './types'

/**
 * Keep format discovery synchronous without evaluating a heavy parser or its libraries.
 * The first parse/build shares one in-flight load; a failed load is not cached so the
 * next operation can retry. Parsing/building errors do not evict a loaded parser.
 */
export function lazyParser(exts: string[], loader: () => Promise<DocParser>): DocParser {
  let pending: Promise<DocParser> | undefined
  function load(): Promise<DocParser> {
    return pending ??= Promise.resolve().then(loader).catch((error: unknown) => {
      pending = undefined
      throw error
    })
  }

  return {
    exts,
    async parse(buf, name) {
      const parser = await load()
      return parser.parse(buf, name)
    },
    async build(doc, translations, mode) {
      const parser = await load()
      return parser.build(doc, translations, mode)
    },
  }
}
