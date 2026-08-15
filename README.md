# dsh-profile-manager (dshm)

> **Profiles as instances** — manage [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) profiles *and* their running instances.

`dshm` is an open-source CLI + Cordis plugin that treats DSH **profiles** as first-class objects: list, show, import/export, start, stop, restart, status, delete — plus a web panel and model tools for visual/agent-driven management.

[中文文档](README.zh.md)

## Why

The official `dsh` CLI gives you low-level primitives:

```sh
dsh plugin --profile <name> add <pkg>   # create + install plugins
dsh --profile <name> web --port N       # boot
```

…but it has **no** import/export format, no registry view, and no process (instance) management. `dshm` fills that gap by introducing the **Instance** concept:

```
profiles/writing/            # the profile (definition) — always one copy
  ├─ writing-1  (:3082)      # running instances (0..N)
  └─ writing-2  (:3083)      # same recipe, second table
```

## Install

```sh
npm install -g dsh-profile-manager
```

Requirements:

- Node.js ≥ 20
- a working `dsh` installation (`0.1.0-rc.x`) on `PATH`
- `pnpm` on `PATH` (only for `import` / `bootstrap`)

## Quick start

```sh
dshm list                  # list all profiles + their instances
dshm import writing.yaml   # install a profile from a definition file
dshm start writing         # start an instance (web shapes auto-pick a port)
dshm status                # live status
dshm stop writing          # graceful stop
dshm bootstrap             # create & start the manager (web panel) profile
```

## Commands

| Command | Description |
|---|---|
| `dshm list` | List every profile: shape, bundles, dependencies, instance status |
| `dshm show <name>` | One profile's manifest + patch layer + dependencies |
| `dshm import <file> [--name N] [--force] [--allow-builds]` | Install a profile and all its packages from `dshm-profile.yaml` |
| `dshm export <name> [-o file]` | Reverse-export a profile to the same format |
| `dshm delete <name> [--purge] [--yes] [--force]` | Delete (archive by default; `--purge` truly removes) |
| `dshm start <name> [--port N] [--foreground]` | Start an instance (multi-instance needs explicit `--port`) |
| `dshm stop <name> [--port N]` | Stop instance(s): SIGTERM → ≤8s → SIGKILL |
| `dshm restart <name> [--port N]` | Stop all + restart on the last port |
| `dshm status [name]` | Instance status (web: HTTP probe; generic: process liveness) |
| `dshm doctor` | Consistency diagnostics + crash residue + archive listing |
| `dshm bootstrap [--port N]` | Create + start the `manager` profile (the web panel) |

All commands respect `DSH_HOME` (default `~/.dsh`).

## Profile definition file (`dshm-profile.yaml`)

The import/export carrier — a declarative front-end to the official profile trio (`package.json` + `cordis.patch.yml` + `pnpm-workspace.yaml`). Importing produces exactly what hand-crafting would.

```yaml
dshmProfile: 1                 # format version

name: writing                  # profile name (= $DSH_HOME/profiles/<name>)

bundles:                       # ordered bundle list (= dsh.profile.bundles)
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'

dependencies:                  # mirrors package.json dependencies (any pnpm spec)
  dsh-news-briefing: ^1.0.0
  some-bundle: github:owner/some-bundle#v0.2.0

patch: |                       # your user layer (written verbatim to cordis.patch.yml)
  - insert:
      - id: ui-topbar
        name: 'dsh-ui-topbar-compact'

meta:                           # dshm-only metadata (ignored by dsh)
  description: 写作助手实例
  port: 3082                    # suggested port
```

## Plugin form (the manager)

`dsh-profile-manager` is **also a Cordis bundle** — one npm package, two skins:

- **CLI** (`bin: dshm`) — scripting, CI, offline rescue.
- **Plugin** (`dsh.bundle.patch`) — a web panel at `/profile-manager`, `profile_*` model tools, and a `/profile` command.

`dshm bootstrap` creates and starts a plain profile named `manager` (`dsh-base + dsh-web-app + dsh-profile-manager`). It shows up in `dshm list` like any other row — the manager manages itself.

```sh
dshm bootstrap              # then open http://127.0.0.1:<port>/profile-manager
```

## Compatibility

- Targets `dsh` `0.1.0-rc.x`; consumes only the stable surface (CLI syntax, `$DSH_HOME` layout, `dsh.profile` manifest, `cordis.patch.yml`) — no internal `@deepseek-ai/dsh-*` APIs.
- Shapes are classified by bundles: **web** / **headless** / **generic** — new community shapes need zero changes.
- External contract: **config hot, package install cold** (same as upstream).

## License

MIT
