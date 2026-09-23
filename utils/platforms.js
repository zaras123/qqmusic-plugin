/**
 * 平台注册表（**单一事实来源**）
 *
 * 为什么要有这个文件：平台信息原先散在四处 ——
 *   · `utils/api.js` 的 SOURCE_META（卡片上的名字/图标/颜色）
 *   · `utils/quality.js` / 各 provider 的音质口径
 *   · 锅巴 schema 里手写的下拉项
 *   · 帮助卡里手抄的一行行文案
 * 加一家平台就得改四处，漏一处的表现是"卡片上显示 ne_xxxx 这种原始 id"。
 * 现在只在这里定义，其余地方**一律引用**。
 *
 * ⚠️ 本文件必须**保持纯净**（不 import Config、不读磁盘、不联网）：
 *   · 锅巴 schema 会在配置界面打开时 import 它（要能独立跑）
 *   · 单测直接 import 它做静态断言
 * 「这家平台现在开没开、用什么音质」属于**配置**，在 utils/v2.js 里解析。
 *
 * `apiSource` = 调 API 时 `?source=` 用的名字，与 API 端 `util/providers/*` 的 name 一一对应；
 * 只有 API 注册过的平台才填（填错的表现是"点了这家但返回 400 不支持的平台"）。
 */

/**
 * 平台清单。顺序 = 帮助卡/锅巴里的展示顺序（QQ 在最前，其余按普及度排）。
 *
 * @typedef {object} Platform
 * @property {string} id          内部 id（= API 的 source 名）
 * @property {string} label       展示名（卡片、帮助、锅巴统一用它）
 * @property {string[]} aliases   命令别名（`#qqm<别名>点歌`，大小写不敏感）
 * @property {string} [short]     最短写法（帮助/锅巴里给用户抄的那个，如「网易」「B站」「yt」）
 * @property {string} [icon]      来源图标（没有就用文字标签，别留空 src）
 * @property {string} color       品牌色（卡片角标用）
 * @property {string} quality     该平台**免登录**能拿到的档位（展示口径，与 API 一致）
 * @property {Array}  [qualities] 这家平台可点名要的档位（与 API `util/providers/index.js`
 *                                的 `QUALITY_OPTIONS` **一一对应**，锅巴的"音质档位"用它）
 * @property {boolean} [hidden]   true = 不在帮助/锅巴里展示（但别名仍可解析）
 * @property {boolean} [own]      true = QQ 音乐本体
 * @property {boolean} [qrLogin]  true = 支持**扫码登录**（`#qqm<平台>登录`，凭据写进共享那份）
 */
export const PLATFORMS = Object.freeze([
  {
    id: 'qq',
    label: 'QQ音乐',
    aliases: ['qq', 'QQ', 'qq音乐', 'QQ音乐'],
    icon: 'https://p.qpic.cn/qqconnect/0/app_100497308_1626060999/100',
    color: '#31c27c',
    quality: '320k+',
    own: true,
  },
  {
    id: 'netease',
    prefix: 'ne_', // 与 API provider 的 PREFIX 一致（识别"这首是外源曲"）
    label: '网易云',
    // 别名要覆盖用户**真会打**的写法（含"网易云音乐"这种全称）——少一个就变成"命令没反应"
    aliases: ['网易云音乐', '网易云', '网易', '网抑云', 'netease', '163'],
    short: '网易',
    icon: 'https://i.gtimg.cn/open/app_icon/00/49/50/85/100495085_100_m.png',
    color: '#c62f2f',
    quality: '128k',
    // 扫码登录：API 侧 `/netease/login/qrcode` + `/login/qrcode/check`（vendor 模块 + 我们归一化）
    qrLogin: true,
    // 与 API QUALITY_OPTIONS.netease 对齐；exhigh/lossless/hires 需要账号（API 侧校验，
    // 拿不到会如实回落并在响应里给 qualityNote）
    qualities: [
      { value: 'auto', label: '自动（该平台最高可用）' },
      { value: 'standard', label: '标准 128K' },
      { value: 'exhigh', label: '极高 320K（要账号）' },
      { value: 'lossless', label: '无损（要账号）' },
      { value: 'hires', label: 'Hi-Res（要账号）' },
    ],
  },
  {
    id: 'kuwo',
    prefix: 'kw_',
    label: '酷我',
    aliases: ['酷我', 'kuwo'],
    short: '酷我',
    icon: 'https://p.qpic.cn/qqconnect/0/app_100243533_1636374695/100',
    color: '#ffb500',
    quality: '128k',
    // 扫码登录：API 侧 `/kugou/login/qrcode` + `/login/qrcode/check`
    qrLogin: true,
    // 酷我是签名通道、单档位：只给"自动"，不给假选择
  },
  {
    id: 'bilibili',
    prefix: 'bi_',
    label: 'B站',
    aliases: ['b站', 'B站', '哔哩哔哩', '哔哩', 'bilibili'],
    short: 'B站',
    icon: 'https://i.gtimg.cn/open/app_icon/00/95/17/76/100951776_100_m.png',
    color: '#fb7299',
    quality: '192k',
  },
  {
    id: 'kugou',
    prefix: 'ku_',
    label: '酷狗',
    aliases: ['酷狗音乐', '酷狗', 'kugou'],
    short: '酷狗',
    icon: 'https://open.gtimg.cn/open/app_icon/00/20/51/41/205141_100_m.png',
    color: '#0ea0e8',
    quality: '128k',
    qualities: [
      { value: 'auto', label: '自动（该平台最高可用）' },
      { value: '128', label: '标准 128K' },
      { value: '320', label: '极高 320K（要账号）' },
      { value: 'flac', label: '无损 FLAC（要账号）' },
      { value: 'hires', label: 'Hi-Res（要账号）' },
    ],
    // 酷狗**没配凭据就用不了**（搜索要登录态）：不是"没搜到"，接口会回 unavailable 原因
    needsCredential: true,
  },
  {
    id: 'qishui',
    prefix: 'qs_',
    label: '汽水',
    aliases: ['汽水', '汽水音乐', 'qishui', '抖音音乐'],
    short: '汽水',
    color: '#00e0c6',
    quality: '256k',
    // 扫码登录：API 侧 `/qishui/login/qrcode` + `/login/status?token=`（抖音 App 扫）
    qrLogin: true,
    qualities: [
      { value: 'auto', label: '自动（该平台最高可用）' },
      { value: 'highest', label: '免费最高档' },
      { value: 'lossless', label: '无损（要会员）' },
      { value: 'hires', label: 'Hi-Res（要会员）' },
    ],
    needsCredential: true,
  },
  {
    id: 'migu',
    prefix: 'mg_',
    label: '咪咕',
    aliases: ['咪咕音乐', '咪咕', 'migu'],
    short: '咪咕',
    color: '#ff5a5f',
    quality: '128k',
    // 匿名（也是本项目唯一能走的通道）只有 PQ —— "自动"与"PQ"结果完全一样，
    // 所以**不给档位选择器**（给一个二选一但没有区别的开关就是噪声）。
    // API 侧仍登记了 PQ（`QUALITY_OPTIONS.migu`），将来接入 VIP 凭据再在这里补 HQ/SQ。
  },
  {
    id: 'youtube',
    prefix: 'yt_',
    label: 'YouTube',
    aliases: ['youtube', 'YouTube', '油管', 'yt'],
    short: 'yt',
    color: '#ff0033',
    quality: '128k',
    needsCredential: true, // 国内必须要有出网代理
  },
  {
    id: 'apple',
    prefix: 'ap_',
    label: 'Apple Music',
    aliases: ['apple', 'Apple', 'apple music', 'Apple Music', '苹果音乐', '苹果', 'am'],
    short: 'am',
    color: '#fa2a55',
    quality: '256k',
    needsCredential: true, // 元数据免配，音频/搜索要 sidecar
  },
  {
    // 印度/宝莱坞强，中文基本没有 —— 默认不在帮助里露脸，但 `#qqmjiosaavn点歌` 仍可用
    id: 'jiosaavn',
    prefix: 'js_',
    label: 'JioSaavn',
    aliases: ['jiosaavn', 'saavn'],
    color: '#2bc5b4',
    quality: '320k',
    hidden: true,
  },
])

/** id → 平台 */
export const PLATFORM_MAP = Object.freeze(
  Object.fromEntries(PLATFORMS.map((p) => [p.id, p]))
)

/** 帮助卡 / 锅巴里展示的平台（hidden 的除外） */
export const VISIBLE_PLATFORMS = Object.freeze(PLATFORMS.filter((p) => !p.hidden))

/** 真正能吃 `#qqm<平台>点歌` 的平台（QQ 本体走原有的 `#qqm点歌`，不在这里） */
export const SEARCH_PLATFORMS = Object.freeze(PLATFORMS.filter((p) => !p.own))

/** 别名 → id（全小写，含 label 本身） */
const ALIAS_MAP = (() => {
  const m = new Map()
  for (const p of PLATFORMS) {
    for (const a of [p.id, p.label, ...(p.aliases || [])]) {
      const k = String(a).trim().toLowerCase()
      if (k && !m.has(k)) m.set(k, p.id)
    }
  }
  return m
})()

/** 别名 → id；认不出返回空串（大小写不敏感） */
export function platformIdOf(name = '') {
  return ALIAS_MAP.get(String(name || '').trim().toLowerCase()) || ''
}

/** 取平台对象（认不出返回 null） */
export function platformOf(name = '') {
  const id = platformIdOf(name)
  return id ? PLATFORM_MAP[id] : null
}

/**
 * 按 songmid 的**前缀**认平台（`ne_123` → netease）
 *
 * ⚠️ 别再手写 `^(ne|kw|bi)_`：那种写死清单在加平台时必漏（汽水 qs_/酷狗 ku_/咪咕 mg_/
 * YouTube yt_/Apple ap_/JioSaavn js_ 全都不在里面），漏掉的后果是**外源曲被当成 QQ 曲**
 * ——多打一次详情请求、还会拿 QQ 的档位阶梯去套它。
 */
export function platformOfMid(songmid = '') {
  const s = String(songmid || '')
  return PLATFORMS.find((p) => p.prefix && s.startsWith(p.prefix)) || null
}

/** 是不是外部平台曲目（前缀能认出来就算） */
export function isExternalMid(songmid = '') {
  return Boolean(platformOfMid(songmid))
}

/** 展示名：认不出的**原样返回**（卡片上宁可显示 id 也别显示空白） */
export function platformLabel(name = '') {
  return platformOf(name)?.label || String(name || '')
}

/** 来源图标；没有图标的平台返回空串（模板据此走文字标签，别渲染空的 <img src="">） */
export function platformIcon(name = '') {
  return platformOf(name)?.icon || ''
}

/** 品牌色（卡片角标/描边用）；未知平台给中性灰 */
export function platformColor(name = '') {
  return platformOf(name)?.color || '#8a8a8e'
}

/** 该平台免登录能拿到的档位（未知平台空串） */
export function platformQuality(name = '') {
  return platformOf(name)?.quality || ''
}

/** 最短写法（帮助/锅巴里给用户抄的那个；没登记就退回 label） */
export function platformShort(name = '') {
  const p = platformOf(name)
  return p?.short || p?.label || String(name || '')
}

/**
 * 该平台**可点名要**的档位（锅巴"音质档位"下拉用它）
 *
 * ⚠️ 只有真能生效的才给多项 —— 数据源是 API 侧 `util/providers/index.js` 的
 * `QUALITY_OPTIONS`，两边要一起改。给一个点了没用的选择器比不给更糟。
 */
export function platformQualities(name = '') {
  const list = platformOf(name)?.qualities
  return Array.isArray(list) && list.length
    ? list.map((x) => ({ ...x }))
    : [{ value: 'auto', label: '自动（该平台最高可用）' }]
}

/** 这家除了"自动"还有别的档位可选吗（没有就干脆不显示选择器） */
export function platformHasQualityChoice(name = '') {
  return platformQualities(name).some((x) => x.value !== 'auto')
}

/** 这家支持扫码登录吗（帮助/平台清单/登录命令共用这一份事实） */
export function platformCanQrLogin(name = '') {
  return platformOf(name)?.qrLogin === true
}

/**
 * 别名正则片段（拼进 `#qqm(…)点歌` 用）
 *
 * ⚠️ 长别名排前面：正则交替是"先匹配先赢"，`网易` 排在 `网易云` 前面时
 * 「#qqm网易云点歌」会被切成长度为 2 的平台名 + 关键词"云点歌"。
 */
export function platformAliasPattern({ includeOwn = false } = {}) {
  const list = (includeOwn ? PLATFORMS : SEARCH_PLATFORMS).flatMap((p) => [
    p.id,
    p.label,
    ...(p.aliases || []),
  ])
  const uniq = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))]
  uniq.sort((a, b) => b.length - a.length)
  // 转义正则元字符（别名里有 `.` 之类也不会炸）
  return uniq.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
}

/** 卡片/响应里用的元信息（与旧 `SOURCE_META` 同形状，保持兼容） */
export const SOURCE_META = Object.freeze(
  Object.fromEntries(
    PLATFORMS.map((p) => [p.id, { label: p.label, icon: p.icon || '', color: p.color }])
  )
)

/** id → 展示名（旧导出，保持兼容） */
export const SOURCE_LABEL = Object.freeze(
  Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))
)

export default {
  PLATFORMS,
  PLATFORM_MAP,
  VISIBLE_PLATFORMS,
  SEARCH_PLATFORMS,
  SOURCE_META,
  SOURCE_LABEL,
  platformIdOf,
  platformOf,
  platformOfMid,
  isExternalMid,
  platformLabel,
  platformIcon,
  platformColor,
  platformQuality,
  platformShort,
  platformQualities,
  platformHasQualityChoice,
  platformCanQrLogin,
  platformAliasPattern,
}
