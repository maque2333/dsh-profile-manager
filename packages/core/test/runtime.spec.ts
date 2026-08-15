import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyRuntime, lastPortOf, loadRuntime, nextInstanceId, saveRuntime } from '../src/runtime.js'
import type { InstanceRecord, RuntimeState } from '../src/types.js'

let dirs: string[] = []
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-runtime-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function record(id: string, profile: string, port?: number): InstanceRecord {
  return {
    id, profile, shape: 'web', port, pid: 12345,
    startedAt: new Date().toISOString(), dshHome: '/tmp/x', logFile: '/tmp/x.log', foreground: false,
  }
}

describe('runtime.yaml 读写', () => {
  it('缺失文件 → 空状态', () => {
    expect(loadRuntime(tempHome())).toEqual(emptyRuntime())
  })
  it('roundtrip：保存后读回一致', () => {
    const home = tempHome()
    const state: RuntimeState = {
      defaultProfile: 'web',
      suggestedPorts: {},
      instances: { 'writing-1': record('writing-1', 'writing', 3082) },
    }
    saveRuntime(home, state)
    expect(loadRuntime(home)).toEqual(state)
  })
  it('损坏文件 → 空状态 + 警告', () => {
    const home = tempHome()
    mkdirSync(join(home, 'profile-manager'), { recursive: true })
    writeFileSync(join(home, 'profile-manager', 'runtime.yaml'), '{ bad yaml: [', 'utf8')
    const warnings: string[] = []
    expect(loadRuntime(home, { warn: (m) => warnings.push(m) })).toEqual(emptyRuntime())
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('实例 id', () => {
  it('nextInstanceId 递增', () => {
    const state: RuntimeState = { instances: { 'writing-1': record('writing-1', 'writing'), 'writing-2': record('writing-2', 'writing') } }
    expect(nextInstanceId(state, 'writing')).toBe('writing-3')
    expect(nextInstanceId(state, 'code')).toBe('code-1')
  })
  it('lastPortOf 取该 profile 最近登记的端口', () => {
    const state: RuntimeState = { instances: { 'writing-1': record('writing-1', 'writing', 3082) } }
    expect(lastPortOf(state, 'writing')).toBe(3082)
    expect(lastPortOf(state, 'code')).toBeUndefined()
  })
})
