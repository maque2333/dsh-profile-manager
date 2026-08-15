/** import/export：dshm-profile.yaml ⇄ 官方三件套。安装全程透传官方 dsh plugin。 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import { dshBin, isAlive } from './process.js'
import { profileDir, PROFILE_PATCH_FILENAME, PROFILE_PNPM_WORKSPACE, isValidProfileName } from './paths.js'
import { readProfile } from './profiles.js'
import { listInstancesOf, loadRuntime } from './runtime.js'
import { archiveExisting } from './archive.js'
import { BUILTIN_BUNDLES, DshmError } from './types.js'
import type { DshmProfileFile, RuntimeState } from './types.js'

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

const PROFILE_PNPM_TEMPLATE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

export interface ImportOptions {
  home: string
  /** 覆盖已存在的 profile（运行中仍拒绝，需先 stop）。 */
  force?: boolean
  /** pnpm allowBuilds 拦截时，代写豁免名单后重试。 */
  allowBuilds?: boolean
  /** 输出回调（默认 console.log）。 */
  log?: (line: string) => void
  /** 警告回调（默认 console.error）。 */
  warn?: (line: string) => void
}

/** 解析并校验 dshm-profile.yaml 文本。 */
export function parseProfileFile(text: string): DshmProfileFile {
  let raw: unknown
  try {
    raw = yaml.load(text)
  } catch (error) {
    throw new DshmError(`定义文件不是合法 YAML：${String(error)}`)
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DshmError('定义文件顶层必须是 YAML 映射')
  }
  const obj = raw as Record<string, unknown>
  if (obj.dshmProfile !== 1) {
    throw new DshmError(`不支持的格式版本：dshmProfile=${String(obj.dshmProfile)}（当前支持 1）`)
  }
  const name = obj.name
  if (typeof name !== 'string' || !isValidProfileName(name)) {
    throw new DshmError(`无效的 profile 名：${String(name)}（不允许空、路径分隔符、node_modules）`)
  }
  const bundles = obj.bundles
  if (!Array.isArray(bundles) || bundles.length === 0 || !bundles.every((b) => typeof b === 'string')) {
    throw new DshmError('bundles 必须是非空字符串数组')
  }
  const dependencies = obj.dependencies
  if (dependencies !== undefined && dependencies !== null) {
    if (typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      throw new DshmError('dependencies 必须是映射（包名: 版本/来源），与 package.json 语法一致')
    }
    for (const [key, value] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        throw new DshmError(`dependencies 的 "${key}" 必须是字符串（版本范围或来源 spec）`)
      }
    }
  }
  const patch = obj.patch
  if (patch !== undefined && typeof patch !== 'string') {
    throw new DshmError('patch 必须是字符串（YAML 补丁层内容）')
  }
  const meta = obj.meta
  if (meta !== undefined && meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) {
    throw new DshmError('meta 必须是映射')
  }
  const metaObj = (meta ?? {}) as Record<string, unknown>
  if (metaObj.port !== undefined && (typeof metaObj.port !== 'number' || !Number.isInteger(metaObj.port))) {
    throw new DshmError('meta.port 必须是整数')
  }
  return {
    dshmProfile: 1,
    name,
    bundles: [...bundles] as string[],
    dependencies: dependencies === undefined || dependencies === null
      ? {}
      : { ...(dependencies as Record<string, string>) },
    patch: typeof patch === 'string' ? patch : undefined,
    meta: metaObj,
  }
}

function runDsh(args: string[], home: string, options: Pick<ImportOptions, 'log' | 'warn'>): { code: number; output: string } {
  const result = spawnSync(dshBin(), args, {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim() !== '') (options.log ?? console.log)(output.trimEnd())
  return { code: result.status ?? 1, output }
}

/** import 主流程：预检 → 写三件套 → 透传 dsh plugin install → dump-config 验证 → 失败回滚。 */
export function importProfileFile(fileText: string, options: ImportOptions): DshmProfileFile {
  const spec = parseProfileFile(fileText)
  const { home } = options
  const log = options.log ?? ((line: string) => console.log(line))
  const warn = options.warn ?? ((line: string) => console.error(`dshm: ${line}`))

  // 1. 预检 pnpm
  const pnpmProbe = spawnSync('pnpm', ['--version'], { encoding: 'utf8' })
  if (pnpmProbe.error !== undefined && (pnpmProbe.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new DshmError('pnpm 不在 PATH 上——请先安装 pnpm（https://pnpm.io/installation）')
  }

  // 2. 名称冲突
  const target = profileDir(home, spec.name)
  if (existsSync(join(target, 'package.json'))) {
    const state = loadRuntime(home, { warn })
    const running = listInstancesOf(state, spec.name).filter((rec) => isAlive(rec.pid))
    if (running.length > 0) {
      throw new DshmError(`profile ${spec.name} 已有 ${running.length} 个运行中实例，先 stop 再覆盖`,
        running.map((rec) => `dshm stop ${rec.id}`).join(' && '))
    }
    if (options.force !== true) {
      throw new DshmError(`profile ${spec.name} 已存在`, '用 --force 覆盖（已有实例已停止），或换 --name')
    }
    archiveExisting(home, spec.name, { log, warn })
  }

  // 3. 剔除内置三件套依赖
  const dependencies = { ...spec.dependencies }
  for (const builtin of BUILTIN_BUNDLES) {
    if (builtin in dependencies) {
      delete dependencies[builtin]
      warn(`已剔除内置 bundle ${builtin}（由 dsh 安装目录解析，无需 pnpm 安装）`)
    }
  }

  // 4. 写官方三件套
  mkdirSync(target, { recursive: true })
  const manifest = {
    name: `dsh-profile-${spec.name}`,
    private: true,
    dependencies,
    dsh: { profile: { bundles: [...spec.bundles] } },
  }
  const write = (name: string, content: string) => {
    const path = join(target, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }
  write('package.json', `${JSON.stringify(manifest, undefined, 2)}\n`)
  write(PROFILE_PATCH_FILENAME, spec.patch !== undefined ? `${spec.patch.trimEnd()}\n` : PROFILE_PATCH_TEMPLATE)
  write(PROFILE_PNPM_WORKSPACE, PROFILE_PNPM_TEMPLATE)
  log(`已生成 profile 三件套：${target}`)

  // 5. 透传官方安装
  let install = runDsh(['plugin', '--profile', spec.name, 'install'], home, { log, warn })
  if (install.code !== 0 && options.allowBuilds === true && /allowBuilds/i.test(install.output)) {
    log('检测到 pnpm allowBuilds 拦截，正在代写豁免名单并重试……')
    appendAllowBuilds(target, dependencies)
    install = runDsh(['plugin', '--profile', spec.name, 'install'], home, { log, warn })
  }
  if (install.code !== 0) {
    rmSync(target, { recursive: true, force: true })
    const hint = /allowBuilds/i.test(install.output)
      ? 'git 依赖的构建脚本被 pnpm ≥10 拦截：用 --allow-builds 让 dshm 代写豁免名单后重试'
      : undefined
    throw new DshmError(`安装失败（已回滚 ${target}）：dsh plugin install 退出码 ${install.code}`, hint)
  }

  // 6. 验证合成配置（--profile flag 必须在 app 参数之前）
  const verify = runDsh(['--profile', spec.name, '--dump-config'], home, { log: () => {}, warn })
  if (verify.code !== 0) {
    rmSync(target, { recursive: true, force: true })
    const tail = verify.output.split('\n').slice(-10).join('\n')
    throw new DshmError(`验证失败（已回滚 ${target}）：dsh --profile ${spec.name} --dump-config 退出码 ${verify.code}`,
      `bundle 解析或 patch 语法有问题，检查 bundles 与 patch 字段；输出尾部：\n${tail}`)
  }

  log(`导入完成：profile "${spec.name}"（${spec.bundles.length} 个 bundle、${Object.keys(dependencies).length} 个依赖包）`)
  return spec
}

function appendAllowBuilds(target: string, dependencies: Record<string, string>): void {
  const workspacePath = join(target, PROFILE_PNPM_WORKSPACE)
  let content = existsSync(workspacePath) ? readFileSync(workspacePath, 'utf8') : PROFILE_PNPM_TEMPLATE
  if (!content.includes('allowBuilds:')) {
    content = `${content.trimEnd()}\nallowBuilds:\n`
  }
  for (const key of Object.keys(dependencies)) {
    // pnpm 按包名匹配；对 registry 规范取 key（即包名），git/file 规范跳过（安装后才知道真名）。
    const isRegistrySpec = /^[^/:@\s][^/]*$|^@[^/]+\/[^/]+$/.test(key)
    const entry = isRegistrySpec ? `  - '${key}'` : null
    if (entry !== null && !content.includes(entry)) content = `${content}${entry}\n`
  }
  writeFileSync(workspacePath, content, 'utf8')
}

/** export：读官方三件套反向生成 dshm-profile.yaml。 */
export function exportProfileText(home: string, name: string, state: RuntimeState): string {
  const info = readProfile(home, name)
  const meta: Record<string, unknown> = {}
  const recs = listInstancesOf(state, name)
  const lastWithPort = [...recs].reverse().find((rec) => rec.port !== undefined)
  const port = state.suggestedPorts?.[name] ?? lastWithPort?.port
  if (port !== undefined) meta.port = port
  const spec: DshmProfileFile = {
    dshmProfile: 1,
    name,
    bundles: [...info.bundles],
    dependencies: { ...info.dependencies },
    patch: info.patch ?? undefined,
    meta,
  }
  return yaml.dump(spec, { noRefs: true })
}

export type { RuntimeState }
