# M2 插件形态 · 官方 API 契约（取证稿）

> 状态：**待人类审阅**。本文档是 M2 动工前的门禁——每条要用的 `ctx.*` 扩展点都给出官方签名与出处，实现代码不得偏离。
> 取证源：官方 checkout `/tmp/dsh-repo` @ `47f9438`；已装 `@deepseek-ai/dsh@0.1.0-rc.6`。
> 铁律提醒：**plugin 包是唯一允许按官方扩展点使用 `ctx.*` 的地方**；core 仍只消费官方表面（CLI + `$DSH_HOME` 文件）。

---

## 1. 结论速览：M2 要用哪些扩展点

| dshm 需求 | 官方扩展点 | 出处（`/tmp/dsh-repo` 内路径） |
|---|---|---|
| `profile_*` 模型工具 | `ctx.tools.register(defineTool(...))` | `packages/core/tools/src/{index,schema}.ts` |
| `/profile` 人类命令 | `ctx.commands.register(...)` | `packages/interaction/commands/src/index.ts` |
| `/profile-manager` 面板路由 | `ctx.webServer.register(...)` | `packages/host/webserver/src/index.ts` |
| 启动/停止 profile 子进程 | `ctx.subprocess.spawn(...)` + `handle.terminate()` | `packages/subprocess/subprocess/src/{index,types}.ts` |
| 解析 `DSH_HOME` | **复用 core 的 `resolveDshHome()`** | 本项目 `packages/core/src/paths.ts` |

> 结论：DESIGN §3.2 列出的五个接缝（读/写 manifest、启动/停止、探活、面板路由、模型工具）**全部有官方稳定扩展点支撑**，M2 技术上完全可行。

---

## 2. bundle 契约：一个包可同时是 host + client

`dsh` 官方把插件包分成两种声明，**一个 package.json 可以同时声明两种**（这正是 dshm 需要的「面板 + 工具」双面形态）：

### 2.1 host bundle（`dsh.bundle.patch`）

出处：`packages/bundle/base/package.json`、`packages/bundle/web-app/package.json`。

```jsonc
{
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "cordis.patch.yml", "lib/types/**/*.d.ts"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

`cordis.patch.yml` 必须是**顶层数组**，每个 bundle 用 `insert` 往里插 host 行：

出处：`packages/bundle/base/cordis.patch.yml`（451 行）、`packages/bundle/web-app/cordis.patch.yml`（424 行）。

```yaml
- insert:
    - id: dsh-profile-manager        # 行 id，供后续 patch / 用户层寻址
      name: '@dsh-profile-manager/plugin'   # 实际 npm 包名（host 入口）
      config: {}                     # 可选，插件的 cordis Config
```

> 语义：`dsh.profile.bundles` 按顺序把每个 bundle 的 patch 叠到空根上，再叠用户 `cordis.patch.yml`。**行顺序不影响加载**（激活由服务依赖驱动），id 用于让后续层覆盖该行 `config`。

### 2.2 client bundle（`dsh.client`）

出处：`packages/client/ui-theme/package.json`（权威字段是 `dsh.client`，**不是**旧的顶层 `dshClient`）。

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale"
      ],
      "platform": "web",
      "immediately": true
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-connection": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "react": "^18.2.0"
  }
}
```

### 2.3 dshm 的形态（host + client 双面）

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },   // host：profile_* 工具 + /profile 命令 + ctx.profileManager
  "client": { "platform": "web", "inject": [] }   // client：/profile-manager 面板
}
```

---

## 3. host 插件形态

出处：`docs/cordis-tutorial/01-first-plugin.md`。底层是 Cordis（`@deepseek-ai/cordis`），插件是一个模块，命名导出：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-profile-manager'   // 可选，诊断显示用

export function apply(ctx: Context) {
  // 在这里注册一切贡献：工具 / 命令 / 路由 / 服务
}
```

- 需要注入服务时导出 `inject`（声明所需 service 键），例如需要 webServer / tools / commands / subprocess。
- **route / listener / timer / DOM 都要 effect-owned 并返回 disposer**（skill §4）：用 `ctx.effect(() => { const dispose = ctx.webServer.register(...); return dispose })` 包裹，避免泄漏。

---

## 4. 各扩展点签名 + 最小用法模板

### 4.1 模型工具 `ctx.tools` + `defineTool`

出处：`packages/core/tools/src/index.ts`（`register` 第 1037 行）、`packages/core/tools/src/schema.ts`（`defineTool` 第 545 行）；真实例子 `packages/schedule/schedule/src/tools.ts`。

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

ctx.tools.register(defineTool({
  name: 'profile_list',
  description: '列出本机全部 profile 及其运行实例状态……',   // 写清使用时机、输入、失败方式
  parameters: {                                            // JSON Schema 风格
    dshHome: { type: 'string', description: '可选，独立 DSH_HOME' },
  },
  output: {
    schema: { type: 'object', /* canonical 输出 schema */ },
    render: (_args, value): ContentBlock[] => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args, exec): Promise<JsonValue> {
    // exec.agent / exec.signal 可用；返回 canonical JSON 值（必须符合 output.schema）
    return service.list()
  },
}))
```

关键点：
- `register(definition): () => void` 返回 disposer；**全局 `ctx.tools.register` 即可让所有 agent 看到该工具**（scoped 版本是挂在 agent context 下，会 shadow 全局）。
- `parameters` 与 `output.schema` 都是 JSON Schema；`output.render` 把 canonical 值投影成模型可见的 `ContentBlock[]`。
- `execute` 必须观察 `exec.signal`；工具名不可用保留名 `run_code`。

### 4.2 人类命令 `ctx.commands`

出处：`packages/interaction/commands/src/index.ts`（`CommandDefinition` 第 40 行、`register` 第 245 行）。

```ts
ctx.commands.register({
  name: 'profile',                    // 无 `/` 前缀，小写，[a-z][a-z0-9_-]*
  description: '管理 DSH profile 与运行实例',
  input: { hint: 'list | start <name> | stop <name> | ...' },
  handler: (invocation) => {
    // invocation = { commandId, agent, rawInput, signal }
    return { kind: 'success', text: '...' }   // 或 { kind: 'error', text: '...' }
  },
})
```

关键点（**重要限制**）：
- `handler` 返回 `CommandResult` = `{ kind: 'success', text? }` 或 `{ kind: 'error', text }`。
- 命令走「人类命令面」，**不进入模型历史、不产生 session 事件**；`rawInput` 是 `/profile` 之后保留空白的原文，后续语法由命令自己解析。
- **只有 TUI（终端界面）消费命令面**：ACP automation server、headless CLI、JSON-RPC SDK、Web 均不暴露 `/` 命令。→ **`/profile` 命令只在 TUI 形态有效；Web 面板形态靠面板 + 工具，不靠命令。**

### 4.3 面板路由 `ctx.webServer`

出处：`packages/host/webserver/src/index.ts`（`WebRoute` 第 28 行、`register` 第 94 行）。

```ts
import type { IncomingMessage, ServerResponse } from 'node:http'

ctx.webServer.register({
  kind: 'prefix',                     // 'exact' 精确匹配 / 'prefix' 前缀匹配
  path: '/profile-manager',           // 绝对路径名，无尾斜杠
  handler: (req: IncomingMessage, res: ServerResponse) => {
    // 拥有完整响应生命周期（可 SSE 保持连接）
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('...')
  },
})
```

关键点：
- `register` 返回 disposer；重复 `(kind, path)` 抛错（组合级契约）。
- **命名路由优先于 fallback**。Web 实例的 fallback 由 `@deepseek-ai/dsh-host-frontend-static` 持有，服务前端 SPA（对话界面）。
- → 因此 `manager` 实例打开 `/` 是对话 SPA，打开 `/profile-manager` 是我们的面板；两者共存，无需「关掉」对话页。
- 还有 `registerUpgrade`（WebSocket）、`registerFallback`（唯一 fallback 席位）、`tapIndex`（注入 index.html 变换）——面板初版用不到。

### 4.4 子进程 `ctx.subprocess`

出处：`packages/subprocess/subprocess/src/index.ts`（`SubprocessRuntime` 第 102 行）、`types.ts`（`SubprocessSpawnSpec` 第 75 行、`SubprocessHandle` 第 167 行）。

```ts
const handle = ctx.subprocess.spawn({
  argv: ['dsh', '--profile', name, 'web', '--port', String(port)],
  cwd: process.cwd(),
  stdio: { stdin: 'ignore', stdout: 'collect', stderr: 'collect' },
  graceMs: 8000,                 // SIGTERM → 8s → SIGKILL 升级窗口
  env: { ...process.env, DSH_HOME: home },
  signal: abortSignal,           // 可选：abort 即触发 terminate 升级
})

handle.pid                        // 进程树根 pid（-1 = spawn 失败）
handle.collected.stdout?.readFrom(0)  // 增量读日志（含 spill 文件）
handle.done                       // Promise<{ exitCode, signal }>
handle.terminate()                // SIGTERM → graceMs → SIGKILL（Windows: taskkill /T）
handle.waitForExit(signal)        // 等进程树真正退出
```

关键点（**与 core stop 语义天然一致**）：
- `terminate()` 是「SIGTERM → `graceMs` → SIGKILL」的**树级**终止（Windows `taskkill /T`），正是 DESIGN §7.1 的 stop 序列。插件形态 spawn 时把 `graceMs` 设 8000 即可复用官方语义。
- `SubprocessSpawnSpec.env` 会先「清洗」父环境再合并（字符串 = 显式保留；`undefined` = 抹掉）；跨 profile 启动时 `DSH_HOME` 必须显式传。
- **待定决策（见 §6）**：插件形态的 spawn 底层，是走 `ctx.subprocess`（sandbox-aware、树级终止），还是复用 core 已有的 `process.ts`（纯 `node:child_process` 跨平台封装）。

---

## 5. 关键发现与限制（取证新增，需并入设计认知）

1. **`/profile` 命令只 TUI 消费** —— 与 DESIGN §3.2「`ctx.commands` 注册 `/profile` 命令」无冲突，但**面板形态没有命令面**。M2 的 Web 面板必须靠面板 UI + `profile_*` 工具，不能依赖 `/profile` 命令。
2. **`ctx.tools` 全局注册即对所有 agent 可见** —— 无需为每个 agent 单独挂载（schedule 的例子是 agent-scoped 特例）。
3. **`ctx.subprocess.terminate()` 已内置「优雅停→强杀」** —— 与 core 的 stop 语义一致，不需要插件层重写终止逻辑。
4. **`manager` 实例默认首页 = 对话 SPA** —— 面板是命名路由 `/profile-manager`，与对话页共存。要「打开就是纯面板」需额外做前端重定向/首页替换（属于体验优化，非阻塞）。
5. **DSH_HOME 无单一 `ctx.dshHome` 服务** —— 官方以 `dshHome` 配置字段散落在 settings 等插件里；host 插件是受信代码，直接复用 core 的 `resolveDshHome()`（读 `process.env.DSH_HOME`，兜底 `~/.dsh`）。

---

## 6. 待定决策（需人类拍板，取证阶段不写实现）

| # | 决策点 | 选项 | 倾向 |
|---|---|---|---|
| D1 | 插件形态的子进程底层 | (a) 用 `ctx.subprocess`（sandbox-aware、树级终止）<br>(b) 复用 core `process.ts`（`node:child_process`） | **先 (b) 复用 core**（core 是唯一事实源、跨平台已封装；`ctx.subprocess` 作为后续增强） |
| D2 | client 面板是否加 slot 入口 | (a) 仅独立路由页 `/profile-manager`<br>(b) 再加 conversation slot 入口按钮 | **先 (a)**，slot 后续按需 |
| D3 | client 构建工具 | (a) `tsdown`（官方 client 包同款）<br>(b) 纯 `tsc` | **tsdown**（JSX + client bundle 打包） |
| D4 | `manager` 实例首页 | (a) 保持默认对话 SPA，面板走 `/profile-manager`<br>(b) 把面板设为首页 | **先 (a)**，体验优化后续 |

---

## 7. 下一步（取证通过后进入实现）

按执行计划：阶段 1（骨架）→ 阶段 2（host：工具 + 命令 + `ctx.profileManager` 服务）→ 阶段 4（bootstrap）→ 阶段 3（client 面板）→ 阶段 5（验证交接）。阶段 1 起手前先按本契约搭 `packages/plugin` 的双面 package.json + `cordis.patch.yml` + 双 tsc program。
