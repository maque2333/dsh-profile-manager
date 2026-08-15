# P1 设计：profile 内 plugin 管理（草案 v2，待确认）

> 状态：**草案 v2**。定位与调研结论见 §1；阶段计划见 §7（供人类确认后开工）。
> 调研结论：官方自带只读 plugin 清单（`pluginInventory/list`）+ CLI 安装（`dsh plugin add/remove`，透传 pnpm，支持 npm/git/github/file/link）；社区 [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub) 已做单 profile 启停 + GitHub 市场。**我们的差异化 = profile 视角（跨 profile 的 plugin 管理）**。

## 1. 定位与差异化

- plugin 是 profile 的**下层**（承接上下）：先 profile、后 plugin。
- 体验**三处统一**：CLI、面板、agent 工具都用「profile → plugin」层级导航。
- 现有项目做不到：dsh-plugin-hub 寄生在单 profile 内、无 profile 上下文；官方只有只读清单 + CLI 原语。

## 2. 关键洞察：生态里有两层「插件」，用户却都叫插件

| 层次 | 是什么 | 例子 | 能独立跑吗 |
|---|---|---|---|
| **bundle（零件）** | 一个声明 `dsh.bundle.patch` 的 npm 包 | `dsh-cc-tui`、`dsh-news-briefing` | ❌ 必须组合进 profile |
| **profile 组合（成品）** | 一组 bundle 的有序组合 | `web`（base+web-app）、`headless`（base+headless）、用户机器上的 `cc-tui`（base+dsh-cc-tui） | ✅ 开箱即用 |

**cc-tui 案例**：`dsh-cc-tui` 是第三方 bundle（不在官方仓库）；用户机器上的 `cc-tui` profile = `dsh-base + dsh-cc-tui` 的组合。所以「cc-tui 这个插件」实质是 **plugin + profile**。

**对 dshm 的启示**：我们已天然覆盖两个层次——

- 装「成品」= `dshm import <dshm-profile.yaml>`（已有；`cc-tui` 的最自然形态就是一份 `bundles: [dsh-base, dsh-cc-tui]` 的定义文件）；
- 装「零件」= `dshm plugin <profile> add <bundle>`（P1 新增）。

## 3. 数据模型（两个事实源）

| 事实源 | 内容 | 何时可用 |
|---|---|---|
| **定义态**（dshm 读） | profile 的 `package.json`（`dsh.profile.bundles` + `dependencies`）+ `cordis.patch.yml`（`disabled` 停用条目） | 任何时候（不依赖运行） |
| **运行态**（官方 `pluginInventory/list`） | `entryId` / `moduleName` / `enabled` / `fiberPhase`（pending/loading/active/failed/unloading） | 仅 profile 运行中 |

- 列表以**定义态为准**（装了啥、停用了啥）；运行中时叠加运行态（加载状态）。
- 启用/停用 = 写 `cordis.patch.yml` 的 `disabled: true/false`（`id` 定位），HMR 热生效。

## 4. 功能清单（三处 + 两个视图）

### CLI

```sh
dshm create <name>                    # 新建空 profile（起步 = @deepseek-ai/dsh-base）
dshm plugin list [profile]            # 列表：无参数 = 全局汇总；带 profile = 单 profile
dshm plugin add <profile> <pkg>       # 安装（透传 dsh plugin add，统一安装接口）
dshm plugin remove <profile> <pkg>    # 卸载（透传 remove）
dshm plugin enable <profile> <id>     # 启用（阶段 B：写 patch 移除 disabled）
dshm plugin disable <profile> <id>    # 停用（阶段 B：写 patch 加 disabled）
```

### 面板（/profile-manager）

- 全局：新增「插件」总览（plugin → 被哪些 profile 引用）；
- 单 profile：profile 详情下钻「plugin」区，列表 + 加/删/启停按钮。

### agent 工具（profile_* 命名延续）

```
profile_plugin_list(profile?)          # 不带 profile = 全局汇总；带 = 单 profile
profile_plugin_add(profile, pkg)
profile_plugin_remove(profile, pkg)
profile_plugin_enable(profile, id)
profile_plugin_disable(profile, id)
```

## 5. 核心机制

- **列表**：`readProfile`（bundles/dependencies）+ 解析 `cordis.patch.yml` 的 disabled；运行中叠加 `pluginInventory/list`。
- **安装/卸载**：透传 `dsh plugin --profile <name> add/remove`（pnpm，官方自动 reconcile bundles）。**装包冷**——改完提示重启。
- **启用/停用**：写 `cordis.patch.yml`（`disabled: true/false`）。**配置热**——HMR 即时生效。
- **§7.3 三档规则**（P1 细化落地）：

  | 改什么 | 运行中反应 | dshm 行为 |
  |---|---|---|
  | `cordis.patch.yml`（启停） | 热更新 | 允许，提示「已热更新」 |
  | `package.json`（装/卸包） | 冷 | 允许，提示「重启后生效」 |
  | 插件形态改自己所在 profile | — | 只读（沿用 delete/restart 的自保） |

## 6. 承接上下（示例）

```sh
dshm list                       # profile 层
dshm plugin list                # 全局 plugin 层
dshm plugin list writing        # 下钻：writing 的 plugin
dshm plugin add writing dsh-x   # 装零件
dshm import cc-tui.yaml         # 装成品（base + dsh-cc-tui 组合）
dshm start writing              # 回 profile 层启动
```

## 7. 完整阶段计划（供确认）

### 7.1 界面功能对齐矩阵（验收基准）

**每个功能交付的标准 = 4 个交互界面（CLI / 面板 / 工具 / `/profile`）一致覆盖**；`bootstrap` 除外（自举边界，仅 CLI）。

| 功能 | CLI | 面板 | 工具 | /profile |
|---|---|---|---|---|
| list / show / delete / start / stop / status / doctor | ✅ | ✅ | ✅ | ✅ |
| import / export | ✅ | ✅ | ✅ | ⚠️ 阶段 0 补 |
| restart | ✅ | ✅ | ✅ | ⚠️ 阶段 0 补 |
| bootstrap | ✅ | — | — | —（自举边界） |
| create / plugin list / plugin add / plugin remove | A | A | A | A |
| plugin enable / plugin disable | B | B | B | B |

> 表头「面板/工具」= 2/3 界面，「/profile」= 4 界面。每完成一个能力，先对着矩阵勾选，缺一处即未交付。

### 7.2 阶段划分

| 阶段 | 内容 | 交付物 | 验收 |
|---|---|---|---|
| **0：界面补齐** | 补 `/profile` 命令的 import/export/restart；确立对齐矩阵为长期基准 | `/profile` 命令补齐 | 现有功能 4 界面矩阵一致（bootstrap 除外） |
| **A：plugin 基础（4 界面同步）** | `create` + `plugin list`（全局/单）+ `add`/`remove`，CLI/面板/工具/命令同步交付 | core plugin 模块 + 4 界面 | 矩阵 A 行全勾；`create→add→list→start` 闭环 |
| **B：启停（4 界面同步）** | `enable`/`disable`（写 patch，HMR 热生效） | 4 界面启停 | 矩阵 B 行全勾 |
| **C：store** | 插件名 → 来源解析 + 市场 UI | 市场 | 输入插件名即装 |

**阶段 A 范围**（plugin 基础，4 界面同步）：
- `create`：新建空 profile（bundles 默认 `[dsh-base]`），复用 core 已有 import 的「写三件套」；
- `plugin list`（全局 + 单 profile）：读定义态，运行中叠加状态；
- `plugin add/remove`：透传官方 `dsh plugin`，错误透明、装包冷提示；
- 上述每个能力，CLI / 面板 / 工具 / `/profile` **四处同步交付**（不做「只先 CLI」）。

## 待确认（评审时拍板）

1. 阶段划分 0/A/B/C 是否符合预期？
2. `create` 起步 bundles 默认 `[dsh-base]`，还是允许 `--bundles` 一次指定多个？
3. 全局 plugin 列表按「plugin → 被哪些 profile 引用」分组，是否满足想象？
4. 对齐矩阵以「4 界面同步交付」为准（不再「先 CLI 后补」），是否 OK？
