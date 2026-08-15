# HANDOFF.md — 跨会话交接状态

> 每个 agent 会话结束时更新本文档；下一会话从"下一步"开始。决策不可翻案（见 DESIGN.md §11，改动需人类确认）。
> **交接协议**：新会话开工顺序 = 读 AGENTS.md → 读本文件 → `git -C <仓库> log --oneline` 对照 → 从"下一步"第一条开始。

## 当前状态（最后更新：2026-08-15，P1 C1 完成 + 0.2.1 发布 + bootstrap --force）

- **阶段**：M0 ✅；M1 ✅；M2 ✅；M3 ✅；**P1 阶段 0/A/B/C1 ✅**（`/profile` 命令补齐 + `create` + `plugin list/add/remove` + **跨 profile 热插拔**（entries/enable/disable）+ **store 三入口**（CLI `plugin search/info/install` + 面板商店区 + `profile_plugin_search/info/install`，GitHub dsh-plugin topic 搜索），4 界面同步，65/65 测试全绿。**P1 C2（官方 webUI 插件）待做**。
- **发布产物**：npm `@dsh-profile-manager/core@0.2.0` + `dsh-profile-manager@0.2.0`（均已发布）；GitHub `https://github.com/maque2333/dsh-profile-manager`（main 已 push，topic = `dsh-plugin`）。
- **设计文档**：`docs/p1-plugin-design.md`（阶段 A/B 已完成）、`docs/p1-store-design.md`（store：C1 已完成、C2 取证结论已记录）。
- **工作区**：本会话工作区已直接落在仓库目录 `/Users/maque/Suzume_Files/Project/dsh-profile-manager`（写仓库零审批；不再是旧 Option C 的「暂存目录 + 只读镜像」布局，见下方「环境事实」）。
- **git 提交**：`8e5fbd4`（M0）→ `316cf44`（M1）→ `d75da67`（M1 验收）→ `4521725`（交接）→ `5552190`（M2）→ `aa44a21`（bootstrap link）→ `9efa56e`（交接）→ `df0bbd9`（M3 合入+README）→ `a72ec06`（Windows 审查）→ `3e70686`（P1 文档）→ `2277825`（版本号动态读取 + 0.2.1）→ `67ac214`（bootstrap --force）。已 push 到 origin/main（`67ac214` 待 push）。
- **本机可用性**：`dshm` 全局 link 已重新指向当前仓库 `packages/cli`（bin → `lib/cli.js`）；**改代码后 `pnpm --filter dsh-profile-manager build` 即全局生效**。
- **人工验证（已全部通过 ✅）**：① `dshm start cc-tui --foreground` 运行正常；② 用户真实环境跑 `dshm bootstrap` 创建 manager profile 且 webUI 面板运行正常。

## 真机验收证据（真实 `~/.dsh`，2026-08-15）

- web 形态全生命周期 ✅：`dshm start web` → web-1 起在 :3081、HTTP 探活 running → `dshm stop web-1` 优雅停止 → runtime 无残留；
- cc-tui 自诊断路径 ✅：detach 无 TTY 启动即崩，dshm 报错并给出日志尾部（真实原因 `cc-tui requires an interactive terminal`）；
- generic 全生命周期 ✅（临时 DSH_HOME e2e：bare profile detach 启动/存活/优雅停止 + foreground 模式登记/停止）；
- 测试：**46/46**（8 套件：core 单测 6 + 真实 dsh 集成 1 + CLI 级 1）。

## 已完成（按时间倒序）

1. 需求收敛 + 概念定案 + grilling 决策树（14 项决策，DESIGN.md §11）；
2. 文档四件套 + git 初始化（8e5fbd4）；
3. Option C 开发流程定案（AGENTS.md）；
4. M1 第一版实现（316cf44）：脚手架 + core 十模块 + cli 全命令 + 测试；
5. M1 验收补强（d75da67）：generic/headless/多开/doctor/CLI 往返/foreground 覆盖；真机验收；
6. `npm link` 全局安装 dshm；
7. **M2 取证**：`docs/m2-api-contract.md` —— 逐个核实官方扩展点签名（ctx.tools/defineTool、ctx.commands、ctx.webServer、ctx.subprocess、dsh.bundle/dsh.client 契约）；
8. **M2 实现**：`packages/plugin`（host 的 `ctx.profileManager` 服务 + 7 个 `profile_*` 工具 + `/profile` 命令 + 自保只读；`/profile-manager` 面板 = host 路由 + API + esbuild 打包的 React 前端）+ CLI `dshm bootstrap`；
9. **M2 验证**：headless agent 真实调用 `profile_list` 返回正确结果；web 实例 curl 面板 HTML/API/client.js 全通；`dshm bootstrap` 起 manager 实例、`list` 里普通一行、优雅停止；53/53 测试全绿。
10. **P1 阶段 0/A**：`/profile` 命令补齐（import/export/restart + create/plugin）；`create` + `plugin list`（全局/单）+ `add/remove` 4 界面同步（core `plugins` 模块 + CLI + 面板 + 工具 + 命令）；58/58 测试全绿。
11. **P1 阶段 B（跨 profile 热插拔）**：`listProfileEntries`（静态解析第三方 bundle 的 cordis.patch.yml 拿 entry，不依赖运行态）+ `setEntryDisabled`（写 patch 启停，HMR 热生效）；基础设施保护（内置 bundle 受保护不列出）；CLI `plugin entries/enable/disable` + 面板路由 + `profile_plugin_*` 工具 + `/profile` 命令；61/61 测试全绿。

## 进行中

- 无。

## 最近完成

- **bootstrap --force**（`67ac214`）：`dshm bootstrap --force --port N` 直接覆盖已存在的 manager profile（先 archive 旧的，运行中仍拒绝）。修复用户真机 `dshm start manager` 挂起的根因：旧 manager profile 引用 M2 时代包名 `@dsh-profile-manager/plugin`（M3 合并后改名 `dsh-profile-manager`），本地 link 已消失 → `cannot resolve profile bundle`。
- **审计修复**（`c2b9832`）：① `dshm import --name` 原来不生效（只改提示文字不改 profile 名）→ 现透传 `ImportOptions.name` 覆盖 spec.name；② 面板 action 报错被 `refresh()` 的 `setError('')` 吞掉 → refresh 不再清 error，手动刷新按钮显式清；③ 插件形态 `stop` 缺自保（会停掉面板进程自己，restart/delete 早有）→ 补 `currentProfileName()` 自保；④ `resolvePlugin` 发布路径坏（`cordis.patch.yml` 被打包导致永远走 `link:`，且 `^0.1.0` 从未发布）→ 改用「路径是否含 node_modules」区分开发/发布，发布走 `name@^version`；⑤ doctor 端口冲突重复报两条 → 去掉冗余的 `instanceByPort` 检查。66/66 测试全绿。

## 下一步（按优先级）

1. **P1 C2：官方 webUI 插件**（`docs/p1-store-design.md` 已有取证结论）：给 cli 包加 `dsh.client` 面 + `settings.plugins.tab` slot 注册商店 tab（StoreTab 组件 fetch `/profile-manager/api/plugin/*`），esbuild 复刻 `window.__ModuleLoader__.load` 协议 + `--external:react`，发布 0.2.1。
2. **DESIGN.md 里程碑表**：补 P1 的最终状态（阶段 A/B/C1 完成、C2 待做）。

## 已知坑（实现时对照，勿重踩）

- `dsh --profile <name> --help` / 任何 dsh 启动都会**重写 profile 根 `cordis.yml`**——dshm 的 `--dump-config` 验证步骤同样触发；测试 DSH_HOME 里没问题，别在真实 home 跑；
- `dsh plugin` 要求 **pnpm 在 PATH**；git 依赖被 pnpm allowBuilds 拦截 → dshm 已做高亮 + `--allow-builds` 代写；
- 官方对账（reconcilePlugins）自带查重：import 的 bundles 已列不会重复追加；漏列自动补上（顺序由追加决定 → 优先显式声明）；
- **web profile 的模块级 HMR 官方禁用**（web-app bundle `hmr: disabled`）；patch 层热更新可用（watch-only HMR）；对外契约"配置热、装包冷"；
- cc-tui 无端口、需 TTY：detach 秒退 → 自诊断报错 + 指路 `--foreground`（已实现）；
- 官方 CLI 第一个不认识的 token 起全是 app 参数：spawn 参数必须 `dsh --profile <name>` 在前；
- **commander 15**：`parseAsync(argv)` 必须带 `{ from: 'user' }`（argv 是 slice(2) 后的纯用户参数）；
- **pnpm ≥11**：`pnpm-workspace.yaml` 的 allowBuilds 是**映射形式**（`esbuild: true`），不是列表；根 workspace 已配好，勿改坏；
- **M2/Cordis：服务访问必须 inject**——apply 里直接 `ctx.profileManager` 会报 `cannot get property without inject`；正确姿势 = `ctx.plugin(Provider)` 提供，再 `ctx.inject(['profileManager', ...], cb)` 在消费者子插件里访问；
- **M2/dsh 子命令坑**：`dsh --profile manager web --port N` 报 `web takes none of parent --profile`（`web` 是子命令）；正确 spawn = `dsh --profile manager --port N`（无 `web` 子命令，`--port` 是 app 参数）——core 的 `startInstance` 已是正确写法；
- **M2/YAML scoped key**：`@scope/name` 做 dshm-profile.yaml 的 `dependencies` key 必须引号包裹 `'@scope/name': 'spec'`，否则 js-yaml 报 `bad indentation`；
- **M2/类型增强**：panel.ts 需 `import '@deepseek-ai/dsh-host-webserver'`、command.ts 需 `import '@deepseek-ai/dsh-commands'`（side-effect 触发 declare module），否则 `ctx.webServer`/`ctx.commands` 类型不可见；
- **M2/defineTool 输出**：宽松 `output.schema = { type: 'object', additionalProperties: true }` 推断 execute 返回 `Record<string, JsonValue>`——返回值必须 `JSON.parse(JSON.stringify(x))` 序列化（core 类型无 index signature，直接返回报类型错）；
- **M2/官方子包 rc 通道**：npm `latest` tag = `0.0.1-rc.1`（旧占位）、`next` = `0.1.0-rc.6`（真实）；peer/dev 依赖必须写 `^0.1.0-rc.6`（与 CLI 同通道，否则混装缺服务）；
- **M3/Windows 审查结论**：代码已跨平台（`isWindows()` + `taskkill /T /F` + `windowsHide: true` + `isValidProfileName` 拒绝 `\` + 全程无 `shell: true`）；**潜在风险**——Windows 下 npm 全局 bin 是 `.cmd` shim，`spawn('dsh')`/`spawnSync('pnpm')` 不带 `shell:true` 可能找不到 `.cmd`，需真实 Windows 实测（本机 macOS 无法测），必要时改用 cross-spawn 或显式 `.cmd`；不阻塞 npm 发布，仅影响 README 的「Windows 支持」声明；
- **M3/包名迁移坑**：M2 时代 bundle 包名是 `@dsh-profile-manager/plugin`，M3 合并后改名 `dsh-profile-manager`；任何旧 profile（含 manager）若其 `package.json`/`dsh.profile` 仍引用旧名，start 会 `cannot resolve profile bundle` → 用 `dshm bootstrap --force` 重建 manager，或用 `dshm import --force` 重建其他 profile；
- 本会话工作区已落在仓库目录（零审批写）；测试/开发一律临时 DSH_HOME 铁律。

## 环境事实

- 本机 dsh：npm 包 `@deepseek-ai/dsh` **0.1.0-rc.6**，安装于 `~/.local/opt/node/lib/node_modules/@deepseek-ai/dsh`；
- 真实 `~/.dsh`：profiles = web、cc-tui（dsh-cc-tui 0.1.2）；sessions 约 15 个/21MB；**含密钥，禁碰**（`.credentials.yaml`）；
- Node v24.18.0；pnpm 11.21.0（corepack）；npm 全局 prefix = `/Users/maque/.local/opt/node`（在 PATH）；
- 官方仓库浅克隆：`/tmp/dsh-repo`（可能过期，用前 `git -C /tmp/dsh-repo pull --depth 1`）；
- **工作区已切到仓库目录**（`/Users/maque/Suzume_Files/Project/dsh-profile-manager`，零审批写）；`dshm` 全局 link 已重新指向本仓库 `packages/cli`（旧暂存目录 `.../Project/DSH/dsh-profile-manager` 已废弃）；
- **M3 已合入**：`packages/plugin` 已并入 `packages/cli`（`dsh-profile-manager` 一个包同时是 CLI `lib/cli.js` + bundle `lib/index.js`，`cordis.patch.yml` 的 name = `dsh-profile-manager`）；`dshm bootstrap` 开发期自动 link 本地包自己（探测 `../`），发布期走 `dsh-profile-manager@^0.1.0`；
- 人类是 DSH 新手（教学语气友好，但文档/代码按专业标准）；人类已授权 Option C 开发流程。

## git 状态

- 仓库：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`；分支 main；远端 `origin` = `https://github.com/maque2333/dsh-profile-manager.git`（已 add，push 待 PAT）；git 走代理 `http://127.0.0.1:7890`（`http.proxy`/`https.proxy` 已配到仓库 `.git/config`）；
- 约定：conventional commits；`pnpm run check` 通过才提交；不提交 node_modules/构建产物（lib 已 gitignore，但 rsync 同步仍会带过去——仓库里存在未跟踪的 lib，正常）。
