/**
 * /profile-manager 前端面板（浏览器侧，esbuild 打包成 lib/client.js）。
 * 自包含 React app：通过 /profile-manager/api/* 与 host 的 ProfileManager 服务通信。
 * 功能与 CLI 对齐：list / show / import / export / delete / start / stop / restart / status / doctor。
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

  const doShow = (name: string) => act(async () => {
    const data = await api('/show?name=' + encodeURIComponent(name))
    if (data.ok) setDetail({ name: data.name, bundles: data.bundles, dependencies: data.dependencies, patch: data.patch })
    else setError(data.error ?? 'show 失败')
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => void refresh()} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
        <button onClick={doctor} disabled={busy}>诊断</button>
      </div>

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
          <div style={{ fontSize: 13 }}>patch 层：{detail.patch === null || detail.patch.trim() === '' || detail.patch === '[]' ? '（空）' : <pre style={{ margin: '4px 0 0', fontSize: 12 }}>{detail.patch}</pre>}</div>
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
