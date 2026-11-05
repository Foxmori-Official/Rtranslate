import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { SUBTITLE_MATCHES, subtitlePlatform } from '../../src/subtitles/platforms'

describe('subtitle site inventory', () => {
  it.each([
    ['www.youtube.com','youtube'], ['meet.google.com','meet'],
    ['teams.microsoft.com','teams'], ['teams.live.com','teams'], ['teams.cloud.microsoft','teams'],
    ['zoom.us','zoom'], ['app.zoom.us','zoom'], ['zoom.com','zoom'], ['app.zoom.com','zoom'],
  ])('routes %s and injects the subtitles script there', (host, platform) => {
    expect(subtitlePlatform(host)).toBe(platform)
    expect(SUBTITLE_MATCHES.some(pattern => {
      const domain=pattern.split('/')[2]
      return domain.startsWith('*.') ? host===domain.slice(2)||host.endsWith(domain.slice(1)) : host===domain
    })).toBe(true)
  })
  it.each(['evilzoom.com','zoom.us.attacker.invalid','teams.live.com.invalid','youtube.com','example.com'])('does not route unrelated host %s', host => {
    expect(subtitlePlatform(host)).toBeNull()
  })
  it('keeps the source manifest in sync with the runtime inventory, without changing other scripts', () => {
    const manifest=JSON.parse(fs.readFileSync(new URL('../../public/manifest.json',import.meta.url),'utf8'))
    const script=manifest.content_scripts.find((item:{js:string[]})=>item.js.includes('subtitles.js'))
    expect(script.matches).toEqual(SUBTITLE_MATCHES)
    expect(manifest.content_scripts.find((item:{js:string[]})=>item.js.includes('content.js')).matches).toEqual(['http://*/*','https://*/*'])
  })
})
