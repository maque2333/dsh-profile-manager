/** 实例探活：web = HTTP 探活；generic = 进程存活。探活是最终真相来源。 */

import { isAlive } from './process.js'
import type { InstanceRecord } from './types.js'

export interface ProbeWebOptions {
  timeoutMs?: number
  intervalMs?: number
  attemptTimeoutMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** HTTP 探活：任何 HTTP 响应（含 4xx）都算"起来了"。 */
export async function probeWeb(port: number, options: ProbeWebOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 500
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 2_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(attemptTimeoutMs) })
      return true
    } catch {
      await sleep(intervalMs)
    }
  }
  return false
}

/** 按形态探活一个实例；返回是否存活。 */
export async function probeInstance(rec: Pick<InstanceRecord, 'shape' | 'port' | 'pid'>, timeoutMs?: number): Promise<boolean> {
  if (rec.shape === 'web' && rec.port !== undefined) {
    return probeWeb(rec.port, timeoutMs !== undefined ? { timeoutMs } : {})
  }
  return isAlive(rec.pid)
}
