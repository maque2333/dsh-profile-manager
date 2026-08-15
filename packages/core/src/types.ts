/** 核心类型：Profile（定义）与 Instance（运行）两层模型。 */

/** 实例形态：按 bundles 能力分类，不枚举界面类型。 */
export type ProfileShape = 'web' | 'headless' | 'generic'

/** 官方内置三件套 bundle：由 dsh 安装目录解析，不应被 pnpm 装进 profile。 */
export const BUILTIN_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
] as const

/** profile 目录 package.json 的切片（与官方 manifest 字段一一对应）。 */
export interface ProfileManifest {
  name?: string
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

/** 一个 profile 的定义态信息（从目录读取，目录是唯一事实源）。 */
export interface ProfileInfo {
  name: string
  dir: string
  bundles: string[]
  dependencies: Record<string, string>
  shape: ProfileShape
  /** cordis.patch.yml 内容；不存在时为 null。 */
  patch: string | null
}

/** 一个运行实例（dshm 概念）：运行态记录。 */
export interface InstanceRecord {
  /** `<profile>-<n>` 稳定标识。 */
  id: string
  profile: string
  shape: ProfileShape
  /** 仅 web 实例有。 */
  port?: number
  pid: number
  startedAt: string
  dshHome: string
  logFile: string
  foreground: boolean
}

/** runtime.yaml 内容（dshm 私有运行态缓存，可随时删除重建）。 */
export interface RuntimeState {
  defaultProfile?: string
  /** profile → 建议端口（import 文件的 meta.port 落在这里）。 */
  suggestedPorts?: Record<string, number>
  instances: Record<string, InstanceRecord>
}

/** dshm-profile.yaml（import/export 共用格式）。 */
export interface DshmProfileFile {
  dshmProfile: number
  name: string
  bundles: string[]
  /** 与官方 package.json 的 dependencies 完全同构。 */
  dependencies?: Record<string, string>
  /** 内嵌用户层，原样写入 cordis.patch.yml。 */
  patch?: string
  meta?: { description?: string; port?: number; [key: string]: unknown }
}

export type InstanceStatus = 'running' | 'starting' | 'broken'

export interface InstanceView extends InstanceRecord {
  status: InstanceStatus
  detail: string
}

/** dshm 面向用户的统一错误。 */
export class DshmError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'DshmError'
    this.hint = hint
  }
}
