/** 集成测试：真实 dsh 环境 + 临时 DSH_HOME（铁律：绝不碰真实 ~/.dsh）。 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteProfile } from '../src/archive.js'
import { importProfileFile } from '../src/import.js'
import { isAlive } from '../src/process.js'
import { startService, stopService, type ServiceContext } from '../src/service.js'
import { loadRuntime } from '../src/runtime.js'

function has(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

const hasDsh = has('dsh')
const hasPnpm = has('pnpm')

let home: string
const ctx: ServiceContext = { home: '' }

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dshm-e2e-'))
  ctx.home = home
})

afterAll(async () => {
  // 兜底清理：停掉登记中的一切实例，再删临时 home
  const state = loadRuntime(home)
  for (const rec of Object.values(state.instances)) {
    if (isAlive(rec.pid)) await stopService({ ctx, state: loadRuntime(home), ids: [rec.id] })
  }
  rmSync(home, { recursive: true, force: true })
})

describe.skipIf(!hasDsh || !hasPnpm)('e2e：import → start → 探活 → stop → delete（临时 DSH_HOME）', () => {
  const profileName = 'e2e-web'
  const spec = `dshmProfile: 1
name: ${profileName}
bundles:
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'
patch: |
  []
`

  it('import 生成官方三件套并通过 dump-config 验证', () => {
    const result = importProfileFile(spec, { home, log: () => {} })
    expect(result.name).toBe(profileName)
    const dir = join(home, 'profiles', profileName)
    expect(existsSync(join(dir, 'package.json'))).toBe(true)
    expect(existsSync(join(dir, 'cordis.patch.yml'))).toBe(true)
    expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).toContain('@deepseek-ai/dsh-base')
  }, 180_000)

  it('start：web 实例分配端口并 HTTP 探活通过', async () => {
    let state = loadRuntime(home)
    const result = await startService({ ctx, state, profile: profileName, timeoutMs: 60_000 })
    state = result.state
    expect(result.record.shape).toBe('web')
    expect(result.record.port).toBeGreaterThanOrEqual(3081)
    expect(result.status).toBe('running')
    expect(state.instances[result.record.id]).toBeDefined()
  }, 120_000)

  it('stop：优雅停止并注销', async () => {
    let state = loadRuntime(home)
    const rec = Object.values(state.instances).find((r) => r.profile === profileName)
    expect(rec).toBeDefined()
    const { results } = await stopService({ ctx, state, ids: [rec!.id] })
    expect(results[0].result).toBe('graceful')
    expect(isAlive(rec!.pid)).toBe(false)
    expect(loadRuntime(home).instances[rec!.id]).toBeUndefined()
  }, 30_000)

  it('delete：归档', () => {
    const result = deleteProfile(home, profileName, loadRuntime(home), { purge: false, yes: true })
    expect(result.action).toBe('archived')
    expect(existsSync(join(home, 'profiles', profileName))).toBe(false)
  })
})
