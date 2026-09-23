/**
 * 2.0 功能闸门（**神秘开关**）
 *
 * 需求原话：「锅巴添加一个神秘开关，只有？？？的名字打开后……功能全部启用；
 *            没开启也和老版本一样，新版本命令也不响应」。
 *
 * 规则（只有这一处判定，别在别处写 `cfg.unlockV2 === true`）：
 *   · 开关字段 `unlockV2`，锅巴里**显示成 `？？？`**（见 guoba/schemas.js）
 *   · 关着 = 与老版本**逐字节相同**：新命令不响应（返回 false 放行，不报错、不提示）、
 *     帮助卡还是老那张、锅巴里看不到任何 2.0 分组
 *   · 打开 = 多平台点歌 + 新帮助 UI + 锅巴里的平台分组一起出现
 *
 * ⚠️ 判定必须**每次现读配置**：锅巴保存后立刻生效，不能缓存在模块顶层
 *   （老代码里踩过"读一次就写死"的坑，见仓库 README 的性能红线）。
 * ⚠️ 关闭时**不要**给任何提示 —— 需求要的是"和没装这个功能一样"，
 *   回一句"功能未开启"等于把彩蛋喊出来。
 */
import Config from '../components/Config.js'
import { PLATFORMS, VISIBLE_PLATFORMS, SEARCH_PLATFORMS, platformIdOf, platformQualities } from './platforms.js'

/** 开关字段名（锅巴 UI 上显示为 `？？？`） */
export const V2_FIELD = 'unlockV2'

/** 2.0 是否解锁（现读配置；任何异常都当作"没开"，绝不误放行） */
export function isV2Unlocked(cfg = null) {
  try {
    const c = cfg || Config.getConfig('qqmusic') || {}
    return c[V2_FIELD] === true
  } catch {
    return false
  }
}

/**
 * 2.0 命令的统一前置守卫
 * @returns {boolean} true = 已解锁，可以继续；false = 未解锁（调用方必须**直接 return false**）
 */
export function v2Ready() {
  return isV2Unlocked()
}

/** 单平台开关：`platforms: { netease: { enabled: false } }`；缺省 = 开 */
export function platformEnabled(cfg, id) {
  const key = platformIdOf(id) || String(id || '')
  const p = cfg?.platforms?.[key]
  if (!p) return true
  if (p === false) return false
  return p.enabled !== false
}

/** 该平台可点歌的最大列表条数（缺省用全局 maxList） */
export function platformMaxList(cfg, id) {
  const key = platformIdOf(id) || String(id || '')
  const n = Number(cfg?.platforms?.[key]?.maxList)
  if (Number.isFinite(n) && n > 0) return Math.min(n, 20)
  return Math.min(Number(cfg?.maxList) || 10, 20)
}

/**
 * 该平台的音质档位偏好（`platforms.<平台>.quality`）
 *
 * ⚠️ 与 `utils/platforms.js` 的 `platformQualities()` 同源：值必须在那家的档位清单里，
 * 不在（或没配）就回 `'auto'`，交给 API 用"该平台最高可用"。
 * API 侧还会再核一遍"现在能不能兑现"（比如网易云的无损要账号），
 * 拿不到会**如实回落**并在响应里给 `qualityNote` —— 所以这里不用替它兜底。
 */
export function platformQualityPref(cfg, id) {
  const key = platformIdOf(id) || String(id || '')
  const want = String(cfg?.platforms?.[key]?.quality || '').trim()
  if (!want || want.toLowerCase() === 'auto') return 'auto'
  // 回**注册表里的规范写法**（用户手改 yaml 写成 PQ/pq 都归一）——
  // 否则大小写不同的脏值会被原样带给 API，白等一次"不认识的档位"回落
  const hit = platformQualities(key).find((x) => x.value.toLowerCase() === want.toLowerCase())
  return hit && hit.value !== 'auto' ? hit.value : 'auto'
}

/**
 * 这家平台参与「跨平台补歌」吗（`platforms.<平台>.fill`，缺省 = 参与）
 *
 * 关掉的表现：#qqm点歌 的结果尾部不会再出现这家的候选（只在 #qqm<平台>点歌 里出现）
 */
export function platformFillEnabled(cfg, id) {
  const key = platformIdOf(id) || String(id || '')
  const v = cfg?.platforms?.[key]?.fill
  return v !== false
}

/**
 * 参与「跨平台补歌」的平台 id 集合
 *
 * ⚠️ 这里用 **SEARCH_PLATFORMS**（含隐藏平台，如 JioSaavn），而
 * `standaloneSourceIds()`（QQ 关掉时的跨平台点歌）用 **VISIBLE_PLATFORMS**（排除隐藏）。
 * **两处口径不同是有意的**：
 *   · 补歌只在 QQ 结果尾部加几条，冷门/外语曲多一家源是净赚，不该因为"界面上不展示"
 *     就把它的免费曲挡在外面；
 *   · 反过来，`#qqm<平台>点歌` 是要**教用户去用**的入口，隐藏平台不该出现在
 *     帮助/锅巴/点歌清单里，所以不进去。
 * 曾有人想把这两处统一成一个——别改，改了要么少一家免费源、要么把隐藏平台推到台前。
 */
export function fillSourceIds(cfg) {
  return SEARCH_PLATFORMS.filter((p) => platformEnabled(cfg, p.id) && platformFillEnabled(cfg, p.id)).map(
    (p) => p.id
  )
}

/**
 * QQ 音乐音源开关（`qqEnabled`，默认开）
 *
 * 关掉它 = 这个机器人**只用其它平台**（曲库仍能用免费曲点歌）：
 *   · `#qqm点歌` 直接搜「开着的那几家外部平台」，不再打 QQ
 *   · 曲库/收藏/日推这些**依赖 QQ 账号**的功能照旧存在，只是没有歌词/无损那一套
 * 需求原话：「QQ 也不是主营」—— 所以它必须能被关掉，而不是写死的唯一主干。
 */
export function qqSourceEnabled(cfg) {
  return cfg?.qqEnabled !== false
}

/** 可单独点歌的外部平台 id（按注册表顺序，QQ 关掉时就是"全部音源"） */
export function standaloneSourceIds(cfg) {
  return enabledPlatforms(cfg).map((p) => p.id)
}

/**
 * 当前**可用**的平台清单（2.0 未解锁 = 空数组）
 *
 * 帮助卡、`#qqm平台` 列表、锅巴预览都从它取，保证三处一致。
 */
export function enabledPlatforms(cfg) {
  if (!isV2Unlocked(cfg)) return []
  return VISIBLE_PLATFORMS.filter((p) => !p.own && platformEnabled(cfg, p.id))
}

/** 全部平台 id（含隐藏的），给测试与排障用 */
export function allPlatformIds() {
  return PLATFORMS.map((p) => p.id)
}

export default {
  V2_FIELD,
  isV2Unlocked,
  v2Ready,
  platformEnabled,
  platformMaxList,
  platformQualityPref,
  platformFillEnabled,
  fillSourceIds,
  qqSourceEnabled,
  standaloneSourceIds,
  enabledPlatforms,
  allPlatformIds,
}
