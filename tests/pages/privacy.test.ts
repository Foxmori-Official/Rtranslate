// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

afterEach(() => { vi.unstubAllGlobals() })
it('privacy page accurately distinguishes local extension data and hosted API processing', async () => {
  vi.resetModules()
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } })
  await import('../../src/privacy/main')
  const text = document.body.textContent!
  expect(text).toContain('https://api.foxmori.com/v1')
  expect(text).toContain('2026-11-05')
  expect(text).toContain('new key and a supported model ID')
  expect(text).toContain('Language detection, AI reading/chat, writing, terminology extraction')
  expect(text).toContain('cached locally and may contain restored, unmasked text')
  expect(text).not.toContain('TransVerse')
  expect(text).not.toContain('This extension has no servers')
  expect(document.documentElement.lang).toBe('en')
  expect(document.title).toContain('Foxmori')
})
it('all nine store listings describe Foxmori credentials and masking limits', () => {
  for (const locale of ['en', 'de', 'es', 'fr', 'pt_BR', 'ja', 'zh_CN', 'zh_TW', 'ko']) {
    const text = readFileSync(`${process.cwd()}/docs/store-listing/${locale}.md`, 'utf8')
    expect(text).toContain('Foxmori')
    expect(text).toContain('PRIVACY.md')
    expect(text).not.toMatch(/aimao\.today|no middle servers|never leaves your device unmasked|未脱敏的内容不会离开|未脫敏的內容不會離開/)
  }
})
