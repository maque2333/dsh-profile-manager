/**
 * plugin store（P1 阶段 C）：搜索 GitHub `dsh-plugin` topic 插件 + 详情 + 安装透传。
 * 只消费 GitHub 公开 Search/Repos API（内置 fetch，零新依赖）；安装透传官方 dsh plugin。
 */

import { DshmError } from './types.js'
import { pluginAddRemove, type PluginOpResult } from './plugins.js'

const GITHUB_API = 'https://api.github.com'
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-profile-manager',
}

/** 一个 store 插件条目。 */
export interface StorePlugin {
  /** 插件短名（repo 名）。 */
  name: string
  /** 安装来源（`github:owner/repo`，可直接透传 dsh plugin add）。 */
  source: string
  /** 描述。 */
  description: string
  /** star 数。 */
  stars: number
  /** 仓库地址。 */
  url: string
  /** 最近更新时间（ISO 字符串）。 */
  updatedAt: string
}

export type StoreSort = 'stars' | 'updated'

export interface SearchOptions {
  /** 排序字段：stars（默认）或 updated。 */
  sort?: StoreSort
  /** 返回条数（默认 20）。 */
  perPage?: number
}

async function githubGet(path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: GITHUB_HEADERS })
  } catch (error) {
    throw new DshmError(`访问 GitHub 失败：${error instanceof Error ? error.message : String(error)}`,
      '检查网络（GitHub 需可访问）；未认证的 GitHub API 有 60 次/小时速率限制')
  }
  if (!res.ok) {
    throw new DshmError(`GitHub API 返回 HTTP ${res.status}`,
      res.status === 403 ? '可能是速率限制（60 次/小时）或网络受限' : `请求路径：${path}`)
  }
  return res.json()
}

function toStorePlugin(item: Record<string, unknown>): StorePlugin {
  const fullName = typeof item.full_name === 'string' ? item.full_name : ''
  const name = fullName.includes('/') ? fullName.slice(fullName.lastIndexOf('/') + 1) : fullName
  return {
    name,
    source: `github:${fullName}`,
    description: typeof item.description === 'string' ? item.description : '',
    stars: typeof item.stargazers_count === 'number' ? item.stargazers_count : 0,
    url: typeof item.html_url === 'string' ? item.html_url : '',
    updatedAt: typeof item.updated_at === 'string' ? item.updated_at : '',
  }
}

/** 搜索 GitHub `dsh-plugin` topic 的插件（关键词可选，按 sort 降序）。 */
export async function searchPlugins(keyword: string, options: SearchOptions = {}): Promise<StorePlugin[]> {
  const sort = options.sort ?? 'stars'
  const perPage = options.perPage ?? 20
  const query = keyword.trim() === '' ? 'topic:dsh-plugin' : `topic:dsh-plugin ${keyword.trim()}`
  const data = await githubGet(`/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=${perPage}`) as { items?: unknown }
  const items = Array.isArray(data.items) ? data.items : []
  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map(toStorePlugin)
}

/** 单个插件的详情（按 `github:owner/repo` 或裸 `owner/repo`）。 */
export async function pluginDetails(source: string): Promise<StorePlugin> {
  const repo = source.replace(/^github:/, '')
  const data = await githubGet(`/repos/${repo}`) as Record<string, unknown>
  return toStorePlugin(data)
}

/** 安装插件到指定 profile：透传官方 `dsh plugin add <source>`。 */
export function installPlugin(home: string, profile: string, source: string, options: { log?: (line: string) => void } = {}): PluginOpResult {
  return pluginAddRemove(home, profile, ['add', source], options)
}
