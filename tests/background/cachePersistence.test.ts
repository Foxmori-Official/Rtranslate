import { afterEach, expect, it, vi } from 'vitest'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => vi.unstubAllGlobals())
it('serializes an earlier flush before a later cache clear', async () => {
  vi.resetModules()
  const callbacks: Array<() => void> = []
  const writes: Record<string, unknown>[] = []
  let persisted: Record<string, unknown> = {}
  vi.stubGlobal('chrome', { runtime: {}, storage: { local: {
    get: (_key: string, cb: (value: unknown) => void) => cb({}),
    set: (value: Record<string, unknown>, cb: () => void) => {
      writes.push(value)
      callbacks.push(() => { persisted = value; cb() })
    },
  } } })
  const cache = await import('../../src/background/cache')
  await cache.set('old', 'value')
  const flush = cache.flushCache(); await tick()
  const clear = cache.clearAll(); await tick()
  expect(writes).toHaveLength(1)
  callbacks.shift()!(); await flush; await tick()
  expect(writes).toHaveLength(2)
  callbacks.shift()!(); await clear
  expect(persisted['tv:cache_v1']).toEqual({})
})
it('surfaces quota failures to explicit flush callers and can retry', async () => {
  vi.resetModules()
  const runtime: { lastError?: { message: string } } = {}
  let fail = true
  vi.stubGlobal('chrome', { runtime, storage: { local: {
    get: (_key: string, cb: (value: unknown) => void) => cb({}),
    set: (_value: unknown, cb: () => void) => { if (fail) runtime.lastError = { message: 'Test quota failure' }; cb(); delete runtime.lastError },
  } } })
  const cache = await import('../../src/background/cache')
  await cache.set('key', 'value')
  await expect(cache.flushCache()).rejects.toThrow('quota')
  fail = false
  await expect(cache.flushCache()).resolves.toBeUndefined()
  await cache.clearAll()
})
