/**
 * profile 内 plugin 管理（P1 阶段 A）：create（新建空 profile）、
 * list（全局/单 profile 的 bundle 列表）、add/remove（透传官方 dsh plugin）。
 * 列表是 bundle 级（bundles + dependencies）；「停用/启用」是 entry 级，
 * 属阶段 B（依赖运行态 plugin-inventory），不在本模块。
 */

import { spawnSync } from 'node:child_process'
import { dshBin } from './process.js'
import { readProfile, listProfiles } from './profiles.js'
import { importProfileFile } from './import.js'
import { isValidProfileName } from './paths.js'
import type { DshmProfileFile } from './types.js'
import { DshmError } from './types.js'

/** 单个 plugin 条目（bundle 级：装了啥）。 */
export interface PluginEntry {
  /** 模块名（bundle 名或依赖包名）。 */
  name: string
  /** bundle = 在 dsh.profile.bundles 里；dependency = 仅在 dependencies 里。 */
  kind: 'bundle' | 'dependency'
}

/** 全局汇总：一个 plugin 被哪些 profile 引用。 */
export interface PluginSummary {
  plugin: string
  kind: 'bundle' | 'dependency'
  profiles: string[]
}

export interface PluginOpResult {
  code: number
  output: string
}

/** 新建一个空 profile（默认起步 = @deepseek-ai/dsh-base），复用 import 的完整流程。 */
export function createProfile(
  home: string,
  name: string,
  options: { bundles?: string[]; log?: (line: string) => void; warn?: (line: string) => void } = {},
): DshmProfileFile {
  if (!isValidProfileName(name)) {
    throw new DshmError(`无效的 profile 名：${name}（不允许空、路径分隔符、node_modules）`)
  }
  const bundles = options.bundles ?? ['@deepseek-ai/dsh-base']
  const def = [
    'dshmProfile: 1',
    `name: ${name}`,
    'bundles:',
    ...bundles.map((b) => `  - '${b}'`),
    'dependencies: {}',
    '',
  ].join('\n')
  return importProfileFile(def, { home, log: options.log, warn: options.warn })
}

/** 单 profile 的 plugin 列表（bundles + dependencies，bundle 级）。 */
export function listProfilePlugins(home: string, name: string): PluginEntry[] {
  const info = readProfile(home, name)
  const bundles = info.bundles.map((b) => ({ name: b, kind: 'bundle' as const }))
  const deps = Object.keys(info.dependencies).map((d) => ({ name: d, kind: 'dependency' as const }))
  return [...bundles, ...deps]
}

/** 全局汇总：遍历所有 profile，得到 plugin → 被哪些 profile 引用。 */
export function listAllPlugins(home: string): PluginSummary[] {
  const map = new Map<string, { kind: 'bundle' | 'dependency'; profiles: string[] }>()
  for (const info of listProfiles(home)) {
    for (const entry of listProfilePlugins(home, info.name)) {
      const existing = map.get(entry.name)
      if (existing === undefined) {
        map.set(entry.name, { kind: entry.kind, profiles: [info.name] })
      } else if (!existing.profiles.includes(info.name)) {
        existing.profiles.push(info.name)
      }
    }
  }
  return [...map.entries()]
    .map(([plugin, v]) => ({ plugin, kind: v.kind, profiles: v.profiles.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.plugin.localeCompare(b.plugin))
}

/** 透传官方 `dsh plugin --profile <name> <args...>`（add/remove/ls 等），pnpm 输出原样透传。 */
export function pluginAddRemove(
  home: string,
  name: string,
  args: string[],
  options: { log?: (line: string) => void } = {},
): PluginOpResult {
  const result = spawnSync(dshBin(), ['plugin', '--profile', name, ...args], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim() !== '') (options.log ?? console.log)(output.trimEnd())
  return { code: result.status ?? 1, output }
}
