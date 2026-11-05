// Foxmori product icons. Canonical artwork: public/icons/icon.svg.
// Run: node scripts/gen-icons.mjs (sharp is an existing dev dependency).
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const directory = new URL('../public/icons/', import.meta.url)
const source = await readFile(new URL('icon.svg', directory))
for (const size of [16, 32, 48, 128, 256, 512]) {
  await sharp(source, { density: 384 }).resize(size, size).png({ palette: true, colours: 128, effort: 10 })
    .toFile(fileURLToPath(new URL(`icon${size}.png`, directory)))
}
console.log('Foxmori Rtranslate icons generated (16/32/48/128/256/512).')
