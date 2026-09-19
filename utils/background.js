/**
 * 卡片自定义背景（仅声明了 bg 能力的主题支持，目前是 apple）
 *
 * 三种来源：
 *   · 服务器本地路径 —— Windows `D:\pics\a.jpg` 或 Linux `/root/pics/a.jpg`
 *   · 图片直链       —— https://…/a.jpg
 *   · 图片 API       —— 返回 JSON（里有图片地址）或直接 302/返回图片字节的接口
 *
 * 为什么远端图**必须由 Node 取回落成本地文件**：
 *   渲染是 puppeteer 新起 Chrome 打开本地 HTML，`page.goto(..., {waitUntil:'networkidle0'})`
 *   会等**所有**资源加载完 —— 远端图慢或挂掉会把整次渲染拖死（第三方封面拖慢渲染是同一个坑）。
 *   交给 Node 取回落盘后，Chrome 只读 file://，且同一批卡片共用一张图，视觉也连贯。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import axios from 'axios'
import { yunzaiPath } from './path.js'
import { logInfo, logWarn } from './log.js'

const CACHE_DIR = path.join(yunzaiPath, 'temp', 'qqmusic-bg')
const FETCH_TIMEOUT = 15000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
}

/** 判断配置值是本地路径还是远端地址（纯函数） */
export function classifyBgInput(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return 'remote'
  return 'file'
}

/**
 * 从图片 API 的返回里挑出图片地址（纯函数）
 * 覆盖常见形状：{url} / {data:{url}} / {data:[{url}]} / {imgurl} / {images:[…]} / 纯 URL 字符串
 */
export function pickImageUrl(payload, depth = 0) {
  if (payload == null || depth > 4) return ''
  if (typeof payload === 'string') {
    const s = payload.trim()
    return /^https?:\/\//i.test(s) ? s : ''
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const u = pickImageUrl(item, depth + 1)
      if (u) return u
    }
    return ''
  }
  if (typeof payload === 'object') {
    // 常见字段优先，命中率更高
    const preferred = ['url', 'imgurl', 'img_url', 'image', 'img', 'pic', 'picture', 'cover', 'acgurl', 'data', 'images', 'source']
    for (const k of preferred) {
      if (k in payload) {
        const u = pickImageUrl(payload[k], depth + 1)
        if (u) return u
      }
    }
    for (const v of Object.values(payload)) {
      const u = pickImageUrl(v, depth + 1)
      if (u) return u
    }
  }
  return ''
}

/**
 * 缓存是否该刷新（纯函数）
 * ttlMin 为 0 或负数 → 每次都刷新；meta 缺失 → 刷新
 */
export function shouldRefresh(meta, ttlMin, now = Date.now()) {
  // 注意用 typeof 判而不是真值判：at 为 0 是合法时间戳，用 !meta.at 会被误当成"没记录"
  if (!meta || typeof meta.at !== 'number') return true
  const ttl = Number(ttlMin)
  if (!Number.isFinite(ttl) || ttl <= 0) return true
  return now - meta.at > ttl * 60_000
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

const metaPath = (key) => path.join(CACHE_DIR, `bg-${key}.json`)

function readMeta(key) {
  try {
    return JSON.parse(fs.readFileSync(metaPath(key), 'utf8'))
  } catch {
    return null
  }
}

/** 缓存目录里这张 key 已有的图片文件（扩展名不定） */
function cachedImagePath(key) {
  try {
    const name = fs
      .readdirSync(CACHE_DIR)
      .find((n) => n.startsWith(`bg-${key}.`) && IMAGE_EXT.has(path.extname(n).toLowerCase()))
    return name ? path.join(CACHE_DIR, name) : ''
  } catch {
    return ''
  }
}

/** 靠魔术字节认图片（有些图片 API 不带 content-type，或给 application/octet-stream） */
function sniffImageExt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return ''
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp'
  if (buf[0] === 0x42 && buf[1] === 0x4d) return '.bmp'
  return ''
}

/** 取一张图；返回 { buf, ext }；JSON 响应会再往里找一层图片地址 */
async function fetchImage(url, { depth = 0, referer = '' } = {}) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT,
    maxRedirects: 5,
    headers: {
      'User-Agent': UA,
      Accept: 'image/*,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    validateStatus: () => true,
  })
  const ct = String(res.headers?.['content-type'] || '').toLowerCase()
  const buf = Buffer.from(res.data || [])
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`)

  // 先认图片：content-type 说了算，没说的话靠魔术字节。
  // 注意这一步必须在"体积够不够大"之前 —— JSON 响应本身可能只有几十字节，
  // 先判体积会把图片 API 直接拒掉（踩过）。
  const sniffed = sniffImageExt(buf)
  if (ct.startsWith('image/') || sniffed) {
    if (buf.length < 512) throw new Error('内容过小，不像是图片')
    return { buf, ext: sniffed || MIME_EXT[ct.split(';')[0].trim()] || '.jpg' }
  }

  // 不是图片 → 按图片 API 的 JSON 处理（很多接口返回 {url:…} / {data:{url:…}}）
  if (depth >= 2) throw new Error(`响应不是图片（${ct || '未知类型'}）`)
  let parsed = null
  try {
    parsed = JSON.parse(buf.toString('utf8').slice(0, 64 * 1024))
  } catch {
    /* 不是 JSON */
  }
  const inner = parsed ? pickImageUrl(parsed) : ''
  if (inner && inner !== url) {
    return fetchImage(inner, { depth: depth + 1, referer: url })
  }
  throw new Error(
    parsed ? '这个接口的返回里找不到图片地址' : `响应不是图片（${ct || '未知类型'}）`
  )
}

/**
 * 解析出本次要用的背景
 * @param {object} cfg 插件配置（读 uiBgEnable / uiBgValue / uiBgCacheMin）
 * @returns {Promise<{url:string, source:'file'|'remote', from:string, path:string}|null>}
 *   任何失败都返回 null —— 由调用方回落到主题自带的时段底色，绝不影响发卡
 */
export async function resolveBackground(cfg = {}) {
  if (cfg.uiBgEnable !== true) return null
  const raw = String(cfg.uiBgValue || '').trim()
  const kind = classifyBgInput(raw)
  if (!kind) return null

  if (kind === 'file') {
    if (!fs.existsSync(raw)) {
      logWarn(`自定义背景：找不到文件（${raw}）`)
      return null
    }
    const ext = path.extname(raw).toLowerCase()
    if (!IMAGE_EXT.has(ext)) {
      logWarn(`自定义背景：不是图片扩展名（${ext || '无扩展名'}），支持 ${[...IMAGE_EXT].join('/')}`)
      return null
    }
    return { url: pathToFileURL(path.resolve(raw)).href, source: 'file', from: 'file', path: raw }
  }

  // 远端：Node 侧取回 + 本地缓存
  const key = crypto.createHash('md5').update(raw).digest('hex').slice(0, 12)
  ensureDir(CACHE_DIR)
  const cached = cachedImagePath(key)
  const ttl = cfg.uiBgCacheMin === undefined || cfg.uiBgCacheMin === '' ? 10 : Number(cfg.uiBgCacheMin)

  if (cached && !shouldRefresh(readMeta(key), ttl)) {
    return { url: pathToFileURL(cached).href, source: 'remote', from: 'cache', path: cached }
  }

  try {
    const { buf, ext } = await fetchImage(raw)
    const file = path.join(CACHE_DIR, `bg-${key}${ext}`)
    // 清掉同一 key 的旧扩展名文件，避免目录里堆一串、扫到过期的
    for (const n of fs.readdirSync(CACHE_DIR)) {
      if (n.startsWith(`bg-${key}.`) && n !== path.basename(file) && IMAGE_EXT.has(path.extname(n).toLowerCase())) {
        try {
          fs.unlinkSync(path.join(CACHE_DIR, n))
        } catch {
          /* 删不掉就算了 */
        }
      }
    }
    fs.writeFileSync(file, buf)
    fs.writeFileSync(metaPath(key), JSON.stringify({ at: Date.now(), src: raw }))
    logInfo(`自定义背景已更新：${(buf.length / 1024).toFixed(0)}KB ← ${raw.slice(0, 80)}`)
    return { url: pathToFileURL(file).href, source: 'remote', from: 'fresh', path: file }
  } catch (err) {
    if (cached) {
      // 取新的失败就沿用旧的 —— 比突然变回纯色好
      logWarn(`自定义背景更新失败（${err.message}），沿用上次缓存`)
      return { url: pathToFileURL(cached).href, source: 'remote', from: 'stale', path: cached }
    }
    logWarn(`自定义背景获取失败：${err.message}`)
    return null
  }
}

/** 给命令/设置页显示用的一句话状态（不触发网络） */
export function describeBackground(cfg = {}) {
  if (cfg.uiBgEnable !== true) return '关闭'
  const raw = String(cfg.uiBgValue || '').trim()
  const kind = classifyBgInput(raw)
  if (!kind) return '已开启但没填地址'
  if (kind === 'file') return `本地图片 · ${path.basename(raw)}`
  const key = crypto.createHash('md5').update(raw).digest('hex').slice(0, 12)
  const cached = cachedImagePath(key)
  const ttl = cfg.uiBgCacheMin === undefined || cfg.uiBgCacheMin === '' ? 10 : Number(cfg.uiBgCacheMin)
  const fresh = cached && !shouldRefresh(readMeta(key), ttl)
  return `远端图片 · ${fresh ? '缓存最新' : cached ? '待更新' : '尚未缓存'} · 每 ${Number(ttl) > 0 ? `${ttl} 分钟` : '次'}更新`
}
