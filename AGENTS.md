# AGENTS.md — dsh-profile-manager 项目守则（agent 必读）

本项目是 **DSH Profile Manager（dshm）**：管理 DeepSeek Harness 的 profile（定义）与 instance（运行实例）的开源 CLI 工具（M2 起加插件形态）。

## 必读文件（开工前按顺序读完）

1. `DESIGN.md` —— 完整设计文档，**14 项决策已定案（§11），不得翻案**；改动设计必须由人类明确确认；
2. `HANDOFF.md` —— 跨会话交接状态：当前进度、下一步任务、已知坑。**每次工作结束后必须更新它**；
3. 官方知识库（按需查阅，勿凭记忆猜 API）：
   - DSH 仓库：`/tmp/dsh-repo`（本机可能存在的浅克隆）或 https://github.com/deepseek-ai/deepseek-harness
   - 关键文档：`apps/cli/reference/README.md`（CLI 行为）、`packages/boot/app-boot/README.md`（profile 机制）、`docs/subsystems/skills.md`

## 铁律（违反即返工）

1. **只消费官方稳定表面**：CLI 语法（`dsh plugin`/`--profile`/`--port`）、`$DSH_HOME` 布局、`dsh.profile` manifest、`cordis.patch.yml` 结构。core 中**禁止依赖任何 `@deepseek-ai/dsh-*` 内部 API**（M1 的 CLI 尤其如此；M2 的 plugin 包才允许按官方扩展点使用 `ctx.*`）。
2. **绝不碰真实 `~/.dsh`**：开发与测试一律用临时 `DSH_HOME`（`mktemp -d` 或 `~/.dsh-dev`）。真实 home 里有密钥（`.credentials.yaml`）和用户会话——任何测试、任何 `dshm` 命令、任何 `dsh` 子进程都要显式带上测试用的 `DSH_HOME` 环境变量。
3. **核心逻辑零副作用设计**：core 是纯逻辑库（进程管理与文件读写除外），CLI/plugin 只是薄壳；新逻辑先想"放 core 的哪一层"。
4. **错误绝不静默**：启动失败、探活失败、回滚、强杀必须显式输出原因；新手用户靠错误信息自救。
5. **git 纪律**：提交信息用 conventional commits（feat/fix/chore/docs/test）；每次提交前 `pnpm run check`（含测试）必须通过；不提交 node_modules/lib 构建产物。
6. **跨会话交接**：每轮工作结束更新 `HANDOFF.md` 的"最近完成 / 进行中 / 下一步"，否则下一会话的 agent 无法接续。

## 沙箱与权限（本机环境事实）

- 会话工作区 = `/Users/maque/Suzume_Files/Project/DSH`；**仓库在 `/Users/maque/Suzume_Files/Project/dsh-profile-manager`（工作区外）**；
- 写仓库文件会被沙箱拒绝一次 → 用 `sandbox_permissions: danger-full-access` 重试（需人类审批）。**批量写文件**（一次命令写多个）以减少审批打扰；
- 读任意路径不受限（`~/.dsh`、`/tmp/dsh-repo` 等均可读）；
- 若人类把 Web GUI 工作区切到仓库目录并新开会话，则该会话写仓库零审批。

## 当前阶段（见 HANDOFF.md 为准）

- M0 设计评审已完成（14 项决策定案）；M1（core + CLI）待开工。

## 决策速查（防翻案，详见 DESIGN.md §11）

- 双层模型：Profile=定义（官方概念）/ Instance=运行（dshm 概念，标识 `<profile>-<n>`）；1:N；
- 形态分类：按 bundles 判 web / headless / generic 三类；客户端不在管理范围；
- 端口链：--port > 上次 > meta.port > 3081 起找空（避让 3080）；
- 对外契约：**配置热、装包冷**（与官方一致）；
- delete 默认归档；stop = SIGTERM→≤8s→SIGKILL 明说；import 失败整目录回滚；测试用临时 DSH_HOME。
