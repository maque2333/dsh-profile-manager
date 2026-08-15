#!/usr/bin/env node
/** dshm — DeepSeek Harness Profile Manager CLI（薄壳，全部逻辑在 core）。 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import {
  DshmError,
  deleteProfile,
  exportProfileText,
  importProfileFile,
  isValidProfileName,
  listViews,
  loadRuntime,
  readProfile,
  resolveDshHome,
  runDoctor,
  saveRuntime,
  startService,
  stopService,
} from '@dsh-profile-manager/core'

const VERSION = '0.1.0'

const shapeLabel = (shape: string): string =>
  shape === 'web' ? 'web' : shape === 'headless' ? 'headless(一次性)' : 'other/tui'

function fail(error: unknown): never {
  if (error instanceof DshmError) {
    console.error(`dshm: ${error.message}`)
    if (error.hint !== undefined) console.error(`  提示: ${error.hint}`)
  } else {
    console.error(`dshm: 内部错误：${String(error)}`)
  }
  process.exit(1)
}

function resolveName(arg: string | undefined, globalName: string | undefined): string {
  const name = arg ?? globalName
  if (name === undefined) throw new DshmError('缺少 profile 名（命令参数或全局 --profile）')
  if (!isValidProfileName(name)) throw new DshmError(`无效的 profile 名：${name}`)
  return name
}

/** 解析 manager profile 里 dsh-profile-manager bundle 的来源（开发期 link 本地 / 发布期 npm）。 */
function resolvePlugin(): { name: string; spec: string } {
  const env = process.env.DSHM_PLUGIN
  if (env === undefined || env === '') {
    return { name: 'dsh-profile-manager', spec: '^0.1.0' }
  }
  if (env.startsWith('link:') || env.startsWith('file:')) {
    const dir = env.slice(env.indexOf(':') + 1)
    const pkg = JSON.parse(readFileSync(join(resolve(dir), 'package.json'), 'utf8')) as { name?: string }
    if (typeof pkg.name !== 'string') {
      throw new DshmError(`DSHM_PLUGIN 指向的 package.json 缺少 name：${dir}`)
    }
    return { name: pkg.name, spec: env }
  }
  throw new DshmError('DSHM_PLUGIN 只支持 link:/file: 本地路径（开发期），或留空使用发布版 dsh-profile-manager@^0.1.0')
}

/** 生成内置的 manager profile 定义（dshm-profile.yaml 文本）。 */
function managerDefinition(pluginName: string, pluginSpec: string, port: number): string {
  return `dshmProfile: 1
name: manager
bundles:
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'
  - '${pluginName}'
dependencies:
  '${pluginName}': '${pluginSpec}'
meta:
  description: dshm 管理器实例（Profiles as instances）
  port: ${port}
`
}

async function main(argv: string[]): Promise<void> {
  const program = new Command()
  program
    .name('dshm')
    .version(VERSION, '-V, --version')
    .description('DSH Profile Manager：把 DeepSeek Harness 的 profile 当实例管理（Profiles as instances）')
    .option('--profile <name>', '全局默认 profile（省略各命令的 <name> 时使用）')

  const home = () => resolveDshHome()
  const globalProfile = () => (program.opts<{ profile?: string }>()).profile

  program
    .command('list')
    .description('显示本机全部 profile：形态 | bundles | 依赖数 | 实例状态')
    .action(async () => {
      const ctx = { home: home() }
      const state = loadRuntime(ctx.home, { warn: (m) => console.error(`dshm: ${m}`) })
      const views = await listViews(ctx, state)
      if (views.length === 0) {
        console.log('本机没有任何 profile（用 dshm import <文件> 安装一个）')
        return
      }
      console.log('PROFILE          SHAPE             BUNDLES  DEPS  INSTANCES')
      for (const v of views) {
        const inst = v.instances.length === 0
          ? '-'
          : v.instances.map((i) => `${i.id}(${i.status}${i.port !== undefined ? ` :${i.port}` : ''})`).join(', ')
        console.log(`${v.name.padEnd(16)} ${shapeLabel(v.shape).padEnd(16)} ${String(v.bundles.length).padEnd(7)} ${String(Object.keys(v.dependencies).length).padEnd(5)} ${inst}`)
      }
    })

  program
    .command('show <name>')
    .description('单个 profile 明细：bundles + 依赖 + patch 层摘要 + 实例')
    .action(async (name: string) => {
      name = resolveName(name, globalProfile())
      const ctx = { home: home() }
      const info = readProfile(ctx.home, name)
      const state = loadRuntime(ctx.home)
      const views = await listViews(ctx, state)
      const view = views.find((v) => v.name === info.name)
      console.log(`profile: ${info.name}   (${shapeLabel(info.shape)}, ${info.dir})`)
      console.log(`bundles (${info.bundles.length}):`)
      for (const b of info.bundles) console.log(`  - ${b}`)
      const deps = Object.entries(info.dependencies)
      console.log(`dependencies (${deps.length}):`)
      for (const [dep, spec] of deps) console.log(`  - ${dep}: ${spec}`)
      console.log(`patch 层: ${info.patch === null ? '（无 cordis.patch.yml）' : `\n${info.patch.trimEnd()}`}`)
      if (state.suggestedPorts?.[name] !== undefined) {
        console.log(`建议端口(meta): ${state.suggestedPorts[name]}`)
      }
      if (view !== undefined && view.instances.length > 0) {
        console.log('instances:')
        for (const i of view.instances) {
          console.log(`  - ${i.id}  ${i.status.padEnd(8)} ${i.detail}`)
        }
      } else {
        console.log('instances: -（未运行）')
      }
    })

  program
    .command('import <file>')
    .description('从 dshm-profile.yaml 安装 profile 及其全部包（透传官方 dsh plugin）')
    .option('--name <name>', '覆盖定义文件里的 name')
    .option('--force', '覆盖已存在的 profile（有运行中实例仍会拒绝）')
    .option('--allow-builds', 'pnpm 拦截构建脚本时，代写 allowBuilds 豁免名单后重试')
    .action(async (file: string, options: { name?: string; force?: boolean; allowBuilds?: boolean }) => {
      const text = readFileSync(resolve(file), 'utf8')
      const spec = importProfileFile(text, {
        home: home(),
        force: options.force === true,
        allowBuilds: options.allowBuilds === true,
      })
      const name = options.name ?? spec.name
      if (spec.meta?.port !== undefined) {
        const state = loadRuntime(home())
        state.suggestedPorts = { ...state.suggestedPorts, [name]: spec.meta.port }
        saveRuntime(home(), state)
      }
      console.log(`下一步：dshm start ${name} 或 dshm show ${name}`)
    })

  program
    .command('export <name>')
    .description('把 profile 导出为 dshm-profile.yaml（备份/分享/迁移）')
    .option('-o, --output <file>', '写入文件（默认打印到 stdout）')
    .action((name: string, options: { output?: string }) => {
      name = resolveName(name, globalProfile())
      const state = loadRuntime(home())
      const text = exportProfileText(home(), name, state)
      if (options.output !== undefined) {
        writeFileSync(resolve(options.output), text, 'utf8')
        console.log(`已导出：${options.output}`)
      } else {
        process.stdout.write(text)
      }
    })

  program
    .command('delete <name>')
    .description('删除 profile：默认归档（archive/），--purge 彻底删除；不碰会话记录')
    .option('--purge', '彻底删除而非归档')
    .option('--yes', '跳过交互确认（非交互环境必需）')
    .option('--force', '先停止该 profile 全部运行中实例再删除')
    .action(async (name: string, options: { purge?: boolean; yes?: boolean; force?: boolean }) => {
      name = resolveName(name, globalProfile())
      const ctx = { home: home() }
      let state = loadRuntime(ctx.home)
      if (options.force === true) {
        try {
          ;({ state } = await stopService({ ctx, state, profile: name }))
        } catch (error) {
          if (!(error instanceof DshmError) || !error.message.includes('没有登记中的实例')) throw error
        }
      }
      deleteProfile(ctx.home, name, state, { purge: options.purge === true, yes: options.yes === true })
    })

  program
    .command('start <name>')
    .description('启动一个实例（web 形态分配端口；同 profile 多开需显式 --port）')
    .option('--port <n>', 'web 实例端口（默认：上次端口 > meta.port > 3081 起找空）', (v) => Number(v))
    .option('--foreground', '在前台终端运行（terminal 形态建议使用）')
    .option('--timeout <s>', 'web 就绪等待秒数（默认 30）', (v) => Number(v) * 1000)
    .action(async (name: string, options: { port?: number; foreground?: boolean; timeout?: number }) => {
      name = resolveName(name, globalProfile())
      const ctx = { home: home() }
      const state = loadRuntime(ctx.home)
      const result = await startService({
        ctx,
        state,
        profile: name,
        port: options.port,
        foreground: options.foreground === true,
        timeoutMs: options.timeout ?? 30_000,
      })
      const r = result.record
      console.log(`已启动实例 ${r.id}（${r.shape}${r.port !== undefined ? ` :${r.port}` : ''}，PID ${r.pid}）状态: ${result.status}`)
      console.log(`日志：${r.logFile}`)
    })

  program
    .command('stop <name>')
    .description('关闭实例（<name> 可为 profile 名或实例 id）；不指定 --port 时关闭该 profile 全部实例')
    .option('--port <n>', '只关闭该端口上的实例', (v) => Number(v))
    .option('--timeout <s>', '优雅停止等待秒数（默认 8）', (v) => Number(v) * 1000)
    .action(async (name: string, options: { port?: number; timeout?: number }) => {
      name = resolveName(name, globalProfile())
      const ctx = { home: home() }
      const state = loadRuntime(ctx.home)
      const asId = state.instances[name]
      let ids: string[] | undefined
      let profile: string | undefined
      if (asId !== undefined) {
        ids = [name]
      } else if (options.port !== undefined) {
        const rec = Object.values(state.instances).find((r) => r.profile === name && r.port === options.port)
        if (rec === undefined) throw new DshmError(`profile ${name} 没有跑在 :${options.port} 的实例`)
        ids = [rec.id]
      } else {
        profile = name
      }
      const { results } = await stopService({ ctx, state, ids, profile, timeoutMs: options.timeout })
      for (const r of results) {
        const verb = r.result === 'killed' ? '已强制终止（优雅停止超时）' : r.result === 'graceful' ? '已优雅停止' : '已不在运行'
        console.log(`${r.id}: ${verb}`)
      }
    })

  program
    .command('restart <name>')
    .description('重启：停止该 profile 全部实例，再用上次端口重新启动')
    .option('--port <n>', 'web 实例新端口', (v) => Number(v))
    .option('--foreground', '前台运行')
    .action(async (name: string, options: { port?: number; foreground?: boolean }) => {
      name = resolveName(name, globalProfile())
      const ctx = { home: home() }
      let state = loadRuntime(ctx.home)
      const lastPort = state.suggestedPorts?.[name]
        ?? Object.values(state.instances).find((r) => r.profile === name && r.port !== undefined)?.port
      try {
        ;({ state } = await stopService({ ctx, state, profile: name }))
      } catch (error) {
        if (!(error instanceof DshmError) || !error.message.includes('没有登记中的实例')) throw error
      }
      const result = await startService({
        ctx,
        state,
        profile: name,
        port: options.port ?? lastPort,
        foreground: options.foreground === true,
      })
      console.log(`已重启：${result.record.id}（状态 ${result.status}）`)
    })

  program
    .command('status [name]')
    .description('实例状态（缺省 = 全部 profile 的实例）')
    .action(async (name?: string) => {
      const ctx = { home: home() }
      const state = loadRuntime(ctx.home)
      const views = await listViews(ctx, state)
      let printed = false
      for (const v of views) {
        if (name !== undefined && v.name !== name) continue
        if (v.instances.length === 0) {
          if (name === v.name) console.log(`${v.name}: 未运行`)
          continue
        }
        for (const i of v.instances) {
          printed = true
          console.log(`${i.id.padEnd(14)} ${i.status.padEnd(8)} ${i.detail}`)
        }
      }
      if (name !== undefined && !printed && !views.some((v) => v.name === name)) {
        console.log(`${name}: 未运行（或 profile 不存在）`)
      }
    })

  program
    .command('doctor')
    .description('一致性诊断：目录/注册表/进程三方核对 + 归档清单')
    .action(async () => {
      const ctx = { home: home() }
      const state = loadRuntime(ctx.home)
      const report = await runDoctor(ctx.home, state)
      for (const f of report.findings) {
        const mark = f.kind === 'error' ? '✗' : f.kind === 'warn' ? '⚠' : '✓'
        console.log(` ${mark} ${f.message}`)
        if (f.hint !== undefined) console.log(`     ${f.hint}`)
      }
      if (report.archives.length > 0) {
        console.log(`\n归档区（${report.archives.length}）：`)
        for (const a of report.archives) console.log(`  - ${a}`)
      }
    })

  program
    .command('bootstrap')
    .description('创建并启动 manager profile（唯一进程外自举：dsh-base + dsh-web-app + 本插件）')
    .option('--port <n>', 'manager 实例端口（默认 3081 起找空）', (v) => Number(v))
    .action(async (options: { port?: number }) => {
      const { name: pluginName, spec: pluginSpec } = resolvePlugin()
      const suggestedPort = options.port ?? 3081
      importProfileFile(managerDefinition(pluginName, pluginSpec, suggestedPort), { home: home() })
      const state = loadRuntime(home())
      state.suggestedPorts = { ...state.suggestedPorts, manager: suggestedPort }
      saveRuntime(home(), state)
      const result = await startService({
        ctx: { home: home() },
        state,
        profile: 'manager',
        port: options.port,
        timeoutMs: 30_000,
      })
      const r = result.record
      console.log(`manager 已启动：${r.id}（:${r.port}，PID ${r.pid}）`)
      console.log(`面板：http://127.0.0.1:${r.port}/profile-manager`)
      console.log(`日志：${r.logFile}`)
    })

  // from: 'user'：argv 是 slice(2) 后的纯用户参数（与官方 dsh 的 parse 一致）
  await program.parseAsync(argv, { from: 'user' })
}

main(process.argv.slice(2)).catch(fail)
