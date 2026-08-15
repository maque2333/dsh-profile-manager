/**
 * dsh-profile-manager host 入口（Cordis bundle）。
 *
 * 装配：ctx.profileManager 服务 + profile_* 模型工具 + /profile 命令。
 * 逻辑 100% 复用 @dsh-profile-manager/core；本入口只做装配。
 */

import type { Context } from '@deepseek-ai/cordis'
import { ProfileManager } from './profile-manager.js'
import { registerProfileTools } from './tools.js'
import { registerProfileCommand } from './command.js'
import { registerPanelRoutes } from './panel.js'

export const name = 'dsh-profile-manager'

export function apply(ctx: Context) {
  // 1. 提供服务：profileManager（其他插件/面板/工具通过 inject 消费）。
  ctx.plugin(ProfileManager)
  // 2. 等服务就绪后注册工具与命令：profileManager 由本插件提供，
  //    tools / commands 由 base bundle 提供。
  ctx.inject(['profileManager', 'tools', 'commands'], (ctx) => {
    registerProfileTools(ctx, ctx.profileManager)
    registerProfileCommand(ctx, ctx.profileManager)
  })
  // 3. 面板路由（独立于 tools/commands，只需 profileManager + webServer）。
  ctx.inject(['profileManager', 'webServer'], (ctx) => {
    registerPanelRoutes(ctx, ctx.profileManager)
  })
}
