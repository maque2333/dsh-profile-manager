/** Profile 定义态读取：profiles 目录是唯一事实源。 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { profileDir, profilesDir, PROFILE_PATCH_FILENAME } from './paths.js'
import type { ProfileInfo, ProfileManifest, ProfileShape } from './types.js'
import { DshmError } from './types.js'

/** 形态分类：按 bundles 能力判定（web / headless / generic），不枚举界面。 */
export function classifyShape(bundles: readonly string[]): ProfileShape {
  if (bundles.includes('@deepseek-ai/dsh-web-app')) return 'web'
  if (bundles.includes('@deepseek-ai/dsh-headless')) return 'headless'
  return 'generic'
}

function parseManifest(raw: string, path: string): ProfileManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new DshmError(`profile manifest 不是合法 JSON：${path}`, String(error))
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DshmError(`profile manifest 必须是 JSON 对象：${path}`)
  }
  return parsed as ProfileManifest
}

/** 读取一个 profile 的定义态信息；不存在时抛出友好错误。 */
export function readProfile(home: string, name: string): ProfileInfo {
  const dir = profileDir(home, name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new DshmError(`profile 不存在：${name}（${dir} 下没有 package.json）`,
      `用 'dsh plugin --profile ${name} add <pkg>' 或 'dshm import <文件>' 创建`)
  }
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'), manifestPath)
  const bundles = [...(manifest.dsh?.profile?.bundles ?? [])]
  const patchPath = join(dir, PROFILE_PATCH_FILENAME)
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : null
  return {
    name,
    dir,
    bundles,
    dependencies: { ...(manifest.dependencies ?? {}) },
    shape: classifyShape(bundles),
    patch,
  }
}

/** 列出本机全部 profile（有 package.json 的目录），按名字排序。 */
export function listProfiles(home: string): ProfileInfo[] {
  const dir = profilesDir(home)
  if (!existsSync(dir)) return []
  const result: ProfileInfo[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    if (!existsSync(join(dir, entry.name, 'package.json'))) continue
    try {
      result.push(readProfile(home, entry.name))
    } catch {
      // 损坏的 profile 交给 doctor 诊断；list 只列出可读的。
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/** 读取用户 patch 层内容（可能为 null）。 */
export function readUserPatch(home: string, name: string): string | null {
  const dir = profileDir(home, name)
  const patchPath = join(dir, PROFILE_PATCH_FILENAME)
  return existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : null
}
