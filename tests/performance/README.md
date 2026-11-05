# Document parser lazy-loading regression

Run offline with the already installed dependencies:

```sh
npx vitest run tests/files tests/performance tests/pages/filesI18n.test.ts
npm run typecheck
npm run build
```

`filesBundle.test.ts` builds the production Vite configuration **in memory** with
`write: false` and `publicDir: false`. It does not mutate `dist`, sync assets, call
an API, or fetch fixtures. It checks Rollup's module/import graph rather than
searching minified source strings (Vite's dynamic preload map contains chunk names
without eagerly loading those chunks).

## Contract and coverage

- `parserFor(name)` still synchronously returns a stable `DocParser | null`.
- Format order, case-insensitive dispatch, aliases and unsupported-file behavior
  remain compatible; reading format metadata performs no heavy imports.
- A heavy parser's first `parse` **or** `build` triggers the import. Concurrent
  operations share a single pending load and successful loads remain cached.
- Rejected loaders, including synchronous loader throws, are evicted for retry.
  Document parse/build failures do not evict successfully loaded modules.
- Actual Office/EPUB ZIP fixtures roundtrip through the routed lazy proxies in
  both output modes, retaining untranslated content and non-text entries.
- All ten lightweight extensions/aliases have parse/build/reparse coverage.
- The PDF test executes the actual parser and HTML export with a stub PDF.js
  document API; it is not a browser/PDF-binary/worker end-to-end test.
- The production graph test uses the actual PDF.js and JSZip dependencies: all
  five heavy parsers are dynamic entries, absent from the files entry's static
  closure. Office/EPUB share JSZip and do not load PDF.js; PDF does not load JSZip.

## 2026-11-05 local measurement

Measured with this repository's installed Vite 7.3.7 and production minification.
Baseline was reproduced in memory by replacing **only** the router module with
`git show HEAD:src/files/parsers/index.ts`; the rest of the current working tree
(including all first-round uncommitted fixes) was retained. Baseline matches the
provided 571,169 / 174,294-byte snapshot exactly. gzip uses Node `gzipSync` defaults.

| Measurement | Eager registry | Lazy registry | Reduction |
| --- | ---: | ---: | ---: |
| `files.js` bytes | 571,169 | 24,982 | 95.63% |
| `files.js` gzip bytes | 174,294 | 9,408 | 94.60% |
| Initial static JS closure bytes | 652,807 | 106,620 | 83.67% |
| Initial static JS closure sum of per-file gzip bytes | 201,245 | 36,359 | 81.93% |

The static closure includes the entry and recursively imported shared JavaScript,
not CSS, HTML, PDF worker assets, or future dynamically imported chunks. Sum of
per-file gzip sizes is a comparison metric, not actual extension startup latency
or installed package size. Other concurrent changes may change these totals.

| On-demand chunk | Bytes | gzip bytes |
| --- | ---: | ---: |
| PDF (includes PDF.js) | 439,806 | 132,827 |
| EPUB | 3,839 | 1,902 |
| DOCX | 2,850 | 1,529 |
| PPTX | 2,908 | 1,565 |
| XLSX | 2,190 | 1,278 |
| Shared JSZip | 97,478 | 30,187 |

This optimizes entry loading/evaluation; total installed size and heavy-format
parse/build CPU/memory costs are not removed. Worker redesign, genuine large-file
profiling and installed-extension end-to-end verification are intentionally left
to the next phase. No dependency/config/UI/translation-engine changes are needed.
