# HANDOFF.md — 跨会话交接状态

> 每个 agent 会话结束时更新本文档；下一会话从"下一步"开始。决策不可翻案（见 DESIGN.md §11，改动需人类确认）。

## 当前状态（最后更新：2026-08-15）

- **阶段**：M0 设计评审 ✅ 已完成（14 项决策定案，grilling 全流程走完）；**M1（core + CLI）未开工**。
- **仓库**：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`（git 已初始化，见"git 状态"）。
- **最新提交**：`chore: M0 设计定案 + 交接文档初始化`（预计本会话末提交，若未见此提交说明待办）。

## 已完成（按时间倒序）

1. 需求收敛：P0 = 显示 profile / 启动关闭 / 文件导入删除；P1 = profile 内 plugin 管理；
2. 概念定案：Profile（定义，官方概念）vs Instance（运行，dshm 新概念，标识 `<profile>-<n>`）；
3. grilling 决策树走完 12 问 + 衍生项，14 项决策写入 DESIGN.md §11；
4. 文档四件套：DESIGN.md（v0.2 定案版）、AGENTS.md（项目守则）、HANDOFF.md（本文档）、.gitignore。

## 进行中

- 无（M1 待开工）。

## 下一步（M1 开工清单，按序）

1. **脚手架**：pnpm workspace + `packages/{core,cli,plugin}` 骨架 + tsc 配置 + vitest 配置 + npm 脚本（build/check/test）；
2. **core 模块**（按依赖序实现，每个配 vitest 单测）：
   a. `profiles.ts` —— 读 `$DSH_HOME/profiles/*/package.json`（bundles/dependencies）、cordis.patch.yml 摘要、形态分类（web/headless/generic）；
   b. `runtime.ts` —— runtime.yaml 读写（instances key=`<profile>-<n>`）、写失败降级；
   c. `ports.ts` —— 端口链（--port > 上次 > meta.port > 3081 找空，bind 测试）；
   d. `process.ts` —— spawn（web detach / generic detach+foreground 两模式）、SIGTERM→8s→SIGKILL 序列、PID 存活；
   e. `probe.ts` —— HTTP 探活（web）/ kill(pid,0)（generic）；
   f. `import.ts` —— dshm-profile.yaml 解析（js-yaml）+ 官方三件套生成 + 预检（pnpm/名称冲突/内置三件套剔除）+ 透传 `dsh plugin install` + `--dump-config` 验证 + 失败回滚；
   g. `archive.ts` —— delete 归档/--purge 语义；
3. **cli 命令**（commander）：list/show/import/export/delete/start/stop/restart/status/doctor；
4. **集成测试**（临时 DSH_HOME 铁律）：import→start→探活→stop→delete 全流程；
5. 真机验收（需人类参与）：本机 web + cc-tui 两形态跑通。

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
