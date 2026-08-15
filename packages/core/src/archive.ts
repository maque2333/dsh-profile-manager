/** delete 语义：默认归档（archive/<name>-<时间戳>），--purge 真删；不碰 sessions。 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { archiveDir, profileDir } from './paths.js'
import { listInstancesOf } from './runtime.js'
import { isAlive } from './process.js'
import type { RuntimeState } from './types.js'
import { DshmError } from './types.js'

export interface ArchiveOptions {
  purge: boolean
  /** 已确认（跳过交互确认；非 TTY 时必需）。 */
  yes: boolean
  log?: (line: string) => void
  warn?: (line: string) => void
}

export interface DeleteResult {
  action: 'archived' | 'purged'
  from: string
  to?: string
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** 把已存在（非运行中）的 profile 归档（import --force 覆盖前调用）。 */
export function archiveExisting(home: string, name: string, options: Pick<ArchiveOptions, 'log' | 'warn'>): void {
  const dir = profileDir(home, name)
  if (!existsSync(dir)) return
  const dest = `${archiveDir(home)}/${name}-${timestamp()}`
  mkdirSync(archiveDir(home), { recursive: true })
  renameSync(dir, dest)
  ;(options.log ?? console.log)(`已归档旧 profile：${dir} → ${dest}`)
}

/** 删除 profile：运行中实例检查 → 归档/真删 → 路径清单输出。 */
export function deleteProfile(
  home: string,
  name: string,
  state: RuntimeState,
  options: ArchiveOptions,
): DeleteResult {
  const dir = profileDir(home, name)
  if (!existsSync(dir)) {
    throw new DshmError(`profile 不存在：${name}`, '用 dshm list 查看本机 profile')
  }
  const running = listInstancesOf(state, name).filter((rec) => isAlive(rec.pid))
  if (running.length > 0) {
    throw new DshmError(`profile ${name} 有 ${running.length} 个运行中实例，拒绝删除`,
      running.map((rec) => `dshm stop ${rec.id}`).join(' && ') + ' 之后重试')
  }
  if (!options.yes) {
    throw new DshmError(`删除需要确认：用 --yes 跳过交互确认（默认归档到 archive/，--purge 彻底删除）`)
  }
  const log = options.log ?? ((line: string) => console.log(line))
  if (options.purge) {
    rmSync(dir, { recursive: true, force: true })
    log(`已彻底删除：${dir}（会话记录 sessions/ 不受影响）`)
    return { action: 'purged', from: dir }
  }
  const dest = `${archiveDir(home)}/${name}-${timestamp()}`
  mkdirSync(archiveDir(home), { recursive: true })
  renameSync(dir, dest)
  log(`已归档：${dir} → ${dest}（会话记录 sessions/ 不受影响；还原 = 移回 profiles/）`)
  return { action: 'archived', from: dir, to: dest }
}
