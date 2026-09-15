/**
 * QQ 音乐音质档位（标签与阶梯顺序）
 *
 * ⚠️ 这里**只保留标签和阶梯顺序**（界面展示、请求档位排序用）。
 * 「这首歌到底有没有这一档」的元数据判定（size_* / size_new）已收归 API：
 *   qqmusic-api-enhanced/util/quality.js → qualitySizeOk()
 *
 * 插件侧原先那份 isQualitySizeOk / pickBestAvailableQuality 是旧实现，语义已与 API 分叉
 * —— 少了「元数据里连一个 size 字段都没有就不拦」这层守卫，会把整首歌逐档误杀成
 * 「没音质可选」。已于 2026-09 删除；需要判档请调 API，别在这里再加一份。
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

/** 从高到低完整阶梯（与 API 侧 util/quality.js 的 LADDER 保持一致，已核对） */
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

/** 调试：摘要 size_new 与经典字段（仅用于日志） */
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
