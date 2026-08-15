/** 路径解析：$DSH_HOME 布局的唯一出处（代码中禁止硬编码绝对路径）。 */

import { homedir } from 'node:os'
import { join } from 'node:path'

export const DSH_HOME_ENV = 'DSH_HOME'
export const PROFILES_DIR = 'profiles'
export const PM_DIR = 'profile-manager'
export const RUNTIME_FILENAME = 'runtime.yaml'
export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'
export const PROFILE_PNPM_WORKSPACE = 'pnpm-workspace.yaml'

/** DSH_HOME 解析：$DSH_HOME 环境变量（非空白）优先，否则 ~/.dsh。 */
export function resolveDshHome(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[DSH_HOME_ENV]
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

export const profilesDir = (home: string) => join(home, PROFILES_DIR)
export const pmDir = (home: string) => join(home, PM_DIR)
export const runtimeFile = (home: string) => join(pmDir(home), RUNTIME_FILENAME)
export const logsDir = (home: string) => join(pmDir(home), 'logs')
export const archiveDir = (home: string) => join(pmDir(home), 'archive')
export const profileDir = (home: string, name: string) => join(profilesDir(home), name)

/** 与官方启动器的 profile 命名规则一致（见官方 resolveProfileDir）。 */
export function isValidProfileName(name: string): boolean {
  return (
    name !== ''
    && name !== '.'
    && name !== '..'
    && name !== 'node_modules'
    && !name.includes('/')
    && !name.includes('\\')
  )
}
