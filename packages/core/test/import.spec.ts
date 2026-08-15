import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { exportProfileText, parseProfileFile } from '../src/import.js'
import { DshmError } from '../src/types.js'
import type { RuntimeState } from '../src/types.js'

const valid = `dshmProfile: 1
name: writing
bundles:
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'
dependencies:
  dsh-news-briefing: ^1.0.0
patch: |
  - insert:
      - id: ui-topbar
        name: dsh-ui-topbar-compact
meta:
  port: 3082
`

describe('parseProfileFile', () => {
  it('解析合法文件', () => {
    const spec = parseProfileFile(valid)
    expect(spec.name).toBe('writing')
    expect(spec.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(spec.dependencies).toEqual({ 'dsh-news-briefing': '^1.0.0' })
    expect(spec.meta?.port).toBe(3082)
    expect(spec.patch).toContain('ui-topbar')
  })
  it('版本不符 → 报错', () => {
    expect(() => parseProfileFile('dshmProfile: 2\nname: x\nbundles: [a]\n')).toThrow(DshmError)
  })
  it('非法 profile 名 → 报错', () => {
    expect(() => parseProfileFile('dshmProfile: 1\nname: a/b\nbundles: [a]\n')).toThrow(/无效的 profile 名/)
  })
  it('bundles 为空 → 报错', () => {
    expect(() => parseProfileFile('dshmProfile: 1\nname: x\nbundles: []\n')).toThrow(/bundles/)
  })
  it('dependencies 是列表 → 报错（必须与 package.json 同构的映射）', () => {
    expect(() => parseProfileFile('dshmProfile: 1\nname: x\nbundles: [a]\ndependencies:\n  - foo@1\n')).toThrow(/dependencies 必须是映射/)
  })
  it('meta.port 非整数 → 报错', () => {
    expect(() => parseProfileFile('dshmProfile: 1\nname: x\nbundles: [a]\nmeta:\n  port: "3082"\n')).toThrow(/meta.port/)
  })
  it('顶层非映射 → 报错', () => {
    expect(() => parseProfileFile('- a\n- b\n')).toThrow(/顶层必须是 YAML 映射/)
  })
})

describe('exportProfileText', () => {
  let homes: string[] = []
  const makeHome = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'dshm-export-'))
    homes.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('export → parse 往返一致（官方三件套的 YAML 合订本）', () => {
    const home = makeHome()
    const profileDir = join(home, 'profiles', 'writing')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-writing',
      dependencies: { 'dsh-news-briefing': '^1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }, undefined, 2))
    writeFileSync(join(profileDir, 'cordis.patch.yml'), '- insert:\n    - id: ui-topbar\n      name: x\n')
    const state: RuntimeState = {
      suggestedPorts: { writing: 3082 },
      instances: {},
    }
    const text = exportProfileText(home, 'writing', state)
    const spec = parseProfileFile(text)
    expect(spec.name).toBe('writing')
    expect(spec.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(spec.dependencies).toEqual({ 'dsh-news-briefing': '^1.0.0' })
    expect(spec.meta?.port).toBe(3082)
    expect(spec.patch).toContain('ui-topbar')
  })
})
