/**
 * /profile 人类命令（TUI 命令面）：把常用管理动作暴露为斜杠命令。
 * 注意：命令面只被 TUI 消费；Web 面板形态不经过这里。
 */

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
    input: { hint: 'list | show <name> | start <name> | stop <name> | status [name] | delete <name> | doctor' },
    async handler(invocation) {
      const [verb, ...rest] = invocation.rawInput.trim().split(/\s+/)
      const arg = rest[0]
      try {
        switch (verb) {
          case 'list':
            return { kind: 'success', text: fmt(await pm.list()) }
          case 'show':
            return { kind: 'success', text: fmt(pm.show(arg)) }
          case 'start':
            return { kind: 'success', text: fmt(await pm.start(arg)) }
          case 'stop':
            return { kind: 'success', text: fmt(await pm.stop({ profile: arg })) }
          case 'status':
            return { kind: 'success', text: fmt(await pm.status(arg)) }
          case 'delete':
            return { kind: 'success', text: fmt(pm.delete(arg, { purge: rest.includes('--purge') })) }
          case 'doctor':
            return { kind: 'success', text: fmt(await pm.doctor()) }
          default:
            return {
              kind: 'error',
              text: `未知子命令 "${verb ?? ''}"。可用：list / show <name> / start <name> / stop <name> / status [name] / delete <name> [--purge] / doctor`,
            }
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
