/**
 * plugins.ts 单元测试：list（全局/单 profile）与 bundle 级列表语义。
 * 手工造 profile 目录（临时 DSH_HOME），不依赖 dsh 子进程。
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProfilePlugins, listAllPlugins } from '../src/plugins.js'

function makeProfile(
  home: string,
  name: string,
  bundles: string[],
  dependencies: Record<string, string> = {},
): void {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${name}`,
    dependencies,
    dsh: { profile: { bundles } },
  }))
}

describe('listProfilePlugins', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dshm-plugins-'))
    mkdirSync(join(home, 'profiles'), { recursive: true })
  })

  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('列出 bundles + dependencies，按 bundle 优先', () => {
    makeProfile(home, 'writing', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], { 'dsh-news': '^1.0.0' })
    const entries = listProfilePlugins(home, 'writing')
    expect(entries.map((e) => e.name)).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-news'])
    expect(entries[0].kind).toBe('bundle')
    expect(entries[2].kind).toBe('dependency')
  })

  it('空 profile（无 bundles/deps）返回空数组', () => {
    makeProfile(home, 'empty', [])
    expect(listProfilePlugins(home, 'empty')).toEqual([])
  })

  it('profile 不存在时抛友好错误', () => {
    expect(() => listProfilePlugins(home, 'nope')).toThrow(/不存在/)
  })
})

describe('listAllPlugins', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dshm-plugins-all-'))
    mkdirSync(join(home, 'profiles'), { recursive: true })
  })

  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('汇总 plugin → 被哪些 profile 引用，按名排序', () => {
    makeProfile(home, 'writing', ['@deepseek-ai/dsh-base'])
    makeProfile(home, 'coding', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    const all = listAllPlugins(home)
    expect(all).toEqual([
      { plugin: '@deepseek-ai/dsh-base', kind: 'bundle', profiles: ['coding', 'writing'] },
      { plugin: '@deepseek-ai/dsh-web-app', kind: 'bundle', profiles: ['coding'] },
    ])
  })

  it('无 profile 时返回空数组', () => {
    expect(listAllPlugins(home)).toEqual([])
  })
})
