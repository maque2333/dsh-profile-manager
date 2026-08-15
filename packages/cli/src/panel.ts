/**
 * /profile-manager 面板路由（host 侧）：
 * - GET /profile-manager          → 面板 HTML（引用 client.js）
 * - GET /profile-manager/client.js → esbuild 打包的前端 bundle
 * - /profile-manager/api/*         → JSON API（调用 ctx.profileManager）
 * 全部 effect-owned（webServer.register 返回 disposer，自动随插件卸载）。
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// side-effect import：触发 dsh-host-webserver 的 declare module，使 ctx.webServer 类型可见。
import '@deepseek-ai/dsh-host-webserver'
import { DshmError } from '@dsh-profile-manager/core'
import type { ProfileManager } from './profile-manager.js'

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH Profile Manager</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; max-width: 960px; margin-inline: auto; }
  h1 { font-size: 20px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(128,128,128,.25); }
  .row .name { font-weight: 600; min-width: 140px; }
  .row .shape { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(128,128,128,.15); }
  .row .meta { color: #888; font-size: 12px; flex: 1; }
  button { cursor: pointer; border: 1px solid rgba(128,128,128,.4); background: transparent; border-radius: 6px; padding: 4px 10px; font-size: 13px; }
  button:hover { background: rgba(128,128,128,.12); }
  button.danger { color: #d33; border-color: #d33; }
  .instance { margin-left: 24px; font-size: 13px; color: #666; padding: 4px 0; }
  .error { color: #d33; white-space: pre-wrap; }
  code { background: rgba(128,128,128,.15); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<h1>DSH Profile Manager</h1>
<p id="hint">加载中…</p>
<div id="root"></div>
<script src="/profile-manager/client.js"></script>
</body>
</html>`

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk: Buffer | string) => { raw += chunk.toString() })
    req.on('end', () => {
      if (raw.trim() === '') { resolve(undefined); return }
      try { resolve(JSON.parse(raw)) } catch { resolve(undefined) }
    })
  })
}

/** 面板 HTML 引用的前端 bundle（esbuild 产物，与 host 的 lib/ 同目录）。 */
function clientBundlePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'client.js')
}

export function registerPanelRoutes(ctx: Context, pm: ProfileManager): void {
  ctx.webServer.register({
    kind: 'exact',
    path: '/profile-manager',
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(HTML)
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/profile-manager/client.js',
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const js = readFileSync(clientBundlePath(), 'utf8')
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
        res.end(js)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('client bundle 未构建：请先 pnpm build')
      }
    },
  })

  ctx.webServer.register({
    kind: 'prefix',
    path: '/profile-manager/api',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = url.pathname.slice('/profile-manager/api'.length)
      const method = (req.method ?? 'GET').toUpperCase()
      const body = method === 'POST' ? await readJsonBody(req) : undefined
      const name = url.searchParams.get('name') ?? undefined
      try {
        if (route === '/list' && method === 'GET') {
          return sendJson(res, 200, { ok: true, profiles: await pm.list() })
        }
        if (route === '/status' && method === 'GET') {
          return sendJson(res, 200, { ok: true, profiles: await pm.status(name) })
        }
        if (route === '/show' && method === 'GET' && name !== undefined) {
          return sendJson(res, 200, { ok: true, ...pm.show(name) })
        }
        if (route === '/start' && method === 'POST' && typeof body === 'object' && body !== null) {
          const start = body as { name?: unknown; port?: unknown }
          if (typeof start.name !== 'string') {
            return sendJson(res, 400, { ok: false, error: '缺少 name' })
          }
          const result = await pm.start(start.name, {
            port: typeof start.port === 'number' ? start.port : undefined,
          })
          return sendJson(res, 200, { ok: true, instance: result.record.id, status: result.status })
        }
        if (route === '/stop' && method === 'POST' && typeof body === 'object' && body !== null) {
          const stop = body as { id?: unknown; profile?: unknown }
          const { results } = await pm.stop(
            typeof stop.id === 'string' ? { ids: [stop.id] } : { profile: typeof stop.profile === 'string' ? stop.profile : undefined },
          )
          return sendJson(res, 200, { ok: true, results })
        }
        if (route === '/delete' && method === 'POST' && typeof body === 'object' && body !== null) {
          const del = body as { name?: unknown; purge?: unknown }
          if (typeof del.name !== 'string') {
            return sendJson(res, 400, { ok: false, error: '缺少 name' })
          }
          const result = pm.delete(del.name, { purge: del.purge === true })
          return sendJson(res, 200, { ok: true, ...result })
        }
        if (route === '/doctor' && method === 'GET') {
          return sendJson(res, 200, { ok: true, report: await pm.doctor() })
        }
        return sendJson(res, 404, { ok: false, error: `未知 API：${method} ${route}` })
      } catch (error) {
        if (error instanceof DshmError) {
          return sendJson(res, 400, { ok: false, error: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) })
        }
        return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
