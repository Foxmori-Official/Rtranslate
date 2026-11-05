import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addWord, deleteWord, getConfig, getWords, incrementTranslatedChars, setConfig, updateWord } from '../../src/shared/store'
import { applyConfigPatch, changedConfigFields, DEFAULT_CONFIG, normalizeConfig } from '../../src/shared/config'
let data: Record<string, unknown>
let failedWrite: boolean
beforeEach(() => {
  data = {}; failedWrite = false
  const runtime: { lastError?: { message: string } } = {}
  vi.stubGlobal('chrome', { runtime, storage: { local: {
    get: (key: string, cb: (values: Record<string, unknown>) => void) => {
      const snapshot = structuredClone({ [key]: data[key] }); queueMicrotask(() => cb(snapshot))
    },
    set: (patch: Record<string, unknown>, cb: () => void) => {
      if (!failedWrite) Object.assign(data, structuredClone(patch))
      queueMicrotask(() => { if (failedWrite) runtime.lastError = { message: 'Test quota exceeded' }; cb(); delete runtime.lastError })
    },
  } } })
})
describe('serialized mutations and migration', () => {
  it('retains two simultaneous settings updates', async () => {
    await Promise.all([setConfig({ uiLang: 'de' }), setConfig({ onboardingCompleted: true })])
    expect(await getConfig()).toMatchObject({ uiLang: 'de', onboardingCompleted: true })
  })
  it('saves 100 simultaneous words without lost entries', async () => {
    await Promise.all(Array.from({ length: 100 }, (_, i) => addWord({ word: `word-${i}` })))
    expect(await getWords()).toHaveLength(100)
  })
  it('serializes repeated sightings and update/delete operations', async () => {
    await Promise.all(Array.from({ length: 10 }, () => addWord({ word: 'same' })))
    const [word] = await getWords(); expect(word.seenCount).toBe(10)
    await Promise.all([updateWord(word.id, value => ({ ...value, note: 'edited' })), addWord({ word: 'other' }), deleteWord(word.id)])
    expect((await getWords()).map(value => value.word)).toEqual(['other'])
  })
  it('increments statistics from current state, not a stale request snapshot', async () => {
    await Promise.all(Array.from({ length: 10 }, () => incrementTranslatedChars(3)))
    expect((await getConfig()).stats.translatedChars).toBe(30)
  })
  it('rejects storage errors and the queue remains usable', async () => {
    failedWrite = true
    await expect(setConfig({ uiLang: 'de' })).rejects.toThrow('quota')
    failedWrite = false
    await setConfig({ uiLang: 'ja' })
    expect((await getConfig()).uiLang).toBe('ja')
  })
  it('sends only changed leaves and merges concurrent fields within the same domain', () => {
    const before = structuredClone(DEFAULT_CONFIG)
    const first = changedConfigFields(before, { general: { ...before.general, targetLang: 'ja' } })
    const second = changedConfigFields(before, { general: { ...before.general, displayMode: 'translationOnly' } })
    expect(first.general).toEqual({ targetLang: 'ja' })
    expect(applyConfigPatch(applyConfigPatch(before, first), second).general).toMatchObject({ targetLang: 'ja', displayMode: 'translationOnly' })
  })
  it('migrates the legacy provider without forwarding old credentials or model', () => {
    const old = structuredClone(DEFAULT_CONFIG)
    old.engine.provider = 'aimao'; old.engine.keys.aimao = 'FAKE-LEGACY-SECRET'; old.engine.aimao.model = 'old-model'
    old.compareEngines = ['aimao', 'google']; old.glossary = [{ src: 'foo', dst: 'bar' }]
    const next = normalizeConfig(old)
    expect(next.engine.provider).toBe('foxmori')
    expect(next.engine.keys.foxmori).toBe(''); expect(next.engine.foxmori.model).toBe('')
    expect(next.engine.keys.aimao).toBe('FAKE-LEGACY-SECRET')
    expect(next.engine.aimao.model).toBe('old-model')
    expect(next.glossary).toEqual(old.glossary)
    expect(next.compareEngines).toEqual(['foxmori', 'google'])
    expect(next.serviceMigration.fromAimao).toBe(true)
    expect(normalizeConfig(next)).toEqual(next)
  })
  it('preserves dictionary enablement and rejects invalid batch and target values', () => {
    const old = structuredClone(DEFAULT_CONFIG)
    old.glossaryLibs.enabled = { programming: true, game: false }; old.general.targetLang = 'auto'
    old.batch.concurrency = 0; old.batch.maxTexts = Number.NaN; old.engine.timeoutMs = Number.POSITIVE_INFINITY
    const next = normalizeConfig(old)
    expect(next.glossaryLibs.enabled).toEqual(old.glossaryLibs.enabled)
    expect(next.general.targetLang).toBe('zh-CN'); expect(next.batch.concurrency).toBe(1)
    expect(next.batch.maxTexts).toBe(DEFAULT_CONFIG.batch.maxTexts)
    expect(next.engine.timeoutMs).toBe(DEFAULT_CONFIG.engine.timeoutMs)
  })
})
