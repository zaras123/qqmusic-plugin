/**
 * 适配器识别（Karin / node-karin）
 *
 * Karin 的事件带 `e.contact` + `e.bot.sendMsg`，协议族挂在 `e.bot.adapter.protocol`
 * （见 node-karin AdapterType）。本模块只做「这条事件走哪条发送路径」的判断，
 * 不依赖任何宿主全局 —— 拿不到就退到 unknown / 通用段。
 */

/**
 * @param {any} e
 * @returns {{
 *   id: string,
 *   name: string,
 *   kind: 'icqq' | 'onebot' | 'qqbot' | 'unknown',
 *   selfId: string|number|undefined,
 *   supportsNativeMusic: boolean,
 *   supportsRecord: boolean,
 *   supportsGroupFile: boolean,
 *   preferSegmentFile: boolean,
 * }}
 */
export function detectAdapter(e) {
  const bot = e?.bot || null
  const protocol = String(bot?.adapter?.protocol || '').trim().toLowerCase()
  const standard = String(bot?.adapter?.standard || '').trim().toLowerCase()
  const id = String(bot?.adapter?.id || protocol || e?.adapter_id || '').trim()
  const name = String(bot?.adapter?.name || e?.adapter_name || '').trim()
  const lowerId = id.toLowerCase()
  const lowerName = name.toLowerCase()

  let kind = 'unknown'
  if (
    protocol === 'qqbot' ||
    lowerId === 'qqbot' ||
    lowerName === 'qqbot' ||
    lowerName.includes('qqbot')
  ) {
    kind = 'qqbot'
  } else if (
    protocol === 'icqq' ||
    protocol === 'oicq' ||
    standard === 'icqq' ||
    standard === 'oicq'
  ) {
    kind = 'icqq'
  } else if (
    ['gocq-http', 'napcat', 'llonebot', 'lagrange', 'yogurt'].includes(protocol) ||
    standard === 'onebot11' ||
    standard === 'onebot12'
  ) {
    kind = 'onebot'
  } else if (
    lowerId === 'qq' &&
    (lowerName === 'icqq' || lowerName.includes('icqq'))
  ) {
    kind = 'icqq'
  } else if (
    lowerName.includes('onebot') ||
    lowerName.includes('napcat') ||
    lowerName.includes('llonebot') ||
    lowerName.includes('lagrange') ||
    typeof bot?.sendApi === 'function'
  ) {
    // OneBot 适配器 id 也可能是 "QQ"，靠 name / sendApi 区分
    if (lowerName === 'icqq') kind = 'icqq'
    else kind = 'onebot'
  } else if (lowerId === 'qq' && bot?.icqq) {
    kind = 'icqq'
  } else if (typeof bot?.sendApi === 'function') {
    kind = 'onebot'
  }

  // 二次启发式：ICQQ 有 sdk/icqq；QQBot 有 sdk.request 或 path data/QQBot
  if (kind === 'unknown' || kind === 'onebot') {
    if (bot?.icqq || bot?.sdk?.pickGroup) kind = 'icqq'
    if (bot?.adapter?.path === 'data/QQBot/' || bot?.sdk?.sessionManager) kind = 'qqbot'
  }

  const supportsNativeMusic = kind === 'onebot' || kind === 'icqq'
  const supportsRecord = true
  const supportsGroupFile = true
  // QQBot 官方走 segment.file → 适配器内部 files API；Karin / ICQQ 走原生上传
  const preferSegmentFile = kind === 'qqbot'

  return {
    id: id || kind,
    name: name || kind,
    kind,
    selfId: e?.self_id ?? e?.selfId ?? bot?.selfId ?? bot?.uin ?? bot?.self_id,
    supportsNativeMusic,
    supportsRecord,
    supportsGroupFile,
    preferSegmentFile,
  }
}

let segmentCache = null

/**
 * 取 Karin 的 segment 构造器。
 *
 * 只使用 node-karin 提供的 segment；离线测试 / 预览时给最小 stub。
 * 返回模块级缓存，不再挂到 global.segment。
 */
export async function ensureSegment() {
  if (segmentCache?.image && segmentCache?.record) return segmentCache

  try {
    const { segment } = await import('node-karin')
    if (segment && typeof segment.image === 'function' && typeof segment.record === 'function') {
      segmentCache = segment
      return segmentCache
    }
  } catch {
    /* 离线测试 / 预览 */
  }

  // 最小兜底
  segmentCache ||= {
    image: (file, name) => ({ type: 'image', file, name }),
    record: (file, name) => ({ type: 'record', file, name }),
    video: (file, name) => ({ type: 'video', file, name }),
    file: (file, name) => ({ type: 'file', file, name }),
    at: (qq, name) => ({ type: 'at', qq, name }),
    music: (type, id) => ({ type: 'music', data: { type, id } }),
  }
  return segmentCache
}

/**
 * 把本地路径规范成各适配器更易吃的 file 字段
 * - 绝对路径
 * - file://（部分 OneBot）
 * - 原样 http / base64
 */
export function normalizeMediaFile(fileOrUrl) {
  if (fileOrUrl == null) return ''
  if (typeof fileOrUrl !== 'string') return fileOrUrl
  const s = fileOrUrl.trim()
  if (!s) return s
  if (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('base64://') ||
    s.startsWith('base64:') ||
    s.startsWith('file://') ||
    s.startsWith('protobuf://')
  ) {
    return s
  }
  return s
}

export function isLocalPath(file) {
  if (typeof file !== 'string') return false
  if (
    file.startsWith('http://') ||
    file.startsWith('https://') ||
    file.startsWith('base64') ||
    file.startsWith('file://') ||
    file.startsWith('protobuf://')
  ) {
    return false
  }
  return true
}
