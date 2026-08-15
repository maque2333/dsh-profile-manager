/** doctor：目录/注册表/进程三方一致性诊断。 */

import { existsSync, readdirSync } from 'node:fs'
import { archiveDir, profilesDir } from './paths.js'
import { instanceByPort } from './runtime.js'
import { isAlive } from './process.js'
import { probeInstance } from './probe.js'
import type { RuntimeState } from './types.js'

export interface DoctorFinding {
  kind: 'ok' | 'warn' | 'error'
  message: string
  hint?: string
}

export interface DoctorReport {
  findings: DoctorFinding[]
  archives: string[]
}

/** 全量诊断；异步（web 实例需 HTTP 探活）。 */
export async function runDoctor(home: string, state: RuntimeState): Promise<DoctorReport> {
  const findings: DoctorFinding[] = []

  // 1. profiles 目录
  if (!existsSync(profilesDir(home))) {
    findings.push({ kind: 'warn', message: `profiles 目录不存在：${profilesDir(home)}` })
  } else {
    for (const entry of readdirSync(profilesDir(home), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules'
        && !existsSync(`${profilesDir(home)}/${entry.name}/package.json`)) {
        findings.push({ kind: 'warn', message: `目录不是合法 profile（缺 package.json）：${entry.name}` })
      }
    }
  }

  // 2. 注册表 vs 现实（探活是真相）
  for (const rec of Object.values(state.instances)) {
    const alive = await probeInstance(rec, 2_000)
    if (alive) {
      findings.push({ kind: 'ok', message: `实例 ${rec.id} 存活（${rec.shape}${rec.port !== undefined ? ` :${rec.port}` : ''}，PID ${rec.pid}）` })
    } else if (isAlive(rec.pid)) {
      findings.push({
        kind: 'warn',
        message: `实例 ${rec.id} 进程在但探活失败（PID ${rec.pid}）——启动中或服务无响应`,
        hint: `看日志：${rec.logFile}`,
      })
    } else {
      findings.push({
        kind: 'warn',
        message: `实例 ${rec.id} 记录存在但进程已死（PID ${rec.pid}）——崩溃残留或被杀`,
        hint: `清理记录：dshm status 会自动标注 broken；删除记录可直接编辑 ${home}/profile-manager/runtime.yaml`,
      })
    }
  }

  // 3. 端口冲突（注册表内）
  const seen = new Map<number, string>()
  for (const rec of Object.values(state.instances)) {
    if (rec.port !== undefined) {
      const holder = seen.get(rec.port)
      if (holder !== undefined) {
        findings.push({ kind: 'error', message: `端口冲突：${holder} 与 ${rec.id} 都记录在 :${rec.port}` })
      } else {
        seen.set(rec.port, rec.id)
      }
      const other = instanceByPort(state, rec.port)
      if (other !== undefined && other.id !== rec.id) {
        findings.push({ kind: 'error', message: `端口 ${rec.port} 被多个实例记录（${other.id} / ${rec.id}）` })
      }
    }
  }

  // 4. 归档清单
  const archives: string[] = []
  if (existsSync(archiveDir(home))) {
    for (const entry of readdirSync(archiveDir(home), { withFileTypes: true })) {
      if (entry.isDirectory()) archives.push(entry.name)
    }
  }
  archives.sort()

  if (findings.length === 0) {
    findings.push({ kind: 'ok', message: '一切正常' })
  }
  return { findings, archives }
}
