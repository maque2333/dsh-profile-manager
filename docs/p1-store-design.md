# P1 阶段 C 设计：完整 plugin store（四入口全套）

> 状态：**草案，供人类确认后开工**。定位：社区 store（dsh-plugin-store / dsh-plugin-hub）只有 Web UI，缺 CLI / agent / 独立面板；本方案做「完整全套」——**CLI + 独立 webUI + agent 工具 + 官方 webUI 插件**，四入口共享同一套 core 逻辑。

## 1. 目标与范围

一个 plugin store，四个入口全覆盖：

| 入口 | 形态 | 给谁 |
|---|---|---|
| CLI | `dshm plugin search / info / install` | 终端 / 脚本 / CI |
| 独立 webUI | 我们自己的 `/profile-manager` 面板加「商店」区 | 用我们面板的人 |
| agent 友好界面 | `profile_plugin_search / info / install` 工具 | AI agent |
| 官方 webUI 插件 | 官方「设置 → 插件」里的商店 tab（`settings.plugins.tab` slot） | 用官方界面的人 |

## 2. 架构（延续「三皮一心」）

```
core/src/store.ts          ← 唯一逻辑：搜索 + 详情 + 安装透传
   ├── searchPlugins(keyword)         # 搜 GitHub dsh-plugin topic + npm，合并去重
   ├── pluginDetails(source)          # 单个插件的元数据
   └── installPlugin(home, profile, source)  # 透传 dsh plugin add

四个薄壳：
   ├── CLI（cli.ts）             → plugin search / info / install 子命令
   ├── 面板（panel.ts + client） → /plugin/search 等路由 + 商店区 UI
   ├── 工具（tools.ts）          → profile_plugin_search / info / install
   └── 官方插件（client bundle） → settings.plugins.tab slot 注入商店 tab
```

## 3. 数据源（两路）

| 源 | API | 内容 |
|---|---|---|
| **GitHub `dsh-plugin` topic** | `GET /search/repositories?q=topic:dsh-plugin+<关键词>` | 3191 个社区插件（主源） |
| **npm** | `GET /-/v1/search?text=<关键词>` | 发布到 npm 的 dsh 插件（辅源，含官方 `@deepseek-ai/dsh-*`） |

- 搜索结果字段：`name`、`description`、`source`（`github:owner/repo` 或 npm 名）、`stars`、`url`；
- 安装统一走 `dsh plugin add <source>`（阶段 A 已有统一安装接口）。

## 4. 四个入口的功能清单

### CLI
```sh
dshm plugin search <关键词>            # 搜插件，打印 name/source/description/stars
dshm plugin info <来源>                # 单个插件详情（README 摘要 / 仓库 / 版本）
dshm plugin install <profile> <来源>   # 安装到指定 profile（透传 dsh plugin add）
```

### 独立 webUI（/profile-manager）
- 顶部加「商店」区：搜索框 + 结果列表（名称/描述/stars + 「安装到…」按钮）；
- 安装目标 = 选一个已有 profile（下拉），或新建 profile 再装。

### agent 工具
```
profile_plugin_search(keyword)          # 搜索插件，返回结构化列表
profile_plugin_info(source)             # 单个插件详情
profile_plugin_install(profile, source) # 安装
```

### 官方 webUI 插件（C2）
- 给我们的 bundle 加 **client 面**（`dsh.client`），用官方 `ctx.slots.inject('settings.plugins.tab', ...)` 往官方「设置 → 插件」注入一个「商店」tab；
- tab 内容 = 与独立面板共用的 React 组件（搜索 + 安装）。

## 5. 核心逻辑（core/store.ts）

| 函数 | 职责 | 说明 |
|---|---|---|
| `searchPlugins(keyword, options)` | 并发查 GitHub + npm，合并去重排序 | 网络走 `node:https`（core 已有 spawn 但无 HTTP 客户端，需新增，零依赖用内置 `fetch`/`https`） |
| `pluginDetails(source)` | 解析来源 → 拉单个插件元数据 | github 走 API，npm 走 registry |
| `installPlugin(home, profile, source)` | 透传 `dsh plugin add <source>` | 复用阶段 A 的 `pluginAddRemove` |

## 6. 分阶段任务清单

### C1：core + CLI + 独立面板 + agent 工具（先做）

| 任务 | 内容 | 验收 |
|---|---|---|
| C1.1 core `store.ts` | `searchPlugins` / `pluginDetails` / `installPlugin`（内置 `fetch`，零新依赖） | 单测：mock 或真实调 GitHub/npm 搜索返回结构化列表 |
| C1.2 CLI | `plugin search / info / install` 子命令 | `dshm plugin search "news"` 打印插件列表；`install` 透传成功 |
| C1.3 面板 | `/plugin/search`、`/plugin/info` 路由 + 前端商店区（搜索框/结果/安装） | curl 搜索 API 返回结果；浏览器商店区可搜索安装 |
| C1.4 工具 | `profile_plugin_search / info / install` | headless agent 调 `profile_plugin_search` 返回结果 |
| C1.5 测试 | core store 单测 + CLI 往返 | 全量 `pnpm run check` 全绿 |

### C2：官方 webUI 插件（后做，新的大块）

| 任务 | 内容 | 验收 |
|---|---|---|
| C2.1 取证 | 读官方 `ui-settings-plugins` 的 `settings.plugins.tab` slot 确切 API（`SlotSpec`/`SlotMap` 结构、`ctx.slots.inject` 用法） | 拿到可照抄的最小 slot 注册模板 |
| C2.2 client bundle | 给 cli 包加 `dsh.client` 面 + client 入口，复用独立面板的商店 React 组件 | 官方 web 设置里出现「商店」tab，可搜索安装 |
| C2.3 验证 | 官方 webUI 里验证 tab 名册/交互/卸载 | 从零安装后官方界面商店 tab 闭环 |

## 7. 验收标准（全套）

1. **四入口都能搜索 → 看详情 → 安装到指定 profile**；
2. 安装走统一接口（`dsh plugin add`），错误透明、装包冷提示；
3. 全量测试全绿；临时 DSH_HOME 验证（含 GitHub/npm 网络搜索，网络受限时跳过并标注）；
4. 官方 webUI 插件在真实浏览器里 tab 闭环（C2）。

## 8. 待确认（拍板后开工）

1. **数据源是否就这两路**（GitHub topic + npm），还是先只做 GitHub topic（社区插件主战场、实现简单）？
2. **搜索结果默认条数 / 排序**（stars 降序？最新？）；
3. **C1/C2 分步**是否 OK（先 C1 拿到「三入口可用」的 store，再 C2 补官方 webUI 那一层）？
4. **store 是否写进独立文档**（本文件 `p1-store-design.md`），还是并入 `p1-plugin-design.md`？
