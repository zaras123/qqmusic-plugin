/**
 * 主题（多套 UI）：发现、解析、热更新
 *
 * 目录约定：resources/themes/<主题id>/{theme.json, qqmusic-*.html}
 *   - 主题只实现其中几张卡也可以，缺的自动回落到 classic 的同名模板
 *   - theme.json 决定页面底色、视口宽度、是否支持深色
 *
 * 本模块**不依赖 art-template / puppeteer**（保持纯 fs 逻辑，方便单测）；
 * 模板编译缓存的失效由 render.js 拿到 fileChanged() 的结果后自己清。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pluginPath } from './path.js'

export const THEMES_DIR = path.join(pluginPath, 'resources', 'themes')
export const DEFAULT_THEME = 'classic'

/** 插件全部卡片（模板文件名 = 卡片名） */
export const CARDS = [
  'qqmusic-help',
  'qqmusic-list',
  'qqmusic-detail',
  'qqmusic-lyric',
  'qqmusic-hot',
  'qqmusic-comment',
  'qqmusic-status',
  'qqmusic-settings',
]

/** id → { mtimeMs, manifest }；theme.json 改了自动失效 */
const manifestCache = new Map()
/** file → mtimeMs，用于判断模板是否需要重新编译 */
const mtimeCache = new Map()

/** 一天里的四个时段（底色跟着时段走，卡片颜色一天里是活的） */
export const TIME_PERIODS = ['dawn', 'day', 'dusk', 'night']
export const TIME_LABEL = { dawn: '清晨', day: '白天', dusk: '黄昏', night: '夜晚' }

/**
 * 当前时段（纯函数，便于测试固定时间）
 *   清晨 5-8 / 白天 8-17 / 黄昏 17-20 / 夜晚 20-5
 */
export function timePeriodOf(date = new Date()) {
  const h = Number(new Date(date).getHours())
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

/** 目录下有哪些主题（只认带 theme.json 的目录） */
export function listThemeIds() {
  try {
    return fs
      .readdirSync(THEMES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((id) => fs.existsSync(path.join(THEMES_DIR, id, 'theme.json')))
      .sort()
  } catch {
    return []
  }
}

/** 把缺字段的 theme.json 补成完整契约；坏值一律给安全默认，别让渲染炸掉 */
export function normalizeManifest(id, raw = {}) {
  const bg = raw.pageBg && typeof raw.pageBg === 'object' ? raw.pageBg : {}
  const cardWidth = raw.cardWidth && typeof raw.cardWidth === 'object' ? raw.cardWidth : {}
  const vw = Number(raw.viewportWidth)
  return {
    id,
    name: String(raw.name || id),
    desc: String(raw.desc || ''),
    dark: raw.dark === true,
    pageBg: {
      light: String(bg.light || '#F2F2F7'),
      // 只有声明支持深色的主题才需要深色底
      ...(raw.dark === true ? { dark: String(bg.dark || '#000000') } : {}),
    },
    viewportWidth: vw > 0 ? vw : 640,
    cardWidth,
  }
}

/** 读某个主题的 manifest（按 mtime 缓存） */
export function loadManifest(id) {
  const file = path.join(THEMES_DIR, id, 'theme.json')
  let st
  try {
    st = fs.statSync(file)
  } catch {
    return null
  }
  const cached = manifestCache.get(id)
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.manifest

  let manifest
  try {
    manifest = normalizeManifest(id, JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    // theme.json 写坏了：按默认值渲染，别让整张卡发不出去
    manifest = normalizeManifest(id, {})
  }
  manifestCache.set(id, { mtimeMs: st.mtimeMs, manifest })
  return manifest
}

/** uiDark 归一：true=深色 / false=浅色 / 'auto'=跟随时间（夜晚自动深色） */
export function darkPrefOf(v) {
  if (v === true) return 'dark'
  if (v === false || v === undefined || v === null || v === '') return 'light'
  const s = String(v).trim().toLowerCase()
  if (s === 'auto' || s === 'time' || s === '自动') return 'auto'
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === 'dark') return 'dark'
  return 'light'
}

/**
 * 解析出本次要用的主题
 * @param {object} cfg 插件配置（读 uiTheme / uiDark）
 * @param {{now?: number|Date}} [opts] now 用于测试固定时间
 * @returns {{id, requested, fallback, dir, manifest, period, darkPref, dark}}
 */
export function resolveTheme(cfg = {}, opts = {}) {
  const requested = String(cfg.uiTheme || '').trim() || DEFAULT_THEME
  const ids = listThemeIds()
  const id = ids.includes(requested) ? requested : DEFAULT_THEME
  const manifest = loadManifest(id) || loadManifest(DEFAULT_THEME) || normalizeManifest(id, {})
  // uiTimeColor 关掉就固定用白天那套底色（关掉的人要的是稳定观感）
  const useTimeColor = cfg.uiTimeColor !== false
  const period = useTimeColor
    ? timePeriodOf(opts.now === undefined ? new Date() : opts.now)
    : 'day'
  const darkPref = darkPrefOf(cfg.uiDark)
  return {
    id,
    requested,
    fallback: id !== requested,
    dir: path.join(THEMES_DIR, id),
    manifest,
    period,
    useTimeColor,
    darkPref,
    // 主题不支持深色时，配置里的 uiDark 不生效
    dark: manifest.dark === true && (darkPref === 'dark' || (darkPref === 'auto' && period === 'night')),
  }
}

/**
 * 某张卡在该主题下的模板文件；该主题没实现这张卡就回落到 classic。
 * @returns {{file: string|null, from: string|null, fallback: boolean}}
 */
export function templateFile(theme, card) {
  const own = path.join(theme.dir, `${card}.html`)
  if (fs.existsSync(own)) return { file: own, from: theme.id, fallback: false }
  const base = path.join(THEMES_DIR, DEFAULT_THEME, `${card}.html`)
  if (fs.existsSync(base)) return { file: base, from: DEFAULT_THEME, fallback: true }
  return { file: null, from: null, fallback: false }
}

export function pageBgOf(theme) {
  const bg = theme.manifest?.pageBg || {}
  return (theme.dark ? bg.dark : bg.light) || bg.light || '#F2F2F7'
}

export function viewportWidthOf(theme, card) {
  const per = Number(theme.manifest?.cardWidth?.[card])
  if (per > 0) return per
  return Number(theme.manifest?.viewportWidth) || 640
}

/**
 * 模板文件是否变化过（变了 = 需要让 art-template 重新编译）
 * 首次调用必然返回 true —— 反正第一次也要编译。
 */
export function fileChanged(file) {
  let st
  try {
    st = fs.statSync(file)
  } catch {
    return true
  }
  const prev = mtimeCache.get(file)
  mtimeCache.set(file, st.mtimeMs)
  return prev !== st.mtimeMs
}

/** 一键清空所有缓存（#qqm界面 重载 用） */
export function invalidateAll() {
  manifestCache.clear()
  mtimeCache.clear()
}

/** 给命令用的主题清单 */
export function describeThemes() {
  return listThemeIds().map((id) => {
    const m = loadManifest(id)
    return {
      id,
      name: m?.name || id,
      desc: m?.desc || '',
      dark: m?.dark === true,
      cards: CARDS.filter((c) => fs.existsSync(path.join(THEMES_DIR, id, `${c}.html`))).length,
    }
  })
}
