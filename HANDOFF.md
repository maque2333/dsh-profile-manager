# HANDOFF.md — 跨会话交接状态

> 每个 agent 会话结束时更新本文档；下一会话从"下一步"开始。决策不可翻案（见 DESIGN.md §11，改动需人类确认）。
> **交接协议**：新会话开工顺序 = 读 AGENTS.md → 读本文件 → `git -C <仓库> log --oneline` 对照 → 从"下一步"第一条开始。

## 当前状态（最后更新：2026-08-15，为跨会话交接整理）

- **阶段**：M0 ✅；**M1 完成**（core + CLI + 测试 46/46 全绿 + 真机验收通过），已同步仓库；M2/M3 未开工。
- **仓库**：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`（正式仓库，只读镜像 + git）；暂存开发地 = `/Users/maque/Suzume_Files/Project/DSH/dsh-profile-manager`（Option C，见 AGENTS.md）。
- **git 提交**：`8e5fbd4`（M0 定案）→ `316cf44`（M1 第一版）→ `d75da67`（M1 验收补强）。远端未配置。
- **本机可用性**：`dshm` 已通过 `npm link` 全局安装（`/Users/maque/.local/opt/node/bin/dshm` → 暂存目录 `packages/cli`）；**改代码后 `pnpm run build` 即全局生效**，无需重链。
- **唯一未完成的人工验证**：用户终端跑 `dshm start cc-tui --foreground`（TTY 交互无法自动化）。

## 真机验收证据（真实 `~/.dsh`，2026-08-15）

- web 形态全生命周期 ✅：`dshm start web` → web-1 起在 :3081、HTTP 探活 running → `dshm stop web-1` 优雅停止 → runtime 无残留；
- cc-tui 自诊断路径 ✅：detach 无 TTY 启动即崩，dshm 报错并给出日志尾部（真实原因 `cc-tui requires an interactive terminal`）；
- generic 全生命周期 ✅（临时 DSH_HOME e2e：bare profile detach 启动/存活/优雅停止 + foreground 模式登记/停止）；
- 测试：**46/46**（8 套件：core 单测 6 + 真实 dsh 集成 1 + CLI 级 1）。

## 已完成（按时间倒序）

1. 需求收敛 + 概念定案 + grilling 决策树（14 项决策，DESIGN.md §11）；
2. 文档四件套 + git 初始化（8e5fbd4）；
3. Option C 开发流程定案（AGENTS.md）；
4. M1 第一版实现（316cf44）：脚手架 + core 十模块（types/paths/profiles/runtime/ports/process/probe/import/archive/doctor/service）+ cli 全命令 + 测试；
5. M1 验收补强（d75da67）：generic/headless/多开/doctor/CLI 往返/foreground 覆盖；真机验收；
6. `npm link` 全局安装 dshm（本机开发期可用）。

## 进行中

- 无。

## 下一步（按优先级）

1. **等用户人工验证** `dshm start cc-tui --foreground`——若反馈异常优先修；
2. **M1 打磨**：错误文案走查；双语 README 初稿（安装/命令/定义文件格式三节）；
3. **M2 设计**：plugin 形态（DESIGN §3.4/§9）——与 CLI 同包发布，包声明 `dsh.bundle.patch`；`ctx.profileManager` + 面板路由 + `profile_*` 工具 + `/profile` 命令 + manager profile 模板 + `dshm bootstrap`；
4. **M3 发布清单**（已定，勿遗漏）：
   - `packages/cli` 的 `@dsh-profile-manager/core: workspace:*` → 版本依赖（`^0.1.0`），npm 不认 workspace 协议；
   - **core 先发布、cli 后发**（依赖顺序）；版本 0.1.0；README 注明适配 dsh 0.1.0-rc.x；
   - Windows 实测（spawn/taskkill/路径）；npm publish；GitHub 建仓 + 远端 + `dsh-plugin` topic；awesome 收录（awesome-dsh-plugin、0xsline/awesome-deepseek-harness）。

## 已知坑（实现时对照，勿重踩）

- `dsh --profile <name> --help` / 任何 dsh 启动都会**重写 profile 根 `cordis.yml`**——dshm 的 `--dump-config` 验证步骤同样触发；测试 DSH_HOME 里没问题，别在真实 home 跑；
- `dsh plugin` 要求 **pnpm 在 PATH**；git 依赖被 pnpm allowBuilds 拦截 → dshm 已做高亮 + `--allow-builds` 代写；
- 官方对账（reconcilePlugins）自带查重：import 的 bundles 已列不会重复追加；漏列自动补上（顺序由追加决定 → 优先显式声明）；
- **web profile 的模块级 HMR 官方禁用**（web-app bundle `hmr: disabled`）；patch 层热更新可用（watch-only HMR）；对外契约"配置热、装包冷"；
- cc-tui 无端口、需 TTY：detach 秒退 → 自诊断报错 + 指路 `--foreground`（已实现）；
- 官方 CLI 第一个不认识的 token 起全是 app 参数：spawn 参数必须 `dsh --profile <name>` 在前；
- **commander 15**：`parseAsync(argv)` 必须带 `{ from: 'user' }`（argv 是 slice(2) 后的纯用户参数）；
- **pnpm ≥11**：`pnpm-workspace.yaml` 的 allowBuilds 是**映射形式**（`esbuild: true`），不是列表；根 workspace 已配好，勿改坏；
- 本会话沙箱：写仓库（工作区外）需 `danger-full-access` 审批（每条命令一次）；读任意路径不受限；测试/开发用临时 DSH_HOME 铁律。

## 环境事实

- 本机 dsh：npm 包 `@deepseek-ai/dsh` **0.1.0-rc.6**，安装于 `~/.local/opt/node/lib/node_modules/@deepseek-ai/dsh`；
- 真实 `~/.dsh`：profiles = web、cc-tui（dsh-cc-tui 0.1.2）；sessions 约 15 个/21MB；**含密钥，禁碰**（`.credentials.yaml`）；
- Node v24.18.0；pnpm 11.21.0（corepack）；npm 全局 prefix = `/Users/maque/.local/opt/node`（在 PATH）；
- 官方仓库浅克隆：`/tmp/dsh-repo`（可能过期，用前 `git -C /tmp/dsh-repo pull --depth 1`）；
- 人类是 DSH 新手（教学语气友好，但文档/代码按专业标准）；人类已授权 Option C 开发流程。

## git 状态

- 仓库：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`；分支 main；远端未配置（M3 时人类建 GitHub 仓库后添加）；
- 约定：conventional commits；`pnpm run check` 通过才提交；不提交 node_modules/构建产物（lib 已 gitignore，但 rsync 同步仍会带过去——仓库里存在未跟踪的 lib，正常）。
