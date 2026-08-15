# DSH Profile Manager（dshm）设计文档

> 版本 0.2 · 状态：**已评审定案（M0 闭环，2026-08-15）**
> 面向 DeepSeek Harness（dsh）0.1.0-rc.x；本工具**只消费官方 CLI 表面与 `$DSH_HOME` 文件格式**，不依赖任何 `@deepseek-ai/dsh-*` 内部 API。
> 项目定位：**开源项目，服务 dsh 社区**。仓库：`/Users/maque/Suzume_Files/Project/dsh-profile-manager`（git 独立成库）。

## 1. 背景与问题

DSH 的 profile 机制（`$DSH_HOME/profiles/<name>`）提供了"别名 + 插件集"的组合原语，官方 CLI 提供底层操作：

```sh
dsh plugin --profile <name> add <pkg>   # 创建/初始化 + 装插件
dsh --profile <name> web --port N       # 启动
dsh web --dump-config                   # 校验合成配置
```

官方**没有**：profile 导入/导出格式、profile 注册表视图、运行态（进程）管理。社区现有工具重心在"插件市场/启停"（管理 profile **内部**），没有把 profile **本身**当一等对象的工具。

## 2. 产品定位与差异化

一句话：**把 profile 当"实例"管理**——别名 + 插件集 + 运行态 + 生命周期。开源、MIT、中英双语 README、npm 发布、`dsh-plugin` topic、awesome 列表收录、Windows 实测。

**M1 成功标准**：发布后有 2-3 个外部社区用户照着 README 跑通 list/import/start/stop/delete 并给出真实反馈；此前 M1 不算被验证。

| 维度 | 现有插件管理器 | dshm |
|---|---|---|
| 管理对象 | 一个 profile 内部的插件行 | profile 本身（定义）+ 它的运行实例 |
| 视角 | 插件视角 | **实例视角**（Profile=定义 / Instance=运行） |
| 形态 | Web 面板为主 | **CLI（M1）+ 插件/面板（M2）三皮一心**（见 §3） |
| 稳定性策略 | 依赖 dsh 内部 API | 只消费 CLI 表面与文件格式，rc 升级免疫 |

### 2.1 双层管理与 P0 功能范围

| 层 | P0 功能 | 命令 |
|---|---|---|
| **Profile 层（定义管理）** | ① 显示本机 profile；③ 从文件安装 profile 及其包 / 删除 profile | `list` / `show` / `import` / `export` / `delete` |
| **Instance 层（运行管理）** | ② 启动、关闭 profile 的运行实例 | `start` / `stop` / `restart` / `status` |
| P1（后续） | profile 内 plugin 管理 | `plugin`（透传官方） |

## 3. 核心架构决策：三皮一心

### 3.1 结论与 M1 范围

**核心逻辑做成纯库，三个外壳共用同一份核心**：CLI（脚本/无头）、Cordis 插件（交互/模型可见/面板）。**M1 只交付 core + CLI；插件形态 M2 紧随**（"管理器即实例"招牌 M2 才亮相，M1 README 标注 roadmap）。

```
packages/
├── core/      纯 TS 库，零 Cordis 依赖：注册表读取、进程生命周期、端口探活、
│              形态分类、脚手架、校验。全部逻辑的单一事实源。
├── cli/       bin: dshm —— core 的薄壳（list/import/start/stop/...）
└── plugin/    M2 才填（M1 留空壳占位）：Cordis bundle —— ctx.profileManager
              + Web 面板路由 + profile_* 模型工具 + /profile 命令
```

**工程定案**：Node.js ≥20 + TypeScript + pnpm workspace；core 唯一运行时依赖 `js-yaml`，cli 加 `commander`（与官方 dsh 同款）；tsc 起步构建。仓库独立位于 `/Users/maque/Suzume_Files/Project/dsh-profile-manager`。

### 3.2 为什么"插件形态"可行

| 需求 | DSH 机制 |
|---|---|
| 读/写其他 profile 的 manifest 与 patch 层 | host 插件是受信代码，直接 `node:fs` 访问 `$DSH_HOME/profiles/*` |
| 启动/停止其他 profile | `ctx.subprocess`（spawn `dsh --profile x ...`）+ PID 管理 |
| 探活 | 对端口发 HTTP 请求 / 进程存活检查 |
| 管理面板 | `ctx.webServer.register(route)` 注册 `/profile-manager` 路由 |
| 让 agent 也能管理 profile | `ctx.tools` 注册 `profile_*` 模型工具 |
| 人类命令 | `ctx.commands` 注册 `/profile` 命令 |

插件形态独有的三大价值：**① agent 可管理**（管理动作成为模型工具，可组合进复杂任务）；**② 常驻守护/条件触发**（看门狗、崩溃拉起——CLI 是被调度者，插件是守护者）；**③ 对小白零安装零命令**，复用 DSH 自身审批/权限框架，dsh web 在远程则面板也在远程。

### 3.3 为什么不能"只"是插件（自举边界）

1. **自举**：插件必须寄生在已运行的进程里，无法启动"第一个实例"；
2. **离线救援**：目标 profile 配置损坏起不来时，没有进程可挂插件；
3. **脚本化/CI**：一行 `dshm start writing` 必须能进 cron/CI。

**CLI 是地面，插件是天空**——共享 core，缺一不可。

### 3.4 管理器本身 = 一个 profile 定义组成的实例

**dshm 不引入任何特殊一等对象：管理器自己就是一个普通 profile。** `manager` profile = `dsh-base + dsh-web-app + dsh-profile-manager`，其运行实例在 `dshm list` 里是普通一行。由此获得：注册表零特判、**管理器互相监督**（manager-B 监督 manager-A，零新机制）、**自我升级 = 管理自己的组合数据**、自描述（`dshm show manager` 与他人一致）。

### 3.5 自举边界（精确到最小面）

| 操作 | manager 实例自身能否执行 | 谁来完成 |
|---|---|---|
| 冷启动 manager | 否 | CLI `dshm bootstrap`（= create manager + start + 注册），或另一 manager 实例 |
| 停止 manager | 能（优雅 self-stop） | 自己或任何 manager 实例 |
| 重启 manager | 否（stop 可、start 不可） | CLI / 看门狗 manager / systemd |
| 修改 manager 的 patch 层 | 只读（自保规则，见 §7.3 三档表） | 与修改任何 profile 同一语义 |

**结论：唯一不可消去的进程外动作是"第一次启动"。**

## 4. 概念模型：Profile（定义）与 Instance（运行）

**Profile 是 DSH 官方概念，指定义；Instance 是 dshm 引入的新概念，指运行。** "profile 只是进程的插件清单吗？"——不是：profile 是静态定义（菜谱目录），进程是运行态。关系是 **1 个 profile : 0~N 个 Instance**：

```text
profiles/writing/（定义，永远一份）──▶ 未启动 = 0 个实例
                                 ├─▶ Instance writing-1（:3082, PID 43190）
                                 └─▶ Instance writing-2（:3083, PID 44567）同一菜谱开两桌
```

- **Profile（定义态）**：`$DSH_HOME/profiles/<name>` 目录（bundles + 依赖 + 用户 patch 层）。Profile 层命令：`list` / `show` / `import` / `export` / `delete`。
- **Instance（运行态）**：一个正在运行的 profile 进程。**标识 = `<profile>-<n>`**（稳定序号；端口只是 web 实例的一个属性，非 web 实例无端口）。Instance 层命令：`start` / `stop` / `restart` / `status`。
- **实例形态分类（按能力，不枚举界面）**——读 bundles 判定：

| 形态 | 判定（bundles 含） | 管理方式 |
|---|---|---|
| web 实例 | `@deepseek-ai/dsh-web-app` | 完整生命周期：detach + 端口 + HTTP 探活 |
| 一次性 | `@deepseek-ai/dsh-headless` | 拒绝 `start`，指引用官方 `dsh --profile headless "任务"` |
| 通用实例 | 两者皆无（cc-tui、CLI、REPL、未来任何形态） | 进程级管理：存活 = 进程存在；detach 失败自诊断并指路 `--foreground` |

客户端（Electron/Tauri 壳）**不是 profile**，不在管理范围——它连接的就是 web 实例的端口，管好端口即服务所有客户端。**按能力分类**意味着未来社区出现任何新形态 profile，dshm 零改动即可管理。

- **状态机**（属于 Instance）：

```
defined ──start──▶ starting ──探活通过──▶ running ──stop──▶ stopping ──▶ stopped
   │                  │(超时/崩溃)            │(进程消失/端口失联)
   └── create/edit ◀──┴──▶ broken ◀──────────┘
```

`broken` = 注册表有记录但进程探不到且 PID 已死：`dshm doctor` 分类为"崩溃残留/被外部杀掉/端口被占用"。

## 5. 数据设计：profiles 目录是唯一事实源

**不建第二个"profile 数据库"**：官方 `dsh plugin`、手工编辑、任何第三方工具对 `profiles/*/package.json` 的修改，dshm 必须立即可见，反之亦然——以目录为库才能零漂移。dshm 只维护**运行态缓存**（官方不管的那部分）：

```yaml
# $DSH_HOME/profile-manager/runtime.yaml（dshm 私有，可随时删除重建）
defaultProfile: web
instances:                              # key = <profile>-<n>
  writing-1:
    shape: web                          # web | generic（headless 不登记）
    port: 3082                          # 仅 web 实例有
    pid: 43190
    startedAt: 2026-08-14T20:31:00Z
    dshHome: /Users/maque/.dsh          # 默认继承
    logFile: /Users/maque/.dsh/profile-manager/logs/writing.log
  cc-tui-1:
    shape: generic
    pid: 45012
    startedAt: 2026-08-14T21:00:00Z
    dshHome: /Users/maque/.dsh
    logFile: /Users/maque/.dsh/profile-manager/logs/cc-tui.log
```

- 定义态数据一律读 `profiles/<name>/package.json` 与 `cordis.patch.yml` 摘要；
- **探活是最终真相来源，缓存只是加速**——缓存丢失时 `dshm list` 靠端口/进程探活恢复真相；
- 每个 manager 实例通过比对识别"列表中的自己"，面板标注自我行并施加 §3.5 限制。

## 6. CLI 命令面（M1 = P0 范围）

```text
【Profile 层 · 定义管理】——功能①③
dshm list                          # 全部 profile：别名 | 形态标签(web/tui/headless/other) | bundles 摘要 | 实例状态
dshm show <name>                   # 明细：manifest + patch 层 + 依赖 + dump-config 摘要
dshm import <文件> [--name N]      # 从 dshm-profile.yaml 安装 profile 及其全部包（见 §6.1）
dshm export <name> [-o 文件]       # 反向导出同一格式（备份/分享/迁移）
dshm delete <name> [--purge]       # 删除：默认归档，--purge 真删（见 §7.5）

【Instance 层 · 运行管理】——功能②
dshm start <name> [--port N] [--foreground]
                                   # 多开默认拒绝（已有运行实例时报错），显式 --port 才开第二实例
dshm stop <name> [--port N]        # 不指定端口 = 关闭该 profile 全部实例
dshm restart <name> [--port N]
dshm status [<name>]               # web: HTTP 状态/端口；generic: 进程存活/运行时长/日志尾部

【辅助】
dshm doctor                        # 一致性诊断、残留 PID、端口冲突、启动失败日志分析、归档清单
dshm bootstrap [--port N]          # 唯一进程外自举：create manager profile + start + 注册
dshm --profile <name> ...          # 全局别名，省略每命令的 <name>

【P1（后续，profile 内 plugin 管理）】
dshm plugin <name> <pnpm args...>  # 透传 dsh plugin --profile
```

设计原则：**所有能透传官方 CLI 的操作一律透传**。`--port` 仅 web 实例有效（generic 警告并忽略）。

### 6.1 Profile 定义文件（import/export 载体）

`dshm-profile.yaml` 是官方三件套的**声明式前端**——导入结果与手工创建完全等价，导入后官方一切操作照常。

```yaml
# dshm-profile.yaml —— profile 定义文件（导入/导出共用）
dshmProfile: 1                  # 格式版本

name: writing                   # profile 名（= $DSH_HOME/profiles/<name>）

bundles:                        # 有序 bundle 列表（= dsh.profile.bundles，顺序有意义）
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'

dependencies:                   # 与官方 package.json 的 dependencies 完全同构（映射）
  dsh-news-briefing: ^1.0.0     # npm 版本范围 / github: / file: / link: 语法全支持
  some-bundle: github:owner/some-bundle#v0.2.0

patch: |                        # 内嵌用户层（原样写入 cordis.patch.yml）
  - insert:
      - id: ui-topbar
        name: 'dsh-ui-topbar-compact'

meta:                           # 可选，仅 dshm 使用，官方无视
  description: 写作助手实例
  port: 3082                    # 建议端口（端口链第 3 优先级，可被 --port 覆盖）
```

`import` 执行序列（幂等、失败可重试）：

1. **预检**：pnpm 在 PATH；name 合法且不冲突（已存在 → 拒绝，除非 `--force`；`--force` 对运行中 profile 先要求 stop）；bundles 非空；dependencies 中若写了内置三件套（dsh-base/dsh-web-app/dsh-headless）→ 警告并剔除（内置 bundle 由安装目录解析，不该被 pnpm 装副本）；
2. 写官方三件套：`package.json`（bundles 保序 + dependencies 原样）、`cordis.patch.yml`（patch 字段）、`pnpm-workspace.yaml`；
3. 透传 `dsh plugin --profile <name> install`（pnpm 装包 + 官方 bundle 对账；对账自带查重——bundles 已列的不会重复追加，漏列的自动补上）；pnpm 输出**原样透传**；git 依赖被 pnpm allowBuilds 拦截时高亮官方提示并提供 `--allow-builds` 代写；
4. 验证：`dsh <name> --dump-config` 必须成功；
5. 失败 → **整个新目录回滚删除**（新建语义：全成或全无）；成功 → 登记 meta（建议端口等）。

`export <name>` 是镜像：读官方三件套反向生成同格式（patch 原样导出，meta 从 runtime 补回）。**导出文件可原样导入另一台机器**。M2+ 再支持"导入 profile 目录打包文件（tarball）"。

## 7. 关键机制设计

### 7.1 实例启动/关闭（按形态分支）

**端口分配链（仅 web 实例）**：显式 `--port` > 该 profile 上次端口（runtime）> meta.port（导入建议）> 从 **3081** 起线性找空（bind 测试；**避让官方默认 3080**）。不搞 profile↔端口固定映射。多开默认拒绝（有运行实例时报错），显式 `--port` 才开第二实例。

**web 实例**：spawn `dsh --profile <name> web --port N`，detached（跨平台封装在 core；Windows 用 windowsHide + cmd shim），stdio 重定向 `logs/<name>.log`；就绪判定 = HTTP 探活 `127.0.0.1:<port>/`，指数退避，默认 30s 超时 → 标记 `broken` 并把日志尾部打进错误。

**通用实例**（cc-tui 等）：无端口参数；`--foreground` = 在当前终端前台跑、dshm 只登记；默认 detach（stdio 进日志）→ 进程秒退（无 TTY 崩溃）时**自诊断报错**：给日志尾部 + 提示"该 profile 需要终端，请用 --foreground"。存活判定 = `kill(pid, 0)`。

**headless**：拒绝 `start`，提示用官方 `dsh --profile headless "任务"`。

**stop 序列（全部形态统一）**：

```text
1. 向 PID 发 SIGTERM（Windows: taskkill 等价物）
2. 轮询最多 8 秒（官方优雅关闭 5 秒 + 余量）→ 退出 → 报告"已优雅停止"
3. 超时仍活 → SIGKILL 强杀 → 报告"强制终止（优雅停止超时）"（明说，不假装优雅）
4. runtime 注销、日志保留供 doctor 分析
```

启动失败回滚：不留 runtime 记录或标记 `broken`，**绝不静默**。

### 7.2 DSH_HOME 与隔离

- 默认继承当前环境 `DSH_HOME`；`dshm start <name> --dsh-home <dir>` 为实例指定独立 home；
- dshm 自身所有命令尊重 `DSH_HOME` 环境变量；
- **测试纪律（铁律）**：开发与集成测试一律用临时/独立 `DSH_HOME`（如 `~/.dsh-dev` 或 mktemp），**绝不碰真实 `~/.dsh`**（含密钥与会话）。

### 7.3 修改"正在运行的 profile"——三档规则

官方行为的事实：改 `cordis.patch.yml` → 运行中实例**热生效**（启动器 watch-only HMR 事务性重组）；改 `package.json` → **需重启**；web 的模块级代码热更新官方**主动禁用**（bundle patch 里 `hmr: disabled`，TODO 注释）。**对外契约：配置热、装包冷**——与官方一致，管理器承诺不超过平台能力。

| 改什么 | 运行中实例反应 | dshm 行为 |
|---|---|---|
| `cordis.patch.yml`（改配置/启停已装插件行） | 热更新即时生效 | 允许；提示"已热更新" |
| `package.json`（bundles/依赖） | 不生效 | 允许；提示"重启后生效——是否现在 restart？" |
| 插件形态改"自己所在的 profile" | — | **只读**（防自毁） |

此政策属 **P1 细化**；P0 只保留两条安全线：`delete` 拒绝运行中实例（§7.5）；`import --force` 覆盖运行中 profile 先要求 stop。

### 7.4 安全与权限

- dshm 不代理、不缓存凭据；子进程从环境/`$DSH_HOME/.credentials.yaml` 自然继承；
- 插件形态写操作受 DSH 审批/权限框架约束；CLI 形态由 OS 文件权限约束。

### 7.5 删除与归档语义

- 前置：运行中实例 → 拒绝（提示先 stop，或 `--force` 先停后删）；
- **默认归档**：移到 `$DSH_HOME/profile-manager/archive/<name>-<时间戳>/`（doctor 可列出，还原 = 移回 `profiles/`）；`--purge` 真删；
- 明确告知：删除 profile **不影响会话记录**（sessions 独立——删菜谱不删账本）；
- 打印将删/移动的路径清单，需确认（`--yes` 跳过）。

## 8. 兼容性策略（preview 期生存之道）

1. **只消费稳定表面**：CLI 语法、`$DSH_HOME` 布局、`dsh.profile` manifest 字段、`cordis.patch.yml` 结构——任何"猜测内部实现"都算 bug；
2. **版本探测**：读 `dsh --version`，未测试版本打"未验证"警告（不阻塞）；core 维护 `KNOWN_VERSIONS` 矩阵；
3. **CI 双轨**：pinned rc 与 latest 都跑集成测试（临时 DSH_HOME：import → start → 探活 → stop → delete）；
4. **升级路径**：官方若新增 profile 子命令，dshm 对应命令优先透传官方实现。

## 9. 里程碑

| 里程碑 | 内容 | 验收 | 预估 |
|---|---|---|---|
| M0 设计评审 | 双层模型 + Instance 概念 + 定义文件格式 + 14 项决策 | **已完成（2026-08-15）** | — |
| M1 CLI MVP（P0） | core + cli：`list/show/import/export/delete` + `start/stop/restart/status` + `doctor`；形态分类 + 端口链 + 归档 | 本机真实环境：列出 web/cc-tui；import 建新 profile 并启动；stop；delete 归档；cc-tui 通用实例路径跑通 | 3-4 天 |
| M2 插件形态 | plugin bundle：ctx.profileManager + 面板 + profile_* 工具 + /profile 命令；manager profile 模板 + bootstrap | 面板完成 P0 全操作；agent 能用工具管理；manager 与目标同构显示 | 3-5 天 |
| M3 打磨与发布 | 双语 README、doctor 强化、Windows 实测、npm 发布 + topic + awesome 收录 | 2-3 个外部用户跑通并反馈（M1 成功标准） | 2-3 天 |
| P1（后续） | profile 内 plugin 管理（透传 `dsh plugin` + 面板化 + §7.3 三档规则细化） | 与官方 plugin 命令行为一致 | 待定 |

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 官方内置 profile 管理，产品被吸收 | 差异化押注官方不会做的：headless/CI 编排、多机同步、实例视角；保持 CLI 薄、随时透传官方新能力 |
| rc API 变动破坏工具 | §8 的"只消费表面 + 版本探测 + 双轨 CI" |
| 市场过小，无人用 | 早期只投 1 周量级；定位"官方 CLI 的补全层"；doctor（启动失败可诊断）是刚需钩子 |
| 插件形态与官方热更新机制冲突 | §7.3 三档规则（自身只读）+ 文档化 |
| MAXeaglet/dataelement 转向此赛道 | 观察信号；以"库+CLI+插件"开源组件形态共存（他们可依赖我们的 core） |

## 11. 决策记录（2026-08-15 grilling 定案，共 14 项）

1. 定位：开源、服务 dsh 社区；M1 成功标准 = 2-3 个外部用户跑通并反馈；
2. M1 只发 core + CLI；插件形态 M2；README 标注 roadmap；
3. 命名：仓库/npm 包 `dsh-profile-manager`、命令 `dshm`、标语 "Profiles as instances"；topic `dsh-plugin`；
4. 工程：Node ≥20 + TS + pnpm workspace；`packages/{core,cli,plugin}`；core 仅 js-yaml、cli 加 commander；tsc；仓库独立于 `/Users/maque/Suzume_Files/Project/dsh-profile-manager`；
5. 形态分类：按 bundles 判 web / headless / 通用三类；客户端不在范围；list 加形态标签；--port 仅 web 有效；
6. 实例标识 `<profile>-<n>`；多开默认拒绝，显式 --port 才开第二实例；
7. 端口链：--port > 上次 > meta.port > 3081 起找空（避让 3080）；不搞固定映射；
8. import 格式：dshm-profile.yaml 合订本，dependencies 与官方 package.json 同构；M2+ 支持 tarball；
9. 安装透传官方 dsh plugin install：pnpm 预检、allowBuilds 高亮 + 代写、失败整目录回滚、内置三件套剔除、对账查重官方已处理；
10. delete 默认归档，--purge 真删；运行中拒绝；不碰 sessions；
11. 修改运行中 profile 三档规则（热/patch、冷/package.json、插件自身只读）；P0 两条安全线；
12. stop 序列：SIGTERM → ≤8s → SIGKILL 明说；
13. 测试：vitest；集成测试一律临时 DSH_HOME（绝不碰真实 ~/.dsh）；真机验收 web+cc-tui 两形态；CI 双轨；
14. 发布：npm 0.1.0、README 注明适配 dsh 0.1.0-rc.x。

**已关闭的旧未决项**：switch/默认 profile 从 M1 移除（需要时再加）；看门狗预设不内置（保证"可被管理"即可）；dshm bootstrap 语义 = create manager + start + 注册的组合命令。

## 12. 遗留与后续

- P1：plugin 管理 + §7.3 细化；
- M2：插件形态（manager profile、bootstrap、面板、profile_* 工具）；
- M2+：tarball 导入、看门狗预设、多机同步、远程管理（观察社区需求再排）。
