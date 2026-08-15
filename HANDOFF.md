# HANDOFF.md — 跨会话交接状态

> 每个 agent 会话结束时更新本文档；下一会话从"下一步"开始。决策不可翻案（见 DESIGN.md §11，改动需人类确认）。

## 当前状态（最后更新：2026-08-15）

- **阶段**：M0 ✅；**M1 完成**（core + CLI + 测试 46/46 全绿 + 真机验收通过），已同步仓库。
- **真机验收证据**（真实 `~/.dsh`，2026-08-15）：
  - web 形态全生命周期 ✅：`dshm start web` → 实例 web-1 起在 :3081、HTTP 探活 running → `dshm stop web-1` 优雅停止 → 无残留记录；
  - cc-tui generic 形态自诊断路径 ✅：detach 无 TTY 启动即崩，dshm 报错并给出日志尾部（真实原因 `cc-tui requires an interactive terminal`），与设计预判一致；
  - generic 全生命周期 ✅（临时 DSH_HOME e2e：bare profile detach 启动/存活/优雅停止 + foreground 模式登记/停止）；
  - **唯一留给人做的事**：在用户自己的终端跑一次 `dshm start cc-tui --foreground`（TTY 交互无法自动化）。
- **测试**：46/46（8 个套件：core 单测 6 + 真实 dsh 集成 1 + CLI 级 1）。

## 已完成（按时间倒序）

1. 需求收敛 + 概念定案 + grilling 决策树（14 项决策，DESIGN.md §11）；
2. 文档四件套 + git 初始化（提交 8e5fbd4）；
3. Option C 开发流程定案（AGENTS.md 已登记）；
4. **M1 第一版实现**（提交 316cf44）：脚手架 + core 十模块 + cli 全命令 + 测试；
5. **M1 验收补强**（本会话）：generic 形态 e2e、headless 拒绝、多开默认拒绝、doctor 残留诊断、CLI export→import 往返、foreground 模式——45→46 测试；真机验收（web 全生命周期 + cc-tui 自诊断）。

## 进行中

- 无。

## 下一步

1. **用户终端验证**：`dshm start cc-tui --foreground`（人工确认 TUI 正常交互）；
2. **M1 打磨**：错误文案走查、README 初稿（双语，发布用）；
3. **M2 设计**：plugin 形态（DESIGN §3.4/§9）——与 CLI 同包发布，声明 `dsh.bundle.patch`；
4. **发布准备（M3）**：Windows 实测、npm publish、`dsh-plugin` topic、awesome 收录。

## 已知坑（实现时对照）

- `dsh --profile <name> --help` / 任何 dsh 启动都会**重写 profile 根 `cordis.yml`**——dshm 的 `--dump-config` 验证步骤同样触发；测试 DSH_HOME 里没问题，别在真实 home 跑；
- `dsh plugin` 要求 **pnpm 在 PATH**；git 依赖会被 pnpm ≥10 allowBuilds 拦截（官方会打印提示，dshm 需高亮 + `--allow-builds` 代写）；
- 官方对账（reconcilePlugins）自带查重：import 文件 bundles 里已列的 bundle 不会被重复追加；漏列会自动补上（自愈，但也意味着顺序由追加决定——优先显式声明）；
- **web profile 的模块级 HMR 官方禁用**（web-app bundle `hmr: disabled`，TODO 注释）；patch 层热更新可用（watch-only HMR）；
- cc-tui 无端口、需 TTY：detach 可能秒退，必须自诊断并指路 `--foreground`；
- 官方 CLI 第一个不认识的 token 起全是 app 参数：spawn 参数必须 `dsh --profile <name>` 在前、app 参数在后；
- 本会话沙箱：写仓库（工作区外）需 `danger-full-access` 审批；读任意路径不受限。

## 环境事实

- 本机 dsh：npm 包 `@deepseek-ai/dsh` 0.1.0-rc.6，安装于 `~/.local/opt/node/lib/node_modules/@deepseek-ai/dsh`；
- 真实 `~/.dsh`：profiles = web、cc-tui（社区 TUI bundle dsh-cc-tui 0.1.2）；sessions 约 15 个/21MB；**含密钥，禁碰**；
- 官方仓库浅克隆：`/tmp/dsh-repo`（可能过期，用前可 `git -C /tmp/dsh-repo pull --depth 1`）；
- 人类是 DSH 新手（教学语气友好，但文档/代码按专业标准）。

## git 状态

- 仓库：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`；分支 main；远端未配置（待人类建 GitHub 仓库后添加）；
- 约定：conventional commits；`pnpm run check` 通过才提交；不提交 node_modules/构建产物。
