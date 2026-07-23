/**
 * QQ 音乐音质档位（最高音质 + 自动降级/自适配）
 */
export const QQMUSIC_QUALITY_LIST = Object.freeze([
  { label: '自动（自适配最高可用）', value: 'auto' },
  { label: '标准 128K', value: '128' },
  { label: '较高 M4A', value: 'm4a' },
  { label: '极高 320K', value: '320' },
  { label: '无损 FLAC', value: 'flac' },
  { label: '无损 APE', value: 'ape' },
  { label: 'Hi-Res', value: 'hires' },
  { label: '臻品全景声', value: 'atmos' },
  { label: '臻品母带', value: 'master' },
  { label: '臻品母带2.0', value: 'atmos_master' },
])

/** 从高到低完整阶梯 */
export const QUALITY_LADDER = Object.freeze([
  'atmos_master',
  'master',
  'atmos',
  'hires',
  'flac',
  'ape',
  '320',
  'm4a',
  '128',
])

export const QUALITY_LABEL = Object.freeze({
  auto: '自动适配',
  ...Object.fromEntries(
    QQMUSIC_QUALITY_LIST.filter((i) => i.value !== 'auto').map((i) => [i.value, i.label])
  ),
})

/** size_new 下标 → 逻辑音质（仅映射有把握的） */
export const SIZE_NEW_INDEX = Object.freeze({
  0: 'master',
  2: 'hires',
  10: 'atmos',
})

/**
 * 读取 size_new[idx]；数组不能用 Number() 转（会得到 NaN）
 */
export function sizeNewAt(file = {}, idx = 0) {
  const arr = file?.size_new
  if (!Array.isArray(arr)) return 0
  const i = Number(idx)
  if (!Number.isFinite(i) || i < 0 || i >= arr.length) return 0
  const v = Number(arr[i] || 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** 某逻辑音质在 size_new 中的体积（0 表示没有） */
export function sizeNewForQuality(file = {}, type = '') {
  const t = String(type || '').toLowerCase()
  if (t === 'master' || t === 'atmos_master') return sizeNewAt(file, 0)
  if (t === 'hires') return sizeNewAt(file, 2)
  if (t === 'atmos' || t === 'dolby') return sizeNewAt(file, 10)
  return 0
}

/**
 * 生成待尝试的音质列表
 */
export function qualityCandidates(preferred = 'flac', fallback = true) {
  const q = String(preferred || 'flac').toLowerCase()

  if (q === 'auto' || q === 'adaptive' || q === 'best') {
    return fallback ? [...QUALITY_LADDER] : ['flac', '320', '128']
  }

  const idx = QUALITY_LADDER.indexOf(q)
  const start = idx >= 0 ? idx : QUALITY_LADDER.indexOf('flac')
  if (!fallback) return [QUALITY_LADDER[start] || '128']
  return QUALITY_LADDER.slice(start >= 0 ? start : 0)
}

/**
 * 仅根据 size_* / size_new 选出最高可用档（不请求 vkey）
 */
export function pickBestAvailableQuality(file = {}, preferred = 'auto') {
  const list = qualityCandidates(preferred, true)
  for (const type of list) {
    if (isQualitySizeOk(type, file)) return type
  }
  return '128'
}

/**
 * 根据 track_info.file 判断该档是否真实存在
 * - 经典字段 size_flac / size_hires / size_dolby …
 * - 新字段 size_new[i]（母带/增强档常只出现在这里）
 */
export function isQualitySizeOk(type, file = {}) {
  if (!file || typeof file !== 'object') return true
  const t = String(type || '').toLowerCase()
  const n = (k) => {
    const v = file[k]
    // 切勿 Number(数组)
    if (Array.isArray(v)) return 0
    const num = Number(v || 0)
    return Number.isFinite(num) ? num : 0
  }

  switch (t) {
    case '128':
      return n('size_128mp3') > 0 || n('size_96aac') > 0 || n('size_48aac') > 0
    case 'm4a':
      return n('size_48aac') > 0 || n('size_96aac') > 0 || n('size_192aac') > 0
    case '320':
      return n('size_320mp3') > 0 || sizeNewAt(file, 3) > 0
    case 'flac':
      return n('size_flac') > 0 || sizeNewAt(file, 1) > 0
    case 'ape':
      return n('size_ape') > 0
    case 'hires':
      // 经典 Hi-Res 或 size_new[2]
      return n('size_hires') > 0 || sizeNewAt(file, 2) > 0
    case 'atmos':
    case 'dolby':
      return n('size_dolby') > 0 || sizeNewAt(file, 10) > 0
    case 'master':
    case 'atmos_master':
      // 母带几乎只在 size_new[0]；勿把整个 size_new 数组 Number()
      // 也勿把 dolby/hires 误判成母带
      return n('size_master') > 0 || sizeNewAt(file, 0) > 0
    default:
      return true
  }
}

/** 调试：摘要 size_new 与经典字段 */
export function summarizeFileSizes(file = {}) {
  if (!file || typeof file !== 'object') return {}
  const n = (k) => Number(file[k] || 0) || 0
  const arr = Array.isArray(file.size_new) ? file.size_new.map((x) => Number(x) || 0) : []
  return {
    flac: n('size_flac'),
    hires: n('size_hires'),
    dolby: n('size_dolby'),
    s320: n('size_320mp3'),
    s128: n('size_128mp3'),
    new0: arr[0] || 0,
    new2: arr[2] || 0,
    new10: arr[10] || 0,
  }
}

/** 兼容旧名 */
export const isQualityAvailable = isQualitySizeOk
