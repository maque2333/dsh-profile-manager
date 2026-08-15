/**
 * ctx.profileManager host 服务：把 core 的纯逻辑包装成 Cordis 服务，
 * 供 /profile-manager 面板、profile_* 工具、/profile 命令与其他插件共用。
 * 逻辑 100% 复用 @dsh-profile-manager/core，本文件只是薄壳。
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import {
  DshmError,
  resolveDshHome,
  listViews,
  startService,
  stopService,
  loadState,
  readProfile,
  readUserPatch,
  deleteProfile,
  runDoctor,
  importProfileFile,
  exportProfileText,
  parseProfileFile,
  type ProfileInfo,
  type ProfileView,
  type StartResult,
  type RuntimeState,
  type DeleteResult,
  type DoctorReport,
  type DshmProfileFile,
} from '@dsh-profile-manager/core'

declare module '@deepseek-ai/cordis' {
  interface Context {
    profileManager: ProfileManager
  }
}

export interface StartProfileOptions {
  port?: number
  foreground?: boolean
  timeoutMs?: number
}

export interface StopProfileOptions {
  ids?: string[]
  profile?: string
  timeoutMs?: number
}

export interface DeleteProfileOptions {
  purge?: boolean
  yes?: boolean
}

export interface ImportProfileOptions {
  force?: boolean
  allowBuilds?: boolean
}

/** 当前 dsh 进程 boot 的 profile 名（自保只读判定用）。 */
export function currentProfileName(): string | undefined {
  const argv = process.argv
  const eq = argv.find((arg) => arg.startsWith('--profile='))
  if (eq !== undefined) return eq.slice('--profile='.length)
  const index = argv.indexOf('--profile')
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1]
  return undefined
}

export class ProfileManager extends Service {
  private readonly home: string

  constructor(ctx: Context) {
    super(ctx, 'profileManager')
    this.home = resolveDshHome()
  }

  get dshHome(): string {
    return this.home
  }

  private warn(message: string): void {
    this.ctx.logger.warn(message)
  }

  private log(message: string): void {
    this.ctx.logger.info(message)
  }

  private svc() {
    return { home: this.home, log: (m: string) => this.log(m), warn: (m: string) => this.warn(m) }
  }

  private state(): RuntimeState {
    return loadState(this.svc())
  }

  list(): Promise<ProfileView[]> {
    return listViews(this.svc(), this.state())
  }

  async status(name?: string): Promise<ProfileView[]> {
    const views = await this.list()
    return name === undefined ? views : views.filter((view) => view.name === name)
  }

  show(name: string): ProfileInfo & { patch: string | null } {
    return { ...readProfile(this.home, name), patch: readUserPatch(this.home, name) }
  }

  start(name: string, options: StartProfileOptions = {}): Promise<StartResult> {
    return startService({
      ctx: this.svc(),
      state: this.state(),
      profile: name,
      port: options.port,
      foreground: options.foreground,
      timeoutMs: options.timeoutMs,
    })
  }

  async stop(options: StopProfileOptions = {}): Promise<{ results: { id: string; result: string }[] }> {
    const { results } = await stopService({
      ctx: this.svc(),
      state: this.state(),
      ids: options.ids,
      profile: options.profile,
      timeoutMs: options.timeoutMs,
    })
    return { results }
  }

  async restart(name: string, options: StartProfileOptions = {}): Promise<StartResult> {
    const self = currentProfileName()
    if (self !== undefined && name === self) {
      throw new DshmError(
        `不能通过插件形态重启正在运行本管理器的 profile（${name}）——重启会先停掉面板进程自己`,
        `用 CLI：dshm restart ${name}（CLI 是独立进程，停 manager 不影响它自己）`,
      )
    }
    const ctx = this.svc()
    let state = this.state()
    const lastPort = state.suggestedPorts?.[name]
      ?? Object.values(state.instances).find((rec) => rec.profile === name && rec.port !== undefined)?.port
    try {
      ;({ state } = await stopService({ ctx, state, profile: name }))
    } catch (error) {
      if (!(error instanceof DshmError) || !error.message.includes('没有登记中的实例')) throw error
    }
    return startService({
      ctx,
      state,
      profile: name,
      port: options.port ?? lastPort,
      foreground: options.foreground,
      timeoutMs: options.timeoutMs,
    })
  }

  delete(name: string, options: DeleteProfileOptions = {}): DeleteResult {
    const self = currentProfileName()
    if (self !== undefined && name === self) {
      throw new Error(`profile ${name} 是正在运行本管理器的 profile，插件形态对其只读（防自毁）`)
    }
    return deleteProfile(this.home, name, this.state(), {
      purge: options.purge ?? false,
      yes: options.yes ?? true,
      log: (m: string) => this.log(m),
      warn: (m: string) => this.warn(m),
    })
  }

  doctor(): Promise<DoctorReport> {
    return runDoctor(this.home, this.state())
  }

  importFile(text: string, options: ImportProfileOptions = {}): DshmProfileFile {
    return importProfileFile(text, {
      home: this.home,
      force: options.force,
      allowBuilds: options.allowBuilds,
      log: (m: string) => this.log(m),
      warn: (m: string) => this.warn(m),
    })
  }

  parseImport(text: string): DshmProfileFile {
    return parseProfileFile(text)
  }

  exportText(name: string): string {
    return exportProfileText(this.home, name, this.state())
  }
}
