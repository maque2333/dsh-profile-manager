# packages/plugin —— M2 占位

M2（插件形态）将在此实现 Cordis bundle：与 CLI **同包发布**（`dsh-profile-manager`），
通过 `dsh.bundle.patch` 声明挂载 `ctx.profileManager` host 服务、`/profile-manager` 面板路由、
`profile_*` 模型工具与 `/profile` 命令。逻辑全部复用 `@dsh-profile-manager/core`。

详见 DESIGN.md §3.1、§3.4、§9（M2 里程碑）。M1 不包含本目录内容。
