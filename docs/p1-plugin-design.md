# P1 设计：profile 内 plugin 管理（草案 v2，待确认）

> 状态：**草案 v2（阶段 0/A 已完成）**。定位与调研结论见 §1；阶段计划见 §7。
> 调研结论：官方自带只读 plugin 清单（`pluginInventory/list`）+ CLI 安装（`dsh plugin add/remove`，透传 pnpm，支持 npm/git/github/file/link）；社区 [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub) 已做单 profile 启停 + GitHub 市场；[dsh-plugin-store](https://www.npmjs.com/package/dsh-plugin-store) 已做**完整 store**（浏览/搜索/一键安装/评分/依赖图/审计）；GitHub `dsh-plugin` topic 已有 **3191 个仓库**。**我们的差异化 = profile 视角（跨 profile 的 plugin 管理）**。

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

### 7.2 阶段划分（进度）

| 阶段 | 内容 | 状态 |
|---|---|---|
| **0：界面补齐** | 补 `/profile` 命令的 import/export/restart | ✅ 完成 |
| **A：plugin 基础（4 界面同步）** | `create` + `plugin list`（全局/单）+ `add`/`remove` | ✅ 完成（58/58 测试全绿，CLI/面板/工具/命令全勾） |
| **B：启停** | `enable`/`disable` | ⏸ 待决策（见下方「阶段 B/C 重新评估」） |
| **C：store** | 插件名 → 来源解析 + 市场 UI | ⏸ 待决策（社区已有 dsh-plugin-store 完整实现） |

## 8. 阶段 B/C 重新评估（调研后新增，待人类拍板）

阶段 A 落地后，调研发现两个事实改变了 B/C 的价值判断：

**阶段 B（enable/disable）的粒度问题**：
- DSH「停用」停的是 **entry**（cordis 插件行），不是 bundle；entry 列表只有运行时（`pluginInventory`）能拿到，**只对当前运行的 profile 有效**；
- 我们的面板寄生在 manager 进程里，`ctx.loader` 是 manager 自己的——启用/停用只能针对 manager 自己（又撞自保只读）；
- 跨 profile 启停需静态解析每个 bundle 的 `cordis.patch.yml` 提取 entry id，复杂度高、对「一个 bundle 多个 entry」的基础 bundle 语义混乱；
- 结论：**enable/disable 天然是「单 profile 运行时」操作，与我们的「profile 视角」差异化不契合**，且 dsh-plugin-hub 已做。

**阶段 C（store）的竞争格局**：
- [dsh-plugin-store](https://www.npmjs.com/package/dsh-plugin-store) 已是**完整 store**（浏览/搜索/一键安装/评分/依赖图/审计）；
- [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub) 已有 GitHub 市场；
- GitHub `dsh-plugin` topic 已有 **3191 个仓库**，awesome 列表在策展；
- 结论：**store 社区已相当成熟，我们再做难有差异化**；我们的独特价值仍是「跨 profile 的 plugin 管理」（阶段 A 已交付）。

**建议（三选一，待人类拍板）**：
1. **P1 到此为止**——阶段 A（跨 profile 的 create/list/add/remove）就是我们的差异化，B/C 让给社区，直接收尾（更新文档 + 发布）；
2. **简化做 B**——只对「正在运行的 profile」提供 entry 级启停（复用 plugin-inventory），作为面板里的顺手操作，不强行跨 profile；
3. **坚持做 B + C**——按原计划（B 跨 profile 启停需解析 bundle patch；C 做自己的 store），投入最大。

## 待确认（评审时拍板）

1. 阶段 B/C 按上面「三选一」走哪条？
2. `create` 起步 bundles 默认 `[dsh-base]`，是否要支持 `--bundles` 一次指定多个？（阶段 A 已按默认 `[dsh-base]` 实现）
