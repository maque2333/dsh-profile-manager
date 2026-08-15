# dsh-profile-manager (dshm)

> **Profiles as instances** —— 管理 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 profile（定义）**和**它们的运行实例。

`dshm` 是一个开源的 CLI + Cordis 插件，把 DSH 的 **profile** 当一等对象管理：list、show、import/export、start、stop、restart、status、delete——还带一个 Web 面板和一组模型工具，供可视化管理或 agent 直接调用。

[English](README.md)

## 为什么需要它

官方 `dsh` CLI 只提供底层原语：

```sh
dsh plugin --profile <name> add <pkg>   # 创建 + 装插件
dsh --profile <name> web --port N       # 启动
```

……但它**没有** import/export 格式、没有注册表视图、没有进程（实例）管理。`dshm` 补上这块，引入了 **Instance（实例）** 概念：

```
profiles/writing/            # profile（定义）—— 永远只有一份
  ├─ writing-1  (:3082)      # 运行实例（0~N 个）
  └─ writing-2  (:3083)      # 同一份菜谱，开第二桌
```

## 安装

```sh
npm install -g dsh-profile-manager
```

依赖：

- Node.js ≥ 20
- 可用的 `dsh`（`0.1.0-rc.x`）在 `PATH` 上
- `pnpm` 在 `PATH` 上（仅 `import` / `bootstrap` 需要）

## 快速开始

```sh
dshm list                  # 列出所有 profile + 它们的实例
dshm import writing.yaml   # 从定义文件安装一个 profile
dshm start writing         # 启动实例（web 形态自动分配端口）
dshm status                # 实时状态
dshm stop writing          # 优雅停止
dshm bootstrap             # 创建并启动 manager（Web 面板）profile
```

## 命令

| 命令 | 说明 |
|---|---|
| `dshm list` | 列出全部 profile：形态、bundles、依赖、实例状态 |
| `dshm show <name>` | 单个 profile 的 manifest + patch 层 + 依赖 |
| `dshm create <name>` | 新建空 profile（起步 = `@deepseek-ai/dsh-base`） |
| `dshm import <文件> [--name N] [--force] [--allow-builds]` | 从 `dshm-profile.yaml` 安装 profile 及其全部包 |
| `dshm export <name> [-o 文件]` | 反向导出到同一格式 |
| `dshm delete <name> [--purge] [--yes] [--force]` | 删除（默认归档；`--purge` 彻底删除） |
| `dshm start <name> [--port N] [--foreground]` | 启动实例（多开需显式 `--port`） |
| `dshm stop <name> [--port N]` | 停止实例：SIGTERM → ≤8s → SIGKILL |
| `dshm restart <name> [--port N]` | 停止全部后用上次端口重启 |
| `dshm status [name]` | 实例状态（web：HTTP 探活；generic：进程存活） |
| `dshm doctor` | 一致性诊断 + 崩溃残留 + 归档清单 |
| `dshm plugin list [profile]` | 列出 plugin：无参数 = 全局汇总；带 profile = 单 profile |
| `dshm plugin add <profile> <pkg>` | 给 profile 安装 plugin（透传 `dsh plugin add`） |
| `dshm plugin remove <profile> <pkg>` | 卸载 plugin（透传 `dsh plugin remove`） |
| `dshm bootstrap [--port N]` | 创建并启动 `manager` profile（Web 面板） |

所有命令都遵守 `DSH_HOME`（默认 `~/.dsh`）。

## Profile 定义文件（`dshm-profile.yaml`）

import/export 的载体——官方三件套（`package.json` + `cordis.patch.yml` + `pnpm-workspace.yaml`）的声明式前端。导入结果与手工创建完全等价。

```yaml
dshmProfile: 1                 # 格式版本

name: writing                  # profile 名（= $DSH_HOME/profiles/<name>）

bundles:                       # 有序 bundle 列表（= dsh.profile.bundles）
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'

dependencies:                  # 与 package.json dependencies 同构（任意 pnpm spec）
  dsh-news-briefing: ^1.0.0
  some-bundle: github:owner/some-bundle#v0.2.0

patch: |                       # 你的用户层（原样写入 cordis.patch.yml）
  - insert:
      - id: ui-topbar
        name: 'dsh-ui-topbar-compact'

meta:                           # 仅 dshm 使用（dsh 无视）
  description: 写作助手实例
  port: 3082                    # 建议端口
```

## 插件形态（manager）

`dsh-profile-manager` **同时是一个 Cordis bundle**——一个 npm 包，两张皮：

- **CLI**（`bin: dshm`）——脚本化、CI、离线救援。
- **插件**（`dsh.bundle.patch`）——`/profile-manager` Web 面板、`profile_*` 模型工具、`/profile` 命令。面板与工具覆盖完整 CLI 能力：list / show / import / export / start / stop / restart / status / delete / doctor。

`dshm bootstrap` 创建并启动一个名为 `manager` 的普通 profile（`dsh-base + dsh-web-app + dsh-profile-manager`）。它在 `dshm list` 里是普通一行——**管理器管理它自己**。

```sh
dshm bootstrap              # 然后打开 http://127.0.0.1:<port>/profile-manager
```

## 兼容性

- 适配 `dsh` `0.1.0-rc.x`；只消费稳定表面（CLI 语法、`$DSH_HOME` 布局、`dsh.profile` manifest、`cordis.patch.yml`）——不依赖任何 `@deepseek-ai/dsh-*` 内部 API。
- 形态按 bundles 分类：**web / headless / generic**——未来社区新形态零改动即可管理。
- 对外契约：**配置热、装包冷**（与官方一致）。

## License

MIT
