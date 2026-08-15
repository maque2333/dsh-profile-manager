/**
 * plugin 包单元测试：
 * - 导出形状（Loader 可识别的 host 插件）
 * - currentProfileName 解析（自保只读判定）
 * - ProfileManager 服务转发 core（list / delete 自保）
 * 全程临时 DSH_HOME，绝不碰真实 ~/.dsh。
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.js'
import { ProfileManager, currentProfileName } from '../src/profile-manager.js'

describe('plugin 导出形状', () => {
  it('导出 name 与 apply（host bundle 入口）', () => {
    expect(plugin.name).toBe('dsh-profile-manager')
    expect(typeof plugin.apply).toBe('function')
  })
})

describe('currentProfileName', () => {
  const orig = process.argv

  afterEach(() => {
    process.argv = orig
  })

  it('从 --profile <name> 解析', () => {
    process.argv = ['node', 'dsh', '--profile', 'foo', '--port', '3100']
    expect(currentProfileName()).toBe('foo')
  })

  it('从 --profile=<name> 解析', () => {
    process.argv = ['node', 'dsh', '--profile=bar']
    expect(currentProfileName()).toBe('bar')
  })

  it('无 --profile 返回 undefined', () => {
    process.argv = ['node', 'dsh']
    expect(currentProfileName()).toBeUndefined()
  })
})

describe('ProfileManager 服务', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dshm-plugin-'))
    process.env.DSH_HOME = home
    mkdirSync(join(home, 'profiles'), { recursive: true })
  })

  afterEach(() => {
    delete process.env.DSH_HOME
    rmSync(home, { recursive: true, force: true })
  })

  it('list 返回空（无 profile）', async () => {
    const ctx = new Context()
    await ctx.plugin(ProfileManager)
    const pm = ctx.get('profileManager') as ProfileManager
    expect(await pm.list()).toEqual([])
  })

  it('dshHome 来自 resolveDshHome（DSH_HOME 环境变量）', async () => {
    const ctx = new Context()
    await ctx.plugin(ProfileManager)
    const pm = ctx.get('profileManager') as ProfileManager
    expect(pm.dshHome).toBe(home)
  })

  it('delete 自保：拒绝删除当前运行 profile', async () => {
    process.argv = ['node', 'dsh', '--profile', 'self']
    // 造一个与当前 profile 同名的 profile 目录
    mkdirSync(join(home, 'profiles', 'self'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'self', 'package.json'), JSON.stringify({
      name: 'dsh-profile-self',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }))

    const ctx = new Context()
    await ctx.plugin(ProfileManager)
    const pm = ctx.get('profileManager') as ProfileManager
    expect(() => pm.delete('self', { purge: false })).toThrow(/只读/)
  })
})
