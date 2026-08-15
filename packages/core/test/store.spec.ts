/**
 * store.ts 单元测试：searchPlugins / pluginDetails 的解析逻辑（mock fetch，不依赖真实网络）。
 */

import { describe, expect, it, afterEach, vi } from 'vitest'
import { searchPlugins, pluginDetails } from '../src/store.js'

function mockFetch(payload: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchPlugins', () => {
  it('解析 GitHub 搜索结果字段映射', async () => {
    mockFetch({
      items: [
        { full_name: 'huawolf/news-agent', description: 'news aggregator', stargazers_count: 12, html_url: 'https://github.com/huawolf/news-agent', updated_at: '2026-08-15T11:09:59Z' },
      ],
    })
    const plugins = await searchPlugins('news')
    expect(plugins).toEqual([{
      name: 'news-agent',
      source: 'github:huawolf/news-agent',
      description: 'news aggregator',
      stars: 12,
      url: 'https://github.com/huawolf/news-agent',
      updatedAt: '2026-08-15T11:09:59Z',
    }])
  })

  it('空关键词时查询 topic:dsh-plugin（不带关键词）', async () => {
    const fn = mockFetch({ items: [] })
    await searchPlugins('')
    const url = String(fn.mock.calls[0]?.[0])
    expect(url).toContain('topic%3Adsh-plugin') // 编码后的 topic:dsh-plugin
    expect(url).toContain('sort=stars')
  })

  it('sort=updated 时查询参数变化', async () => {
    const fn = mockFetch({ items: [] })
    await searchPlugins('news', { sort: 'updated' })
    expect(String(fn.mock.calls[0]?.[0])).toContain('sort=updated')
  })
})

describe('pluginDetails', () => {
  it('解析 github:owner/repo 详情', async () => {
    mockFetch({ full_name: 'huawolf/news-agent', description: 'd', stargazers_count: 3, html_url: 'u', updated_at: 't' })
    const p = await pluginDetails('github:huawolf/news-agent')
    expect(p.name).toBe('news-agent')
    expect(p.source).toBe('github:huawolf/news-agent')
  })
})
