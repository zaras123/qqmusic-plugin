/**
 * TRSS-Yunzai 适配器识别
 * 支持：ICQQ-Plugin / OneBotv11(WS) / QQBot-Plugin(ts-yf)
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
  const bot = e?.bot || (e?.self_id != null && global.Bot?.[e.self_id]) || null
  const id = String(bot?.adapter?.id || e?.adapter_id || '').trim()
  const name = String(bot?.adapter?.name || e?.adapter_name || '').trim()
  const lowerId = id.toLowerCase()
  const lowerName = name.toLowerCase()

  let kind = 'unknown'
  if (lowerId === 'qqbot' || lowerName === 'qqbot' || lowerName.includes('qqbot')) {
    kind = 'qqbot'
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
    // TRSS OneBotv11 适配器 id 也是 "QQ"，靠 name / sendApi 区分
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
  // QQBot 官方走 segment.file → 适配器内部 files API；ICQQ 走 group.sendFile/fs
  const preferSegmentFile = kind === 'qqbot'

  return {
    id: id || kind,
    name: name || kind,
    kind,
    selfId: e?.self_id ?? bot?.uin ?? bot?.self_id,
    supportsNativeMusic,
    supportsRecord,
    supportsGroupFile,
    preferSegmentFile,
  }
}

/** 确保 global.segment 可用（TRSS oicq 兼容层 / ICQQ / 兜底） */
export async function ensureSegment() {
  if (global.segment?.image && global.segment?.record && global.segment?.file) {
    return global.segment
  }

  const tries = [
    async () => (await import('oicq')).segment,
    async () => {
      const p = `${process.cwd()}/lib/modules/oicq/index.js`
      return (await import(`file://${p.replace(/\\/g, '/')}`)).segment
    },
    async () => (await import('icqq')).segment,
    async () => {
      const p = `${process.cwd()}/plugins/ICQQ-Plugin/node_modules/icqq/lib/message/elements.js`
      return (await import(`file://${p.replace(/\\/g, '/')}`)).segment
    },
  ]

  for (const fn of tries) {
    try {
      const seg = await fn()
      if (seg) {
        global.segment = { ...(global.segment || {}), ...seg }
        return global.segment
      }
    } catch {
      /* next */
    }
  }

  // 最小兜底，对齐 TRSS oicq segment 形状
  global.segment = global.segment || {
    image: (file, name) => ({ type: 'image', file, name }),
    record: (file, name) => ({ type: 'record', file, name }),
    video: (file, name) => ({ type: 'video', file, name }),
    file: (file, name) => ({ type: 'file', file, name }),
    at: (qq, name) => ({ type: 'at', qq, name }),
    music: (type, id) => ({ type: 'music', data: { type, id } }),
  }
  return global.segment
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
