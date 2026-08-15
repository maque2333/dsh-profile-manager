/** service：把 core 原语拼成完整业务动作（CLI 与未来插件形态共用）。 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DshmError } from './types.js'
import type { InstanceRecord, InstanceStatus, InstanceView, ProfileInfo, RuntimeState } from './types.js'
import { listProfiles, readProfile } from './profiles.js'
import { listInstancesOf, loadRuntime, nextInstanceId, saveRuntime } from './runtime.js'
import { resolvePort } from './ports.js'
import { isAlive, startInstance, stopPid } from './process.js'
import { probeInstance, probeWeb } from './probe.js'
import { logsDir } from './paths.js'

export interface ServiceContext {
  home: string
  log?: (line: string) => void
  warn?: (line: string) => void
}

function tail(path: string, lines = 20): string {
  try {
    const content = readFileSync(path, 'utf8')
    return content.split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

async function statusOf(rec: InstanceRecord, probeTimeoutMs = 2_000): Promise<InstanceStatus> {
  const alive = await probeInstance(rec, probeTimeoutMs)
  if (alive) return 'running'
  return isAlive(rec.pid) ? 'starting' : 'broken'
}

export async function instanceView(rec: InstanceRecord, probeTimeoutMs = 2_000): Promise<InstanceView> {
  const status = await statusOf(rec, probeTimeoutMs)
  let detail: string
  if (status === 'running') {
    detail = rec.shape === 'web' ? `http://127.0.0.1:${rec.port}/ 响应正常` : `PID ${rec.pid} 存活`
  } else if (status === 'starting') {
    detail = rec.shape === 'web' ? `进程在但 :${rec.port} 尚未响应（启动中或卡住）` : `PID ${rec.pid} 在但状态未确认`
  } else {
    detail = `进程已死（PID ${rec.pid}）——残留记录，建议 dshm stop ${rec.id} 清理`
  }
  return { ...rec, status, detail }
}

export interface ProfileView extends ProfileInfo {
  instances: InstanceView[]
}

/** list 视图：全部 profile + 各自实例的实时状态。 */
export async function listViews(ctx: ServiceContext, state: RuntimeState): Promise<ProfileView[]> {
  const views: ProfileView[] = []
  for (const info of listProfiles(ctx.home)) {
    const recs = listInstancesOf(state, info.name)
    const instances: InstanceView[] = []
    for (const rec of recs) instances.push(await instanceView(rec))
    views.push({ ...info, instances })
  }
  return views
}

export interface StartServiceOptions {
  ctx: ServiceContext
  state: RuntimeState
  profile: string
  port?: number
  suggestedPort?: number
  foreground?: boolean
  /** web 实例就绪等待上限。 */
  timeoutMs?: number
}

export interface StartResult {
  state: RuntimeState
  record: InstanceRecord
  status: InstanceStatus
}

/** start：形态分支 → spawn → 探活 → 登记。失败绝不静默。 */
export async function startService(options: StartServiceOptions): Promise<StartResult> {
  const { ctx, state, profile, foreground = false, timeoutMs = 30_000 } = options
  const info = readProfile(ctx.home, profile)
  const warn = ctx.warn ?? ((m: string) => console.error(`dshm: ${m}`))

  if (info.shape === 'headless') {
    throw new DshmError(`profile ${profile} 是一次性（headless）形态，不适合作为常驻实例`,
      `用官方命令：dsh --profile ${profile} "任务文本"`)
  }

  // 多开默认拒绝：已有存活实例且未显式指定端口 → 报错
  const running = listInstancesOf(state, profile).filter((rec) => isAlive(rec.pid))
  if (running.length > 0 && options.port === undefined) {
    throw new DshmError(`profile ${profile} 已有运行中实例：${running.map((r) => r.id).join(', ')}`,
      `显式指定不同端口可开第二实例：dshm start ${profile} --port <空闲端口>`)
  }

  let port: number | undefined
  if (info.shape === 'web') {
    port = await resolvePort({
      explicit: options.port,
      suggested: options.suggestedPort ?? state.suggestedPorts?.[profile],
      state,
      profile,
    })
  } else if (options.port !== undefined) {
    warn(`--port 对 ${info.shape} 形态无效，已忽略`)
  }

  const id = nextInstanceId(state, profile)
  const logFile = join(logsDir(ctx.home), `${id}.log`)
  const pid = startInstance({ home: ctx.home, profile, shape: info.shape, port, foreground, logFile })

  if (!foreground && info.shape === 'generic') {
    // 无 TTY 崩溃自诊断：等 2.5s 看进程是否还活着
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    if (!isAlive(pid)) {
      throw new DshmError(
        `profile ${profile} 后台启动后立即退出——该形态（${info.shape}）很可能需要终端`,
        `用 dshm start ${profile} --foreground 在你当前终端里启动；日志尾部：\n${tail(logFile)}`,
      )
    }
  }

  let status: InstanceStatus = 'starting'
  if (info.shape === 'web' && port !== undefined) {
    status = (await probeWeb(port, { timeoutMs })) ? 'running' : 'starting'
    if (status !== 'running') {
      warn(`:${port} 在 ${timeoutMs / 1000}s 内未就绪；实例已登记为 starting（进程在则可能稍后就绪）`)
    }
  } else if (info.shape === 'generic') {
    status = 'running'
  }

  const record: InstanceRecord = {
    id,
    profile,
    shape: info.shape,
    ...(port !== undefined ? { port } : {}),
    pid,
    startedAt: new Date().toISOString(),
    dshHome: ctx.home,
    logFile,
    foreground,
  }
  state.instances[id] = record
  saveRuntime(ctx.home, state, { warn })
  return { state, record, status }
}

export interface StopOptions {
  ctx: ServiceContext
  state: RuntimeState
  /** 实例 id；为空则停止该 profile 全部实例。 */
  ids?: string[]
  profile?: string
  timeoutMs?: number
}

/** stop：SIGTERM→8s→SIGKILL；注销记录。 */
export async function stopService(options: StopOptions): Promise<{ state: RuntimeState; results: { id: string; result: string }[] }> {
  const { ctx, state, timeoutMs } = options
  const warn = ctx.warn ?? ((m: string) => console.error(`dshm: ${m}`))
  const targets: InstanceRecord[] = []
  if (options.ids !== undefined) {
    for (const id of options.ids) {
      const rec = state.instances[id]
      if (rec === undefined) throw new DshmError(`实例不存在：${id}`, '用 dshm list 查看实例')
      targets.push(rec)
    }
  } else if (options.profile !== undefined) {
    targets.push(...listInstancesOf(state, options.profile))
    if (targets.length === 0) throw new DshmError(`profile ${options.profile} 没有登记中的实例`)
  } else {
    throw new DshmError('stop 需要实例 id 或 --profile')
  }
  const results: { id: string; result: string }[] = []
  for (const rec of targets) {
    const outcome = await stopPid(rec.pid, timeoutMs)
    if (outcome === 'killed') {
      warn(`实例 ${rec.id} 优雅停止超时，已强杀（SIGKILL）`)
      results.push({ id: rec.id, result: 'killed' })
    } else {
      results.push({ id: rec.id, result: outcome === 'graceful' ? 'graceful' : 'already-stopped' })
    }
    delete state.instances[rec.id]
  }
  saveRuntime(ctx.home, state, { warn })
  return { state, results }
}

export function loadState(ctx: ServiceContext): RuntimeState {
  return loadRuntime(ctx.home, { warn: ctx.warn })
}

export function suggestedPortFrom(meta: unknown): number | undefined {
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    const port = (meta as Record<string, unknown>).port
    if (typeof port === 'number' && Number.isInteger(port)) return port
  }
  return undefined
}
