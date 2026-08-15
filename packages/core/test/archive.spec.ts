import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteProfile } from '../src/archive.js'
import { DshmError } from '../src/types.js'
import type { RuntimeState } from '../src/types.js'

let dirs: string[] = []
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-archive-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function makeProfile(home: string, name: string): void {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `dsh-profile-${name}` }))
}

describe('deleteProfile', () => {
  it('默认归档：目录移进 archive/，sessions 不受影响', () => {
    const home = tempHome()
    makeProfile(home, 'writing')
    mkdirSync(join(home, 'sessions'), { recursive: true })
    const result = deleteProfile(home, 'writing', { instances: {} }, { purge: false, yes: true })
    expect(result.action).toBe('archived')
    expect(existsSync(join(home, 'profiles', 'writing'))).toBe(false)
    const archives = readdirSync(join(home, 'profile-manager', 'archive'))
    expect(archives.length).toBe(1)
    expect(archives[0].startsWith('writing-')).toBe(true)
    expect(existsSync(join(home, 'sessions'))).toBe(true)
  })
  it('--purge 真删', () => {
    const home = tempHome()
    makeProfile(home, 'writing')
    const result = deleteProfile(home, 'writing', { instances: {} }, { purge: true, yes: true })
    expect(result.action).toBe('purged')
    expect(existsSync(join(home, 'profiles', 'writing'))).toBe(false)
    expect(existsSync(join(home, 'profile-manager', 'archive'))).toBe(false)
  })
  it('运行中实例 → 拒绝删除', () => {
    const home = tempHome()
    makeProfile(home, 'writing')
    const state: RuntimeState = {
      instances: { 'writing-1': { id: 'writing-1', profile: 'writing', shape: 'web', port: 3082, pid: process.pid, startedAt: '', dshHome: '', logFile: '', foreground: false } },
    }
    expect(() => deleteProfile(home, 'writing', state, { purge: false, yes: true })).toThrow(/运行中实例/)
  })
  it('未确认 → 报错提示 --yes', () => {
    const home = tempHome()
    makeProfile(home, 'writing')
    expect(() => deleteProfile(home, 'writing', { instances: {} }, { purge: false, yes: false })).toThrow(DshmError)
  })
  it('不存在的 profile → 报错', () => {
    const home = tempHome()
    expect(() => deleteProfile(home, 'ghost', { instances: {} }, { purge: false, yes: true })).toThrow(/不存在/)
  })
})
