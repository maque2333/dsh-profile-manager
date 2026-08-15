/**
 * /profile 人类命令（TUI 命令面）：把常用管理动作暴露为斜杠命令。
 * 注意：命令面只被 TUI 消费；Web 面板形态不经过这里。
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
// side-effect import：触发 dsh-commands 的 declare module，使 ctx.commands 类型可见。
import '@deepseek-ai/dsh-commands'
import type { ProfileManager } from './profile-manager.js'

function fmt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function registerProfileCommand(ctx: Context, pm: ProfileManager): void {
  ctx.commands.register({
    name: 'profile',
    description: '管理 DSH profile 与运行实例',
    input: { hint: 'list | show <name> | import <file> | export <name> | create <name> | start <name> | stop <name> | restart <name> | status [name] | delete <name> | plugin list/add/remove | doctor' },
    async handler(invocation) {
      const [verb, ...rest] = invocation.rawInput.trim().split(/\s+/)
      const arg = rest[0]
      try {
        switch (verb) {
          case 'list':
            return { kind: 'success', text: fmt(await pm.list()) }
          case 'show':
            return { kind: 'success', text: fmt(pm.show(arg)) }
          case 'import': {
            if (arg === undefined) return { kind: 'error', text: 'import 需要定义文件路径：/profile import <file>' }
            const spec = pm.importFile(readFileSync(arg, 'utf8'))
            return { kind: 'success', text: fmt({ imported: spec.name, bundles: spec.bundles }) }
          }
          case 'export':
            return { kind: 'success', text: pm.exportText(arg) }
          case 'start':
            return { kind: 'success', text: fmt(await pm.start(arg)) }
          case 'stop':
            return { kind: 'success', text: fmt(await pm.stop({ profile: arg })) }
          case 'restart':
            return { kind: 'success', text: fmt(await pm.restart(arg)) }
          case 'status':
            return { kind: 'success', text: fmt(await pm.status(arg)) }
          case 'delete':
            return { kind: 'success', text: fmt(pm.delete(arg, { purge: rest.includes('--purge') })) }
          case 'create':
            return { kind: 'success', text: fmt({ created: pm.create(arg).name }) }
          case 'plugin': {
            const op = rest[0]
            if (op === 'list') return { kind: 'success', text: fmt(pm.pluginList(rest[1])) }
            if (op === 'add') {
              const r = pm.pluginAdd(rest[1], rest[2])
              return r.code === 0
                ? { kind: 'success', text: `已安装 ${rest[2]} 到 ${rest[1]}（装包冷，重启生效）` }
                : { kind: 'error', text: `安装失败：${r.output}` }
            }
            if (op === 'remove') {
              const r = pm.pluginRemove(rest[1], rest[2])
              return r.code === 0
                ? { kind: 'success', text: `已卸载 ${rest[2]}（装包冷，重启生效）` }
                : { kind: 'error', text: `卸载失败：${r.output}` }
            }
            if (op === 'entries') return { kind: 'success', text: fmt(pm.pluginEntries(rest[1])) }
            if (op === 'enable') {
              pm.pluginEnable(rest[1], rest[2])
              return { kind: 'success', text: `已启用 ${rest[2]}（运行中 HMR 热生效）` }
            }
            if (op === 'disable') {
              pm.pluginDisable(rest[1], rest[2])
              return { kind: 'success', text: `已停用 ${rest[2]}（运行中 HMR 热生效）` }
            }
            return { kind: 'error', text: 'plugin 用法：/profile plugin list [profile] | entries <profile> | add/remove <profile> <pkg> | enable/disable <profile> <entryId>' }
          }
          case 'doctor':
            return { kind: 'success', text: fmt(await pm.doctor()) }
          default:
            return {
              kind: 'error',
              text: `未知子命令 "${verb ?? ''}"。可用：list / show <name> / import <file> / export <name> / create <name> / start <name> / stop <name> / restart <name> / status [name] / delete <name> [--purge] / plugin list/add/remove / doctor`,
            }
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
