/**
 * profile_* 模型工具：把 profile 管理动作暴露给 agent。
 * 每个工具 execute 里捕获错误并转成结构化结果（不静默、不裸抛），
 * 成功/失败统一为 { ok, ... } 形状，render 成 JSON 文本。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { DshmError } from '@dsh-profile-manager/core'
import type { ProfileManager } from './profile-manager.js'

function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 把任意结构体序列化成纯 JSON（工具 canonical 值必须是 JSON 数据）。 */
function json(value: unknown): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>
}

function toError(error: unknown): { ok: false; error: string; hint?: string } {
  if (error instanceof DshmError) {
    return error.hint === undefined
      ? { ok: false, error: error.message }
      : { ok: false, error: error.message, hint: error.hint }
  }
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

const OUTPUT = { type: 'object', additionalProperties: true } as const

/** 注册全部 profile_* 工具（全局，所有 agent 可见）。 */
export function registerProfileTools(ctx: Context, pm: ProfileManager): void {
  ctx.tools.register(defineTool({
    name: 'profile_list',
    description:
      '列出本机全部 DSH profile（定义）及其运行实例的实时状态。'
      + '用于查看有哪些 profile、每个 profile 装了什么 bundles、当前有没有实例在跑。',
    parameters: {},
    output: { schema: OUTPUT, render: renderValue },
    async execute() {
      try {
        return json({ ok: true, profiles: await pm.list() })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_show',
    description: '查看单个 profile 的明细：bundles、dependencies、用户 patch 层。',
    parameters: {
      name: { type: 'string', required: true, description: 'profile 名' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        return json({ ok: true, ...pm.show(args.name) })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_start',
    description:
      '启动一个 profile 的运行实例。web 形态会自动分配端口；同 profile 多开需显式 port；headless 形态会被拒绝。'
      + '返回新实例的 id 与状态。',
    parameters: {
      name: { type: 'string', required: true, description: 'profile 名' },
      port: { type: 'number', description: '可选端口（仅 web 形态，多开第二实例时显式指定）' },
      foreground: { type: 'boolean', description: '可选，前台运行（generic 形态需要终端时用）' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const result = await pm.start(args.name, { port: args.port, foreground: args.foreground })
        return json({ ok: true, instance: result.record.id, status: result.status })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_stop',
    description:
      '停止运行实例。传 id（<profile>-<n>）停单个实例，传 profile 名停该 profile 全部实例。'
      + '结果区分 graceful（优雅）与 killed（强杀）。',
    parameters: {
      id: { type: 'string', description: '实例 id（<profile>-<n>）' },
      profile: { type: 'string', description: 'profile 名（停该 profile 全部实例）' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        if (args.id !== undefined && args.profile !== undefined) {
          return json({ ok: false, error: 'id 与 profile 二选一，不能同时给' })
        }
        const { results } = await pm.stop(
          args.id !== undefined ? { ids: [args.id] } : { profile: args.profile },
        )
        return json({ ok: true, results })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_status',
    description: '查看实例实时状态（web 用 HTTP 探活，generic 看进程存活）。不带参数看全部 profile。',
    parameters: {
      name: { type: 'string', description: '可选 profile 名' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        return json({ ok: true, profiles: await pm.status(args.name) })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_delete',
    description:
      '删除 profile：默认归档（archive/），purge=true 彻底删除；运行中的 profile 会被拒绝；不影响会话记录。'
      + '不能删除正在运行本管理器的 profile。',
    parameters: {
      name: { type: 'string', required: true, description: 'profile 名' },
      purge: { type: 'boolean', description: 'true = 彻底删除；默认 false = 归档' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const result = pm.delete(args.name, { purge: args.purge ?? false })
        return json({ ok: true, ...result })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_doctor',
    description: '运行一致性诊断：目录/注册表/进程三方核对 + 崩溃残留 + 归档清单。',
    parameters: {},
    output: { schema: OUTPUT, render: renderValue },
    async execute() {
      try {
        return json({ ok: true, report: await pm.doctor() })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_import',
    description:
      '从 dshm-profile.yaml 定义文本安装一个 profile 及其全部包（透传官方 dsh plugin，失败整目录回滚）。'
      + '定义文本需含 dshmProfile: 1、name、bundles；dependencies 与官方 package.json 同构。'
      + 'force=true 覆盖已存在的 profile（有运行实例仍会拒绝）。',
    parameters: {
      definition: { type: 'string', required: true, description: 'dshm-profile.yaml 的完整文本' },
      force: { type: 'boolean', description: '覆盖已存在的 profile' },
      allowBuilds: { type: 'boolean', description: 'pnpm 拦截构建脚本时代写豁免名单后重试' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const spec = pm.importFile(args.definition, { force: args.force, allowBuilds: args.allowBuilds })
        return json({ ok: true, imported: spec.name, bundles: spec.bundles })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_export',
    description: '把 profile 导出为 dshm-profile.yaml 定义文本（备份/分享/迁移）。返回定义文件的完整文本。',
    parameters: {
      name: { type: 'string', required: true, description: 'profile 名' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        return json({ ok: true, name: args.name, definition: pm.exportText(args.name) })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_restart',
    description: '重启 profile：停止其全部实例，再用上次端口（或指定 port）重新启动。',
    parameters: {
      name: { type: 'string', required: true, description: 'profile 名' },
      port: { type: 'number', description: '可选新端口（仅 web 形态）' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const result = await pm.restart(args.name, { port: args.port })
        return json({ ok: true, instance: result.record.id, status: result.status })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_create',
    description: '新建一个空 profile（默认起步 = @deepseek-ai/dsh-base）。用于从零造 profile，再往里加 plugin。',
    parameters: {
      name: { type: 'string', required: true, description: '新 profile 名' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const spec = pm.create(args.name)
        return json({ ok: true, created: spec.name, bundles: spec.bundles })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_plugin_list',
    description:
      '列出 plugin：不带 profile = 全局汇总（每个 plugin 被哪些 profile 引用）；'
      + '带 profile = 该 profile 装了哪些 plugin。',
    parameters: {
      profile: { type: 'string', description: '可选 profile 名（省略 = 全局汇总）' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        return json({ ok: true, plugins: pm.pluginList(args.profile) })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_plugin_add',
    description:
      '给 profile 安装一个 plugin（透传官方 dsh plugin add，支持 npm / github: / file: / link:）。'
      + '装包冷：运行中需重启才生效。',
    parameters: {
      profile: { type: 'string', required: true, description: 'profile 名' },
      pkg: { type: 'string', required: true, description: '包 spec（npm 名 / github:owner/repo / 本地路径）' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const r = pm.pluginAdd(args.profile, args.pkg)
        return r.code === 0
          ? json({ ok: true, added: args.pkg, profile: args.profile })
          : json({ ok: false, error: `安装失败（退出码 ${r.code}）`, output: r.output })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'profile_plugin_remove',
    description: '从 profile 卸载一个 plugin（透传官方 dsh plugin remove）。装包冷：运行中需重启才生效。',
    parameters: {
      profile: { type: 'string', required: true, description: 'profile 名' },
      pkg: { type: 'string', required: true, description: '包名' },
    },
    output: { schema: OUTPUT, render: renderValue },
    async execute(args) {
      try {
        const r = pm.pluginRemove(args.profile, args.pkg)
        return r.code === 0
          ? json({ ok: true, removed: args.pkg, profile: args.profile })
          : json({ ok: false, error: `卸载失败（退出码 ${r.code}）`, output: r.output })
      } catch (error) {
        return json(toError(error))
      }
    },
  }))
}
