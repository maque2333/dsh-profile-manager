/** 端口链：--port > 上次端口 > meta.port > 3081 起线性找空（避让官方默认 3080）。 */

import { createServer } from 'node:net'
import { DshmError } from './types.js'
import type { RuntimeState } from './types.js'
import { instanceByPort, lastPortOf } from './runtime.js'

export const PORT_SCAN_START = 3081
export const PORT_SCAN_MAX_ATTEMPTS = 100

function tryBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen({ port, host }, () => {
      server.close(() => resolve(true))
    })
  })
}

/** bind 测试某端口是否空闲。 */
export async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return tryBind(port, host)
}

/** 从 start 起线性找空端口。 */
export async function findFreePort(start = PORT_SCAN_START): Promise<number> {
  for (let port = start; port < start + PORT_SCAN_MAX_ATTEMPTS; port++) {
    if (await isPortFree(port)) return port
  }
  throw new DshmError(`找不到空闲端口（从 ${start} 起连续 ${PORT_SCAN_MAX_ATTEMPTS} 个都被占用）`)
}

export interface ResolvePortOptions {
  /** 显式 --port。 */
  explicit?: number
  /** 导入文件的 meta.port 建议。 */
  suggested?: number
  state: RuntimeState
  profile: string
}

/** 按端口链为 web 实例解析端口；显式端口冲突时报错（多开需显式指定且端口空闲）。 */
export async function resolvePort(options: ResolvePortOptions): Promise<number> {
  const { explicit, suggested, state, profile } = options
  if (explicit !== undefined) {
    if (!Number.isInteger(explicit) || explicit < 1 || explicit > 65_535) {
      throw new DshmError(`无效端口：${explicit}（1-65535）`)
    }
    const holder = instanceByPort(state, explicit)
    if (holder !== undefined) {
      throw new DshmError(`端口 ${explicit} 已被实例 ${holder.id}（${holder.profile}）占用`,
        `换一个端口，或先 'dshm stop ${holder.id}'`)
    }
    if (!(await isPortFree(explicit))) {
      throw new DshmError(`端口 ${explicit} 已被其他程序占用`, '换一个端口')
    }
    return explicit
  }
  const last = lastPortOf(state, profile)
  if (last !== undefined && (await isPortFree(last))) return last
  if (suggested !== undefined && suggested > 0 && (await isPortFree(suggested))) return suggested
  return findFreePort(PORT_SCAN_START)
}
