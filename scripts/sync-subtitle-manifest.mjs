// The same domain inventory drives runtime routing and packaged script injection.
import { readFileSync, writeFileSync } from 'node:fs'
const hosts = JSON.parse(readFileSync(new URL('../src/subtitles/platforms.json', import.meta.url), 'utf8'))
const file = new URL('../public/manifest.json', import.meta.url)
const manifest = JSON.parse(readFileSync(file, 'utf8'))
const entry = manifest.content_scripts.find(script => script.js.includes('subtitles.js'))
if (!entry) throw new Error('Missing subtitles.js content script')
entry.matches = Object.values(hosts).flat().map(host => `*://${host}/*`)
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
