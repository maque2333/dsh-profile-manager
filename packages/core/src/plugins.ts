/**
 * profile 内 plugin 管理（P1）：
 * - 阶段 A：create（新建空 profile）、list（全局/单 profile 的 bundle 列表）、
 *   add/remove（透传官方 dsh plugin）；
 * - 阶段 B：跨 profile 热插拔——listProfileEntries（entry 级，静态解析第三方
 *   bundle 的 patch 层，不依赖运行态）+ setEntryDisabled（写 cordis.patch.yml 启停，
 *   运行实例 HMR 热生效）。内置 bundle 是基础设施，受保护、不列出。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { dshBin } from './process.js'
import { readProfile, listProfiles } from './profiles.js'
import { importProfileFile } from './import.js'
import { isValidProfileName, profileDir, PROFILE_PATCH_FILENAME } from './paths.js'
import { BUILTIN_BUNDLES } from './types.js'
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

// ---- 阶段 B：跨 profile 热插拔（启用/停用 plugin entry） ----

/** 可热插拔的 plugin entry（静态解析第三方 bundle 的 patch 层）。 */
export interface PluginEntryInfo {
  /** cordis entry id（写 patch 启停时用它定位）。 */
  entryId: string
  /** 模块名（展示用）。 */
  moduleName: string
  /** 当前是否被 profile 的 cordis.patch.yml 以 `disabled: true` 停用。 */
  disabled: boolean
}

function isEntryWithId(patch: unknown, id: string): boolean {
  return patch !== null && typeof patch === 'object' && (patch as { id?: unknown }).id === id
}

/** 从 profile 的 patch 文本解析被 `disabled: true` 停用的 entry id 集合。 */
function readDisabledEntryIds(patch: string | null): Set<string> {
  const ids = new Set<string>()
  if (patch === null || patch.trim() === '' || patch.trim() === '[]') return ids
  let parsed: unknown
  try {
    parsed = yaml.load(patch)
  } catch {
    return ids // 损坏的 patch 交给 doctor；这里只读不抛。
  }
  if (!Array.isArray(parsed)) return ids
  for (const entry of parsed) {
    if (entry !== null && typeof entry === 'object') {
      const e = entry as { id?: unknown; disabled?: unknown }
      if (e.disabled === true && typeof e.id === 'string') ids.add(e.id)
    }
  }
  return ids
}

/** 读某个第三方 bundle 的 cordis.patch.yml（hoisted 到 profile 的 node_modules）。 */
function readBundlePatch(home: string, name: string, dep: string): unknown | null {
  const bundleDir = join(profileDir(home, name), 'node_modules', dep)
  const pkgPath = join(bundleDir, 'package.json')
  if (!existsSync(pkgPath)) return null
  let pkg: { dsh?: { bundle?: { patch?: string } } }
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dsh?: { bundle?: { patch?: string } } }
  } catch {
    return null
  }
  const patchRel = pkg.dsh?.bundle?.patch ?? './cordis.patch.yml'
  const patchPath = join(bundleDir, patchRel)
  if (!existsSync(patchPath)) return null
  try {
    return yaml.load(readFileSync(patchPath, 'utf8'))
  } catch {
    return null
  }
}

/** 从 bundle patch 提取 insert 的 entries（id + name）。 */
function extractEntries(patch: unknown): { id: string; name: string }[] {
  const entries: { id: string; name: string }[] = []
  if (!Array.isArray(patch)) return entries
  for (const item of patch) {
    if (item === null || typeof item !== 'object') continue
    const inserts = (item as { insert?: unknown }).insert
    if (!Array.isArray(inserts)) continue
    for (const entry of inserts) {
      if (entry === null || typeof entry !== 'object') continue
      const e = entry as { id?: unknown; name?: unknown }
      if (typeof e.id === 'string' && typeof e.name === 'string') entries.push({ id: e.id, name: e.name })
    }
  }
  return entries
}

/**
 * 列出某 profile 可热插拔的 plugin entry（定义态，不依赖运行）。
 * 只含第三方 bundle 的 entry；内置 bundle（base/web-app/headless）是基础设施，受保护、不列出。
 */
export function listProfileEntries(home: string, name: string): PluginEntryInfo[] {
  const info = readProfile(home, name)
  const disabled = readDisabledEntryIds(info.patch)
  const entries: PluginEntryInfo[] = []
  for (const dep of Object.keys(info.dependencies)) {
    if ((BUILTIN_BUNDLES as readonly string[]).includes(dep)) continue
    const patch = readBundlePatch(home, name, dep)
    if (patch === null) continue
    for (const e of extractEntries(patch)) {
      entries.push({ entryId: e.id, moduleName: e.name, disabled: disabled.has(e.id) })
    }
  }
  return entries
}

/**
 * 启用/停用某 profile 的一个 plugin entry：写 cordis.patch.yml 的 `- id: X, disabled: bool`。
 * 若该 profile 正在运行，其 HMR 会热生效（不重启）；否则下次启动生效。
 */
export function setEntryDisabled(home: string, name: string, entryId: string, disabled: boolean): void {
  const patchPath = join(profileDir(home, name), PROFILE_PATCH_FILENAME)
  let patches: unknown[] = []
  if (existsSync(patchPath)) {
    try {
      const raw = yaml.load(readFileSync(patchPath, 'utf8'))
      if (Array.isArray(raw)) patches = raw as unknown[]
    } catch {
      // 损坏的 patch 从空数组开始（幂等覆盖）
    }
  }
  patches = patches.filter((p) => !isEntryWithId(p, entryId))
  patches.push({ id: entryId, disabled })
  writeFileSync(patchPath, yaml.dump(patches, { noRefs: true }), 'utf8')
}
