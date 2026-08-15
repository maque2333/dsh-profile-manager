import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findFreePort, isPortFree, resolvePort } from '../src/ports.js'
import type { RuntimeState } from '../src/types.js'
import { DshmError } from '../src/types.js'

describe('isPortFree / findFreePort', () => {
  it('bind 测试：占用中的端口不空闲', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    expect(await isPortFree(port)).toBe(false)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(await isPortFree(port)).toBe(true)
  })
  it('findFreePort 返回可绑定端口（3081 起）', async () => {
    const port = await findFreePort(3081)
    expect(port).toBeGreaterThanOrEqual(3081)
    expect(await isPortFree(port)).toBe(true)
  })
})

describe('resolvePort 端口链', () => {
  const state: RuntimeState = { instances: {} }

  it('显式端口被其他实例占用 → 报错', async () => {
    await expect(resolvePort({
      explicit: 3082, state: { instances: { 'x-1': { id: 'x-1', profile: 'x', shape: 'web', port: 3082, pid: 1, startedAt: '', dshHome: '', logFile: '', foreground: false } } }, profile: 'y',
    })).rejects.toThrow(DshmError)
  })

  it('上次端口空闲则复用', async () => {
    const s: RuntimeState = { instances: { 'w-1': { id: 'w-1', profile: 'w', shape: 'web', port: 34991, pid: 1, startedAt: '', dshHome: '', logFile: '', foreground: false } } }
    expect(await resolvePort({ state: s, profile: 'w' })).toBe(34991)
  })

  it('无任何线索 → 3081 起找空', async () => {
    const port = await resolvePort({ state, profile: 'fresh' })
    expect(port).toBeGreaterThanOrEqual(3081)
    expect(await isPortFree(port)).toBe(true)
  })

  it('suggested 可用时优先于扫描', async () => {
    const port = await resolvePort({ state, profile: 'sugg', suggested: 34990 })
    expect(port).toBe(34990)
  })
})
