/**
 * 锅巴顶层「QQ音乐管理」页。
 *
 * 标准锅巴没有插件自定义页面 API，但前端路由支持 `meta.frameSrc`：
 * 菜单项不填 component 时，路由会渲染 iframe。这里在运行时给
 * SystemService.queryMenus() 追加一个菜单项，并把页面/接口挂到
 * Guoba 的 Express app 上，因此不需要改锅巴源码。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Config from '../components/Config.js'
import { groupPlatforms } from '../utils/bridge.js'
import { hasApiToken, normalizeTargets, searchLocalLibrary, startLibrarySend } from '../utils/library-web.js'
import { normalizeApiBase } from '../utils/api.js'
import { logInfo, logWarn } from '../utils/log.js'
import { setSafeTimeout } from '../utils/async.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(ROOT, 'console')
const MENU_PATH = '/qqmusic-console'
const MAX_SEARCH = 200
const MAX_SEND_ITEMS = 50
const MAX_JOBS = 40

export const consoleToken = crypto.randomBytes(18).toString('base64url')
export { MENU_PATH }

const knownItems = new Map()
const jobs = new Map()
let retryTimer = null
let attempts = 0
let basePath = MENU_PATH
let stopped = false

const CONTENT_TYPES = {
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'bridge.js': 'text/javascript; charset=utf-8',
  'settings.html': 'text/html; charset=utf-8',
  'settings.js': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'logo.png': 'image/png',
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function validApiBase(value) {
  if (!value) return true
  try {
    const url = new URL(String(value))
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function sendAsset(res, name) {
  const file = path.join(ASSETS, name)
  try {
    const body = fs.readFileSync(file)
    res.statusCode = 200
    res.setHeader('Content-Type', CONTENT_TYPES[name] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
}

function hasConsoleCookie(req) {
  const cookie = String(req?.headers?.cookie || '')
  return cookie.split(';').some((part) => part.trim() === `qqmusic_console=${consoleToken}`)
}

function authorized(req, url) {
  if (url.searchParams.get('token') === consoleToken) return true
  // iframe 里的相对资源（style.css/app.js/settings.html）不会带 query，
  // 首次带 token 打开 HTML 时写 HttpOnly Cookie，后续同源请求靠它鉴权。
  return hasConsoleCookie(req)
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('请求 JSON 格式错误'))
      }
    })
    req.on('error', reject)
  })
}

function publicJob(job) {
  return {
    ...job,
    results: job.results || [],
  }
}

export async function consoleHandler(req, res) {
  const url = new URL(req.originalUrl || req.url || '/', 'http://127.0.0.1')
  if (!authorized(req, url)) {
    return sendJson(res, 403, { ok: false, error: '未授权，请从锅巴侧边栏重新打开页面' })
  }
  if (!hasConsoleCookie(req)) {
    res.setHeader('Set-Cookie', `qqmusic_console=${consoleToken}; Path=${basePath}; HttpOnly; SameSite=Lax`)
  }
  // 锅巴允许自定义挂载前缀；菜单路径可能出现在 /guoba/... 或自定义前缀下，
  // 用最后一段唯一路径定位，避免依赖 realMountPrefix 的具体值。
  const index = url.pathname.lastIndexOf(MENU_PATH)
  const rel = index >= 0
    ? url.pathname.slice(index + MENU_PATH.length).replace(/^\/+/, '')
    : ''

  try {
    if (req.method === 'GET' && (rel === '' || rel === 'index.html')) {
      return sendAsset(res, 'index.html')
    }
    if (
      req.method === 'GET' &&
      (rel === 'app.js' ||
        rel === 'bridge.js' ||
        rel === 'settings.html' ||
        rel === 'settings.js' ||
        rel === 'style.css' ||
        rel === 'logo.png')
    ) {
      return sendAsset(res, rel)
    }
    if (req.method === 'GET' && rel === 'api/groups') {
      return sendJson(res, 200, {
        ok: true,
        platforms: await groupPlatforms(),
      })
    }
    if (req.method === 'GET' && rel === 'api/api-config') {
      const cfg = Config.getConfig('qqmusic') || {}
      return sendJson(res, 200, {
        ok: true,
        apiBase: normalizeApiBase(cfg.apiBase),
        apiToken: String(cfg.apiToken || ''),
        hasToken: hasApiToken(),
      })
    }
    if (req.method === 'POST' && rel === 'api/api-config') {
      const body = await readBody(req)
      const apiBase = normalizeApiBase(body.apiBase)
      if (!validApiBase(apiBase)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'API 地址格式不正确，请填写 http/https 地址或裸域名',
        })
      }
      Config.mergeConfig('qqmusic', {
        apiBase,
        apiToken: String(body.apiToken || '').trim(),
      })
      return sendJson(res, 200, { ok: true, message: 'API 配置已保存' })
    }
    if (req.method === 'GET' && rel === 'api/search') {
      const query = String(url.searchParams.get('q') || '').trim()
      const limit = Math.max(1, Math.min(MAX_SEARCH, Number(url.searchParams.get('limit')) || 50))
      const result = await searchLocalLibrary({ query, limit })
      for (const item of result.items) knownItems.set(item.id, item)
      while (knownItems.size > 1000) knownItems.delete(knownItems.keys().next().value)
      return sendJson(res, 200, {
        ok: true,
        q: result.q,
        total: result.total,
        items: result.items,
      })
    }
    if (req.method === 'POST' && rel === 'api/send') {
      if (!hasApiToken()) {
        return sendJson(res, 409, {
          ok: false,
          code: 'TOKEN_REQUIRED',
          error: '还没有配置 API Token，请先在插件设置里填写后再发送',
        })
      }
      const body = await readBody(req)
      const ids = Array.isArray(body.ids)
        ? body.ids.map((id) => String(id || '')).slice(0, MAX_SEND_ITEMS)
        : []
      const items = ids.map((id) => knownItems.get(id)).filter(Boolean)
      if (!items.length) {
        return sendJson(res, 400, { ok: false, error: '曲库结果已过期，请重新搜索后再发送' })
      }
      const targets = normalizeTargets(Array.isArray(body.targets) ? body.targets : [])
      if (!targets.length) {
        return sendJson(res, 400, { ok: false, error: '请至少选择一个有效的群' })
      }
      const job = startLibrarySend({ targets, items })
      jobs.set(job.id, job)
      while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value)
      logInfo(`[qqmusic] 锅巴控制台开始发送：${items.length} 首 × ${targets.length} 群`)
      return sendJson(res, 200, {
        ok: true,
        jobId: job.id,
        songs: items.length,
        groups: targets.length,
      })
    }
    if (req.method === 'GET' && rel === 'api/job') {
      const id = String(url.searchParams.get('id') || '')
      const job = jobs.get(id)
      if (!job) return sendJson(res, 404, { ok: false, error: '任务不存在或已过期' })
      return sendJson(res, 200, { ok: true, job: publicJob(job) })
    }
    return sendJson(res, 404, { ok: false, error: '接口不存在' })
  } catch (error) {
    if (error?.code === 'TOKEN_REQUIRED') {
      return sendJson(res, 409, { ok: false, code: 'TOKEN_REQUIRED', error: error.message })
    }
    logWarn(`[qqmusic] 锅巴控制台请求失败：${error?.message || error}`)
    return sendJson(res, 500, { ok: false, error: error?.message || String(error) })
  }
}

export function consoleMenuItem(pathPrefix = basePath) {
  return {
    // 前端路由 path 不能带锅巴挂载前缀（锅巴自身挂在 /guoba 下），iframe 地址才带前缀。
    path: MENU_PATH,
    name: 'QQMusicConsole',
    meta: {
      title: 'QQ音乐管理',
      icon: 'ion:musical-notes-outline',
      iconColor: '#31c27c',
      frameSrc: `${pathPrefix}/?token=${consoleToken}`,
    },
  }
}

function mountApp() {
  const app = global.Guoba?.app
  if (!app || typeof app.use !== 'function') return false
  if (!app.__qqmusicConsolePaths) app.__qqmusicConsolePaths = new Set()
  if (app.__qqmusicConsolePaths.has(basePath)) return true
  app.use(basePath, consoleHandler)
  app.__qqmusicConsolePaths.add(basePath)
  return true
}

async function resolveBasePath() {
  const GI = global.Guoba?.GI
  if (typeof GI !== 'function') return
  try {
    const mod = await GI('@/models/platform.js')
    const prefix = String(mod?._paths?.server?.realMountPrefix || '').replace(/\/+$/, '')
    if (prefix) basePath = prefix + MENU_PATH
  } catch {
    // 独立运行/单测没有 Guoba 平台模块，使用根路径
  }
}

async function patchPrototypeMenus() {
  const GI = global.Guoba?.GI
  if (typeof GI !== 'function') return false
  try {
    const mod = await GI('#/service/both/system/SystemService.js')
    const proto = mod?.SystemService?.prototype
    if (!proto || typeof proto.queryMenus !== 'function') return false
    if (proto.__qqmusicConsolePatched) return true
    const original = proto.queryMenus
    proto.queryMenus = async function (...args) {
      const menus = await original.apply(this, args)
      if (!Array.isArray(menus) || menus.some((item) => item?.name === 'QQMusicConsole')) return menus
      menus.push(consoleMenuItem(basePath))
      return menus
    }
    proto.__qqmusicConsolePatched = true
    return true
  } catch (error) {
    logWarn(`[qqmusic] 注册锅巴独立页面失败：${error?.message || error}`)
    return false
  }
}

async function patchServiceInstance() {
  const GI = global.Guoba?.GI
  if (typeof GI !== "function") return false
  try {
    const platform = await GI("@/models/platform.js")
    const root = String(platform?._paths?.pluginRoot || "")
    if (!root) return false
    // 必须用无 query 的文件 URL：锅巴 DI 用 loadClass 的 ?timestamp 加载服务类，
    // 通过 GI 再导入会得到另一个模块实例，改 prototype 不会影响实际服务。
    const framework = await import(pathToFileURL(path.join(root, "framework", "index.js")).href)
    const map = framework?.instancesMap
    const service = map?.get?.("systemService") || map?.get?.("SystemService")
    if (!service || typeof service.queryMenus !== "function") return false
    if (service.__qqmusicMenuPatched) return true
    const original = service.queryMenus.bind(service)
    service.queryMenus = async function (...args) {
      const menus = await original(...args)
      if (!Array.isArray(menus) || menus.some((item) => item?.name === 'QQMusicConsole')) return menus
      menus.push(consoleMenuItem(basePath))
      return menus
    }
    service.__qqmusicMenuPatched = true
    return true
  } catch {
    return false
  }
}

async function patchMenus() {
  await patchPrototypeMenus()
  return await patchServiceInstance()
}

/**
 * 在 supportGuoba() 里调用。锅巴启动时 app/server 可能还没就绪，
 * 因此最多重试 120 秒（1 秒一次）；菜单与页面都就绪后自动停止。
 */
export function registerConsole() {
  if (typeof global === 'undefined') return
  if (stopped || retryTimer) return
  const tick = async () => {
    attempts += 1
    let mounted = false
    if (global.Guoba) {
      await resolveBasePath()
      mounted = mountApp()
    }
    const patched = await patchMenus()
    if ((patched && mounted) || attempts >= 120) {
      stopped = true
      retryTimer = null
      if (patched && mounted) {
        logInfo('[qqmusic] 锅巴「QQ音乐管理」菜单已注册')
      } else {
        logWarn('[qqmusic] 未找到锅巴 systemService，侧栏入口未注册')
      }
    }
  }
  const schedule = () => {
    if (stopped) return
    retryTimer = setSafeTimeout(
      async () => {
        retryTimer = null
        await tick()
        schedule()
      },
      attempts === 0 ? 0 : 1000,
      'QQ音乐控制台页面注册'
    )
    retryTimer.unref?.()
  }
  schedule()
}
