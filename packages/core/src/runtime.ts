/** runtime.yaml 读写：dshm 私有运行态缓存。写失败降级为警告，探活才是真相。 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import yaml from 'js-yaml'
import { runtimeFile } from './paths.js'
import type { InstanceRecord, RuntimeState } from './types.js'

export function emptyRuntime(): RuntimeState {
  return { suggestedPorts: {}, instances: {} }
}

export interface LoadOptions {
  /** 警告输出（默认 stderr）。 */
  warn?: (message: string) => void
}

/** 读取运行时缓存；缺失/损坏 → 空状态（缓存可随时删除重建）。 */
export function loadRuntime(home: string, options: LoadOptions = {}): RuntimeState {
  const warn = options.warn ?? ((m: string) => console.error(`dshm: ${m}`))
  const file = runtimeFile(home)
  if (!existsSync(file)) return emptyRuntime()
  try {
    const parsed = yaml.load(readFileSync(file, 'utf8')) as RuntimeState | null
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warn(`runtime 缓存格式无效，按空处理：${file}`)
      return emptyRuntime()
    }
    const instances: Record<string, InstanceRecord> = {}
    if (parsed.instances !== undefined && parsed.instances !== null) {
      for (const [id, rec] of Object.entries(parsed.instances as Record<string, InstanceRecord>)) {
        if (rec !== null && typeof rec === 'object' && typeof rec.pid === 'number') {
          instances[id] = rec
        }
      }
    }
    const suggestedPorts: Record<string, number> = {}
    if (parsed.suggestedPorts !== undefined && parsed.suggestedPorts !== null) {
      for (const [name, port] of Object.entries(parsed.suggestedPorts as Record<string, unknown>)) {
        if (typeof port === 'number') suggestedPorts[name] = port
      }
    }
    return {
      ...(typeof parsed.defaultProfile === 'string' ? { defaultProfile: parsed.defaultProfile } : {}),
      suggestedPorts,
      instances,
    }
  } catch (error) {
    warn(`runtime 缓存读取失败，按空处理（${file}）：${String(error)}`)
    return emptyRuntime()
  }
}

/** 写入运行时缓存；失败仅警告（降级为"只做不记"）。 */
export function saveRuntime(home: string, state: RuntimeState, options: LoadOptions = {}): void {
  const warn = options.warn ?? ((m: string) => console.error(`dshm: ${m}`))
  const file = runtimeFile(home)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, yaml.dump(state, { noRefs: true }), 'utf8')
  } catch (error) {
    warn(`runtime 缓存写入失败（继续，探活是最终真相）：${String(error)}`)
  }
}

/** 计算某 profile 的下一个实例序号：`<profile>-<n>`。 */
export function nextInstanceId(state: RuntimeState, profile: string): string {
  let max = 0
  for (const id of Object.keys(state.instances)) {
    const match = new RegExp(`^${profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`).exec(id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `${profile}-${max + 1}`
}

/** 某 profile 的全部实例记录（按序号排序）。 */
export function listInstancesOf(state: RuntimeState, profile: string): InstanceRecord[] {
  return Object.values(state.instances)
    .filter((rec) => rec.profile === profile)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

/** 某 profile 最近一次使用的端口（端口链第 2 优先级）。 */
export function lastPortOf(state: RuntimeState, profile: string): number | undefined {
  let last: InstanceRecord | undefined
  for (const rec of listInstancesOf(state, profile)) {
    if (rec.port !== undefined) last = rec
  }
  return last?.port
}

/** 某个端口当前被哪个实例占用。 */
export function instanceByPort(state: RuntimeState, port: number): InstanceRecord | undefined {
  return Object.values(state.instances).find((rec) => rec.port === port)
}
