/** CLI 级 e2e：spawn 真实 dshm 二进制（lib/index.js）。依赖先 build（根 check 脚本保证顺序）。 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const hasCli = existsSync(cliPath)

let dirs: string[] = []
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-cli-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function dshm(home: string, args: string[]): { code: number; out: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

describe.skipIf(!hasCli)('CLI export → import 往返', () => {
  it('导出再导入另一台机器（临时 home）后 list 可见', () => {
    const homeA = tempHome()
    const profileDir = join(homeA, 'profiles', 'writing')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-writing',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }, undefined, 2))
    writeFileSync(join(profileDir, 'cordis.patch.yml'), '- insert:\n    - id: ui-x\n      name: ui-x\n')

    // export
    const exported = join(homeA, 'writing.profile.yaml')
    const exp = dshm(homeA, ['export', 'writing', '-o', exported])
    expect(exp.code).toBe(0)

    // import 到"另一台机器"
    const homeB = tempHome()
    const imp = dshm(homeB, ['import', exported])
    // import 会跑 pnpm install（空依赖离线可行）+ dump-config 验证；无 dsh 时此用例整体跳过
    expect(imp.code).toBe(0)

    const list = dshm(homeB, ['list'])
    expect(list.out).toContain('writing')

    // 导入产物的 bundles 与用户层原样保留
    const manifest = JSON.parse(readFileSync(join(homeB, 'profiles', 'writing', 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).toContain('@deepseek-ai/dsh-base')
    expect(readFileSync(join(homeB, 'profiles', 'writing', 'cordis.patch.yml'), 'utf8')).toContain('ui-x')
  }, 180_000)

  it('help 与未知命令友好', () => {
    const home = tempHome()
    expect(dshm(home, ['--help']).code).toBe(0)
    const bad = dshm(home, ['frobnicate'])
    expect(bad.code).toBe(1)
    expect(bad.out).toContain('unknown command')
  })
})
