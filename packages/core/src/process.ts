/** 进程生命周期：spawn dsh 实例、PID 存活、优雅停止（SIGTERM→8s→SIGKILL）。 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { dirname } from 'node:path'
import { DshmError } from './types.js'
import type { ProfileShape } from './types.js'

/** dsh 命令（测试/CI 可用环境变量覆盖）。 */
export const dshBin = (): string => process.env.DSH_BIN ?? 'dsh'

export const GRACEFUL_WAIT_MS = 8_000
export const POLL_INTERVAL_MS = 200

export function isWindows(): boolean {
  return process.platform === 'win32'
}

/** PID 是否存活（kill(pid, 0) 探测；EPERM 视为存活）。 */
export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

export interface StartOptions {
  home: string
  profile: string
  shape: ProfileShape
  port?: number
  foreground: boolean
  logFile: string
}

/** spawn 一个 dsh 实例，返回新进程 pid。 */
export function startInstance(options: StartOptions): number {
  const { home, profile, shape, port, foreground, logFile } = options
  // 启动器 flag 在前；app 参数在后（web 形态用 --port，generic 无参数）。
  const args = ['--profile', profile]
  if (shape === 'web' && port !== undefined) args.push('--port', String(port))

  mkdirSync(dirname(logFile), { recursive: true })
  const logFd = existsSync(logFile) ? openSync(logFile, 'a') : openSync(logFile, 'w')

  let child
  try {
    child = spawn(dshBin(), args, {
      env: { ...process.env, DSH_HOME: home },
      detached: !foreground,
      stdio: foreground ? 'inherit' : ['ignore', logFd, logFd],
      windowsHide: true,
    })
  } catch (error) {
    closeSync(logFd)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DshmError(`找不到 dsh 命令（${dshBin()}）`, '请先安装 DeepSeek Harness：npx @deepseek-ai/dsh web，或用 DSH_BIN 指定路径')
    }
    throw error
  }

  if (child.pid === undefined) {
    closeSync(logFd)
    throw new DshmError(`dsh 进程启动失败（未拿到 pid）：${dshBin()} ${args.join(' ')}`)
  }
  if (!foreground) child.unref()
  closeSync(logFd) // 子进程持有 fd，父进程关闭自己的副本
  return child.pid
}

export type StopResult = 'graceful' | 'killed' | 'already-stopped'

function sendSignal(pid: number, kind: 'term' | 'kill'): void {
  if (isWindows()) {
    const args = kind === 'term'
      ? ['/pid', String(pid), '/T']
      : ['/pid', String(pid), '/T', '/F']
    spawnSync('taskkill', args, { stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid, kind === 'term' ? 'SIGTERM' : 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 优雅停止一个进程：SIGTERM → 轮询 ≤ timeoutMs → SIGKILL。 */
export async function stopPid(pid: number, timeoutMs = GRACEFUL_WAIT_MS): Promise<StopResult> {
  if (!isAlive(pid)) return 'already-stopped'
  sendSignal(pid, 'term')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return 'graceful'
    await sleep(POLL_INTERVAL_MS)
  }
  if (!isAlive(pid)) return 'graceful'
  sendSignal(pid, 'kill')
  return 'killed'
}
