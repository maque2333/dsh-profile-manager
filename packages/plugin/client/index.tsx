/**
 * /profile-manager 前端面板（浏览器侧，esbuild 打包成 lib/client.js）。
 * 自包含 React app：通过 /profile-manager/api/* 与 host 的 ProfileManager 服务通信。
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => void refresh()} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
        <button onClick={doctor} disabled={busy}>诊断</button>
      </div>
      {error && <pre className="error">{error}</pre>}
      {profiles.map((p) => (
        <div key={p.name}>
          <div className="row">
            <span className="name">{p.name}</span>
            <span className="shape">{p.shape}</span>
            <span className="meta">{p.bundles.join(', ')}</span>
            <button onClick={() => void start(p.name)} disabled={busy}>启动</button>
            <button onClick={() => void stop(p.name)} disabled={busy}>停止</button>
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
