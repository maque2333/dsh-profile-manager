/**
 * /profile-manager 前端面板（浏览器侧，esbuild 打包成 lib/client.js）。
 * 自包含 React app：通过 /profile-manager/api/* 与 host 的 ProfileManager 服务通信。
 * 功能与 CLI 对齐：profile 层（list/show/import/export/create/delete/start/stop/restart/status/doctor）
 * + plugin 层（全局/单 profile 列表 + add/remove）。
 */

import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const API = '/profile-manager/api'

interface InstanceView {
  id: string
  profile: string
  shape: string
  port?: number
  pid: number
  status: string
  detail: string
}

interface ProfileView {
  name: string
  dir: string
  bundles: string[]
  dependencies: Record<string, string>
  shape: string
  patch: string | null
  instances: InstanceView[]
}

interface PluginEntry {
  name: string
  kind: string
}

interface EntryInfo {
  entryId: string
  moduleName: string
  disabled: boolean
}

interface PluginSummary {
  plugin: string
  kind: string
  profiles: string[]
}

interface StorePlugin {
  name: string
  source: string
  description: string
  stars: number
  url: string
  updatedAt: string
}

async function api(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(API + path, {
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  return res.json()
}

function App() {
  const [profiles, setProfiles] = useState<ProfileView[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importText, setImportText] = useState('')
  const [importForce, setImportForce] = useState(false)
  const [exported, setExported] = useState<{ name: string; definition: string } | null>(null)
  const [detail, setDetail] = useState<{ name: string; bundles: string[]; dependencies: Record<string, string>; patch: string | null } | null>(null)
  const [createName, setCreateName] = useState('')
  const [globalPlugins, setGlobalPlugins] = useState<PluginSummary[] | null>(null)
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [pluginPkg, setPluginPkg] = useState('')
  const [entries, setEntries] = useState<EntryInfo[]>([])
  const [storeKeyword, setStoreKeyword] = useState('')
  const [storeSort, setStoreSort] = useState('stars')
  const [storeResults, setStoreResults] = useState<StorePlugin[] | null>(null)
  const [storeProfile, setStoreProfile] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const data = await api('/list')
      if (data.ok) { setProfiles(data.profiles); setError('') }
      else setError(data.error ?? '未知错误')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function act(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const start = (name: string) => act(async () => {
    const data = await api('/start', { method: 'POST', body: JSON.stringify({ name }) })
    if (!data.ok) setError(data.error ?? 'start 失败')
  })

  const stop = (profile: string) => act(async () => {
    const data = await api('/stop', { method: 'POST', body: JSON.stringify({ profile }) })
    if (!data.ok) setError(data.error ?? 'stop 失败')
  })

  const restart = (name: string) => act(async () => {
    const data = await api('/restart', { method: 'POST', body: JSON.stringify({ name }) })
    if (!data.ok) setError(data.error ?? 'restart 失败')
  })

  const remove = (name: string) => act(async () => {
    if (!window.confirm(`确定删除 profile "${name}"？（默认归档，不影响会话记录）`)) return
    const purge = window.confirm('要彻底删除（--purge）吗？点“取消”= 归档')
    const data = await api('/delete', { method: 'POST', body: JSON.stringify({ name, purge }) })
    if (!data.ok) setError(data.error ?? 'delete 失败')
  })

  const doctor = () => act(async () => {
    const data = await api('/doctor')
    if (data.ok) { setError(JSON.stringify(data.report, null, 2)) }
    else setError(data.error ?? 'doctor 失败')
  })

  const doImport = () => act(async () => {
    if (importText.trim() === '') { setError('请先粘贴 dshm-profile.yaml 内容'); return }
    const data = await api('/import', { method: 'POST', body: JSON.stringify({ definition: importText, force: importForce }) })
    if (!data.ok) setError(data.error ?? 'import 失败')
    else { setImportText(''); setError(`已导入 profile "${data.imported}"`) }
  })

  const doExport = (name: string) => act(async () => {
    const data = await api('/export?name=' + encodeURIComponent(name))
    if (data.ok) setExported({ name: data.name, definition: data.definition })
    else setError(data.error ?? 'export 失败')
  })

  const loadPlugins = async (name: string): Promise<void> => {
    const data = await api('/plugin/list?name=' + encodeURIComponent(name))
    setPlugins(data.ok ? data.plugins : [])
  }

  const loadEntries = async (name: string): Promise<void> => {
    const data = await api('/plugin/entries?name=' + encodeURIComponent(name))
    setEntries(data.ok ? data.entries : [])
  }

  const doShow = (name: string) => act(async () => {
    const data = await api('/show?name=' + encodeURIComponent(name))
    if (data.ok) {
      setDetail({ name: data.name, bundles: data.bundles, dependencies: data.dependencies, patch: data.patch })
      await loadPlugins(name)
      await loadEntries(name)
    } else setError(data.error ?? 'show 失败')
  })

  const doCreate = () => act(async () => {
    if (createName.trim() === '') { setError('请输入 profile 名'); return }
    const data = await api('/create', { method: 'POST', body: JSON.stringify({ name: createName }) })
    if (!data.ok) setError(data.error ?? 'create 失败')
    else { setCreateName(''); setError(`已创建 profile "${data.created}"`) }
  })

  const toggleGlobalPlugins = () => act(async () => {
    if (globalPlugins !== null) { setGlobalPlugins(null); return }
    const data = await api('/plugin/list')
    if (data.ok) setGlobalPlugins(data.plugins)
    else setError(data.error ?? 'plugin list 失败')
  })

  const doPluginAdd = (profile: string) => act(async () => {
    if (pluginPkg.trim() === '') { setError('请输入包名/spec'); return }
    const data = await api('/plugin/add', { method: 'POST', body: JSON.stringify({ profile, pkg: pluginPkg }) })
    if (!data.ok) setError(data.error ?? 'plugin add 失败')
    else { setPluginPkg(''); await loadPlugins(profile) }
  })

  const doPluginRemove = (profile: string, pkg: string) => act(async () => {
    if (!window.confirm(`确定从 "${profile}" 卸载 "${pkg}"？`)) return
    const data = await api('/plugin/remove', { method: 'POST', body: JSON.stringify({ profile, pkg }) })
    if (!data.ok) setError(data.error ?? 'plugin remove 失败')
    else await loadPlugins(profile)
  })

  const doPluginEnable = (profile: string, entryId: string) => act(async () => {
    const data = await api('/plugin/enable', { method: 'POST', body: JSON.stringify({ profile, entryId }) })
    if (!data.ok) setError(data.error ?? 'enable 失败')
    else await loadEntries(profile)
  })

  const doPluginDisable = (profile: string, entryId: string) => act(async () => {
    const data = await api('/plugin/disable', { method: 'POST', body: JSON.stringify({ profile, entryId }) })
    if (!data.ok) setError(data.error ?? 'disable 失败')
    else await loadEntries(profile)
  })

  const doSearch = () => act(async () => {
    const params = new URLSearchParams({ keyword: storeKeyword, sort: storeSort })
    const data = await api('/plugin/search?' + params.toString())
    if (data.ok) setStoreResults(data.plugins)
    else setError(data.error ?? 'search 失败')
  })

  const toggleStore = () => act(async () => {
    if (storeResults !== null) { setStoreResults(null); return }
    await doSearch()
  })

  const doInstall = (source: string) => act(async () => {
    const target = storeProfile.trim()
    if (target === '') { setError('请先填「安装目标 profile 名」（已有 profile 名，或新建一个）'); return }
    const data = await api('/plugin/install', { method: 'POST', body: JSON.stringify({ profile: target, source }) })
    if (!data.ok) setError(data.error ?? 'install 失败')
    else setError(`已安装 ${source} 到 ${target}（装包冷，重启生效）`)
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void refresh()} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
        <button onClick={doctor} disabled={busy}>诊断</button>
        <button onClick={toggleGlobalPlugins} disabled={busy}>{globalPlugins === null ? '插件总览' : '收起插件总览'}</button>
        <button onClick={toggleStore} disabled={busy}>{storeResults === null ? '插件商店' : '收起商店'}</button>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="新 profile 名"
            style={{ padding: '4px 8px' }}
          />
          <button onClick={doCreate} disabled={busy}>新建 profile</button>
        </span>
      </div>

      {globalPlugins !== null && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid rgba(128,128,128,.3)', borderRadius: 8 }}>
          <strong>插件总览（{globalPlugins.length}）</strong>
          {globalPlugins.map((g) => (
            <div key={g.plugin} style={{ fontSize: 13, padding: '4px 0' }}>
              {g.plugin} <span style={{ color: '#888' }}>[{g.kind}]</span> → {g.profiles.join(', ')}
            </div>
          ))}
        </div>
      )}

      {storeResults !== null && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid rgba(128,128,128,.3)', borderRadius: 8 }}>
          <strong>插件商店（GitHub dsh-plugin）</strong>
          <div style={{ display: 'flex', gap: 6, margin: '6px 0', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={storeKeyword}
              onChange={(e) => setStoreKeyword(e.target.value)}
              placeholder="搜索关键词（如 news）"
              style={{ flex: 1, padding: '4px 8px', minWidth: 160 }}
            />
            <select value={storeSort} onChange={(e) => setStoreSort(e.target.value)} style={{ padding: '4px' }}>
              <option value="stars">按 star</option>
              <option value="updated">按最新</option>
            </select>
            <button onClick={doSearch} disabled={busy}>搜索</button>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              安装到
              <input value={storeProfile} onChange={(e) => setStoreProfile(e.target.value)} placeholder="profile 名" style={{ width: 110, padding: '4px 8px' }} />
            </span>
          </div>
          {storeResults.map((p) => (
            <div key={p.source} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,.15)' }}>
              <div>
                <strong>{p.name}</strong> <span style={{ color: '#888' }}>★{p.stars}</span>{' '}
                <span style={{ color: '#888' }}>{p.source}</span>
              </div>
              {p.description !== '' && <div style={{ color: '#666' }}>{p.description.slice(0, 100)}</div>}
              <button onClick={() => void doInstall(p.source)} disabled={busy}>安装</button>
            </div>
          ))}
        </div>
      )}

      <details style={{ marginBottom: 16 }}>
        <summary>导入 profile（粘贴 dshm-profile.yaml）</summary>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"dshmProfile: 1\nname: my-profile\nbundles:\n  - '@deepseek-ai/dsh-base'\n  - '@deepseek-ai/dsh-web-app'\ndependencies: {}\nmeta:\n  description: 示例"}
          rows={8}
          style={{ width: '100%', fontFamily: 'monospace', marginBottom: 8, boxSizing: 'border-box' }}
        />
        <div>
          <label>
            <input type="checkbox" checked={importForce} onChange={(e) => setImportForce(e.target.checked)} />
            覆盖已存在的 profile（--force）
          </label>
          <button onClick={doImport} disabled={busy} style={{ marginLeft: 8 }}>导入</button>
        </div>
      </details>

      {exported !== null && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 4 }}>
            <strong>导出：{exported.name}</strong>{' '}
            <button onClick={() => setExported(null)}>关闭</button>
          </div>
          <textarea readOnly value={exported.definition} rows={10} style={{ width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
        </div>
      )}

      {detail !== null && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid rgba(128,128,128,.3)', borderRadius: 8 }}>
          <div style={{ marginBottom: 4 }}>
            <strong>详情：{detail.name}</strong>{' '}
            <button onClick={() => setDetail(null)}>关闭</button>
          </div>
          <div style={{ fontSize: 13 }}>bundles：{detail.bundles.join(', ')}</div>
          <div style={{ fontSize: 13 }}>dependencies：{Object.keys(detail.dependencies).length === 0 ? '（无）' : JSON.stringify(detail.dependencies)}</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <strong>plugin（{plugins.length}）：</strong>
            <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
              <input
                value={pluginPkg}
                onChange={(e) => setPluginPkg(e.target.value)}
                placeholder="包名/spec（npm / github:owner/repo / 本地路径）"
                style={{ flex: 1, padding: '4px 8px' }}
              />
              <button onClick={() => void doPluginAdd(detail.name)} disabled={busy}>安装</button>
            </div>
            {plugins.map((pl) => (
              <div key={pl.name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                <span>✓ {pl.name} <span style={{ color: '#888' }}>[{pl.kind}]</span></span>
                <button className="danger" onClick={() => void doPluginRemove(detail.name, pl.name)} disabled={busy}>卸载</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <strong>可热插拔 entry（{entries.length}）：</strong>
            {entries.length === 0 && <div style={{ color: '#888' }}>（无第三方 plugin entry，装一个第三方插件后这里可启停）</div>}
            {entries.map((e) => (
              <div key={e.entryId} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                <span>{e.disabled ? '⏸' : '✓'} {e.entryId} <span style={{ color: '#888' }}>[{e.moduleName}]</span></span>
                {e.disabled
                  ? <button onClick={() => void doPluginEnable(detail.name, e.entryId)} disabled={busy}>启用</button>
                  : <button onClick={() => void doPluginDisable(detail.name, e.entryId)} disabled={busy}>停用</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <pre className="error">{error}</pre>}

      {profiles.map((p) => (
        <div key={p.name}>
          <div className="row">
            <span className="name">{p.name}</span>
            <span className="shape">{p.shape}</span>
            <span className="meta">{p.bundles.join(', ')}</span>
            <button onClick={() => void start(p.name)} disabled={busy}>启动</button>
            <button onClick={() => void stop(p.name)} disabled={busy}>停止</button>
            <button onClick={() => void restart(p.name)} disabled={busy}>重启</button>
            <button onClick={() => void doShow(p.name)} disabled={busy}>详情</button>
            <button onClick={() => void doExport(p.name)} disabled={busy}>导出</button>
            <button className="danger" onClick={() => void remove(p.name)} disabled={busy}>删除</button>
          </div>
          {p.instances.map((inst) => (
            <div key={inst.id} className="instance">
              {inst.id} · {inst.status} · {inst.detail}
            </div>
          ))}
        </div>
      ))}
      {profiles.length === 0 && !busy && <p>没有 profile。</p>}
    </div>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(<App />)
}
