/** Build in memory: no dist/public writes, browsers, API requests or fixture downloads. */
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const baseline = { bytes: 571169, gzip: 174294 }
const heavyFormats = ['epub', 'docx', 'pptx', 'xlsx', 'pdf']

describe('files production bundle lazy-loading regression', () => {
  it('keeps heavy modules out of the entry/static closure and emits independent format chunks', async () => {
    const result = await build({
      root,
      configFile: `${root}vite.config.ts`,
      logLevel: 'silent',
      publicDir: false,
      build: { write: false, reportCompressedSize: false },
    })
    const outputs = Array.isArray(result) ? result : 'output' in result ? [result] : []
    const chunks = outputs.flatMap((output) => output.output).filter((item) => item.type === 'chunk')
    const entry = chunks.find((chunk) => chunk.fileName === 'files.js')!
    expect(entry).toBeDefined()
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
    function closure(file: string): Set<string> {
      const visited = new Set<string>()
      const pending = [file]
      while (pending.length) {
        const next = pending.pop()!
        if (visited.has(next)) continue
        visited.add(next)
        for (const imported of byName.get(next)?.imports ?? []) pending.push(imported)
      }
      return visited
    }
    const initialFiles = closure(entry.fileName)
    const initialModules = [...initialFiles].flatMap((file) => Object.keys(byName.get(file)?.modules ?? {}))
    expect(initialModules.some((id) => id.includes('/node_modules/pdfjs-dist/'))).toBe(false)
    expect(initialModules.some((id) => id.includes('/node_modules/jszip/'))).toBe(false)
    expect(initialModules.some((id) => /\/parsers\/(pdf|docx|pptx|xlsx|epub)\.ts$/.test(id))).toBe(false)

    const formatMetrics = heavyFormats.map((format) => {
      const chunk = chunks.find((candidate) => candidate.facadeModuleId?.endsWith(`/parsers/${format}.ts`))!
      expect(chunk, `${format} chunk`).toBeDefined()
      expect(chunk.isDynamicEntry).toBe(true)
      expect(entry.dynamicImports).toContain(chunk.fileName)
      expect(initialFiles.has(chunk.fileName)).toBe(false)
      const modules = [...closure(chunk.fileName)].flatMap((file) => Object.keys(byName.get(file)?.modules ?? {}))
      // Each format loads only its library family, not the other one.
      if (format === 'pdf') {
        expect(modules.some((id) => id.includes('/node_modules/pdfjs-dist/'))).toBe(true)
        expect(modules.some((id) => id.includes('/node_modules/jszip/'))).toBe(false)
      } else {
        expect(modules.some((id) => id.includes('/node_modules/jszip/'))).toBe(true)
        expect(modules.some((id) => id.includes('/node_modules/pdfjs-dist/'))).toBe(false)
      }
      return { format, file: chunk.fileName, bytes: Buffer.byteLength(chunk.code), gzip: gzipSync(chunk.code).length }
    })
    const zipChunk = chunks.find((chunk) => Object.keys(chunk.modules).some((id) => id.includes('/node_modules/jszip/')))!
    expect(zipChunk).toBeDefined()
    expect(initialFiles.has(zipChunk.fileName)).toBe(false)

    const metrics = {
      baseline,
      entry: { bytes: Buffer.byteLength(entry.code), gzip: gzipSync(entry.code).length },
      // Includes pre-existing shared dictionaries/config/etc; entry is not the entire initial cost.
      initialStaticJS: {
        bytes: [...initialFiles].reduce((sum, file) => sum + Buffer.byteLength(byName.get(file)?.code ?? ''), 0),
        gzip: [...initialFiles].reduce((sum, file) => sum + gzipSync(byName.get(file)?.code ?? '').length, 0),
      },
      formats: formatMetrics,
      sharedZip: { file: zipChunk.fileName, bytes: Buffer.byteLength(zipChunk.code), gzip: gzipSync(zipChunk.code).length },
    }
    expect(metrics.entry.bytes).toBeLessThan(baseline.bytes * 0.1)
    expect(metrics.entry.gzip).toBeLessThan(baseline.gzip * 0.1)
    console.info('FILES_BUNDLE_METRICS', JSON.stringify(metrics, null, 2))
  }, 30_000)
})
