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
 * @property {object}  [auth]      凭据能力（**单一事实来源**：帮助卡 / 锅巴 / 命令 / 状态卡都读它）
 *   · `mode`：`qr`（可扫码）| `cookie`（只能粘贴）| `file`（粘贴的是一份文件全文，如 Apple）| `none`（匿名，不需要凭据）
 *   · `qr`：`{ app }` —— 扫码用哪个 App；**有它才允许** `#qqm<平台>登录`
 *   · `cookie`：`{ where, keys, file?, post?, field?, clear? }` —— 粘贴入口的出处与关键字段；
 *     **有它才允许** `#qqm<平台>ck <cookie>`。API 侧的路径与字段名都有默认值
 *     （`POST /<id>/cookies` + `cookie` 字段），只有 Apple 例外（字段叫 `cookies`、清除走 DELETE）——
 *     默认值只在 platformCookieOf() 里算一次，**调用方不许再手写路径**
 *   · `deeplink`：true = 另有 deep link 导入通道（目前只有 QQ 本体）
 *   · `note`：给用户的一句人话（匿名平台用它说明"为什么不需要配"）
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
    // QQ 本体不进 `#qqm<平台>登录` 那条通配规则：它的入口（#qqm登录 / 微信 / 登录qq / 绑定 deeplink）
    // 在 apps/login.js 里各写一条。这里登记能力，只为让帮助/状态卡/文档读到同一份事实。
    auth: { mode: 'qr', qr: { app: 'QQ音乐 App' }, deeplink: true },
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
    // 凭据能力：扫码（API `/netease/login/qrcode` + `/login/qrcode/check`）+ 粘贴（`POST /netease/cookies`）
    auth: {
      mode: 'qr',
      qr: { app: '网易云音乐' },
      cookie: {
        where: '登录 music.163.com → F12 → Application → Cookies，复制整串（别只复制 __csrf）',
        keys: 'MUSIC_U',
      },
    },
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
    // ⚠️ 酷我**没有扫码通道**（API 侧只有 `/kuwo/cookies`，没有 qrcode 模块）。
    //    这里曾错标成 `qrLogin: true` —— 用户照着帮助去发 `#qqm酷我登录`，只拿到一句"没这条通道"。
    //    它只能粘贴（Hm_Iuvt_*），所以 mode 是 cookie。
    auth: {
      mode: 'cookie',
      cookie: {
        where: '先打开一次 www.kuwo.cn（服务端会下发新的 Hm_Iuvt_*）→ F12 → Application → Cookies，复制整串',
        keys: 'Hm_Iuvt_*',
      },
    },
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
    /**
     * 凭据能力：扫码（API `/bilibili/login/qrcode`，哔哩哔哩 App 扫）+ 粘贴
     * （`POST /bilibili/cookies`，认 SESSDATA）。
     *
     * ⚠️ 这家与网易云/酷我一样是**增强项**：不配也能匿名搜/播（192k），
     *    配了才有多出来的 FLAC（大会员）档。所以它**不**标 needsCredential ——
     *    标了会让状态卡把"没配"写成红牌"未配置"，而它其实是能用的。
     *    以前这里写的是 `mode: 'none'`（"匿名，不需要配"），于是命令/帮助/锅巴
     *    三处都不提它能扫码，直到 2026-09-24 补上 API 侧的扫码接口才一起改。
     */
    auth: {
      mode: 'qr',
      qr: { app: '哔哩哔哩 App' },
      cookie: {
        where: '登录 bilibili.com → F12 → Application → Cookies，复制整串（关键是 SESSDATA，别只复制 bili_jct）',
        keys: 'SESSDATA',
      },
    },
    // 与 API `QUALITY_OPTIONS.bilibili` 对齐；flac 要大会员账号，API 侧会按"有没有配 SESSDATA"复核
    qualities: [
      { value: 'auto', label: '自动（该平台最高可用）' },
      { value: '192', label: '192K（免登录最高档）' },
      { value: 'flac', label: 'FLAC 无损（要大会员）' },
    ],
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
    // 凭据能力：扫码（API `/kugou/login/qrcode`）+ 粘贴（`POST /kugou/cookies`，认 token 与 userid）
    //   ⚠️ 这里以前**漏标**了扫码能力，于是帮助卡/锅巴都不提它能扫码（命令却一直能跑）——
    //      能力清单与实现必须一起改，不要再各写一份。
    auth: {
      mode: 'qr',
      qr: { app: '酷狗音乐' },
      cookie: {
        where: '登录 kugou.com → F12 → Application → Cookies，复制整串（关键是 token 与 userid，别只复制一个）',
        keys: 'token / userid',
      },
    },
  },
  {
    id: 'qishui',
    prefix: 'qs_',
    label: '汽水',
    aliases: ['汽水', '汽水音乐', 'qishui', '抖音音乐'],
    short: '汽水',
    color: '#00e0c6',
    quality: '256k',
    // 凭据能力：扫码（API `/qishui/login/qrcode`，抖音 App 扫）+ 粘贴（`POST /qishui/cookies`）
    //   上游风控（error_code 2046）时不时把扫码这条路掐掉，所以粘贴入口**必须有**
    auth: {
      mode: 'qr',
      qr: { app: '抖音 App（或汽水音乐）' },
      cookie: {
        where: 'PC 客户端或浏览器里复制 qishui.com 的整串 cookie（扫码被风控挡住时走这条）',
        keys: 'sessionid',
      },
    },
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
    // 说明要短：它还会被锅巴的页签表头直接顶到后面（太长会把那一行撑成两行）
    auth: { mode: 'none', note: '要 VIP 档位得等接入凭据' },
  },
  {
    id: 'youtube',
    prefix: 'yt_',
    label: 'YouTube',
    aliases: ['youtube', 'YouTube', '油管', 'yt'],
    short: 'yt',
    color: '#ff0033',
    quality: '128k',
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
    needsCredential: false,
    auth: {
      mode: 'cookie',
      cookie: {
        // 字段名不再写在这里 —— 下面 `keys` 已经列了，重复一遍只会把页签撑长
        where: '浏览器登录 youtube.com → F12 → 任一请求的 Cookie 头整串；或整份 Netscape cookies 文件全文（两种都认）',
        keys: 'SID / HSID / SSID / SAPISID / LOGIN_INFO',
      },
      note: 'API 侧必须配 YOUTUBE_PROXY；配 cookies 可过机器人校验/年龄限制/会员曲',
    },
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
    // Apple 的凭据不是"一行 cookie"，而是**一份 Netscape cookies 文件全文**（含 media-user-token），
    // 所以 mode 是 file：粘贴的是整份文件内容；API 字段名也跟别家不同（`cookies` 而不是 `cookie`）
    auth: {
      mode: 'file',
      cookie: {
        where: 'tools/apple-dl 的导出脚本产出的 Netscape cookies 全文（必须含 music.apple.com 的行）',
        keys: 'media-user-token',
        file: true,
        // 这两项是 Apple 与别家的差别：字段名是 cookies（不是 cookie），清除走 DELETE 同一条路
        field: 'cookies',
        clear: { path: '/apple/cookies', method: 'delete' },
      },
    },
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
    auth: { mode: 'none', note: '免登录直接搜/播（320k）' },
  },
  {
    // Audius：API 侧早就注册了（`util/providers/audius.js`，前缀 `au_`），插件这边一直没登记。
    // 后果不是"少一家音源"，而是 `au_xxx` 这种 songmid **认不出平台** → 被当成 QQ 曲
    // （白打一次详情请求、还会拿 QQ 的档位阶梯去套它）。补上，仍然 hidden（不在帮助里露脸）。
    id: 'audius',
    prefix: 'au_',
    label: 'Audius',
    aliases: ['audius'],
    color: '#7d3ce8',
    quality: '128k',
    hidden: true,
    auth: { mode: 'none', note: '免登录直接搜/播（128k）' },
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

/**
 * 归一化后的**凭据能力**（认不出的平台 = 匿名、什么都不能配）
 *
 * 单一事实来源：帮助卡 / 锅巴 / 命令行 / 卡片文案都读它 —— 别再各自判断 `p.qrLogin`。
 * 形状固定，所以调用方不用到处写 `?.` 兜底。
 */
export function platformAuthOf(name = '') {
  const a = platformOf(name)?.auth || {}
  return {
    mode: a.mode || 'none',
    qr: a.qr || null,
    cookie: a.cookie || null,
    deeplink: a.deeplink === true,
    note: a.note || '',
    anonymous: (a.mode || 'none') === 'none',
  }
}

/** 这家支持扫码登录吗（帮助/平台清单/登录命令共用这一份事实） */
export function platformCanQrLogin(name = '') {
  return Boolean(platformOf(name)?.auth?.qr)
}

/** 这家支持粘贴 cookie 吗（`#qqm<平台>ck <cookie>`） */
export function platformCanCookie(name = '') {
  return Boolean(platformOf(name)?.auth?.cookie)
}

/**
 * 这家**没配凭据就用不了**吗（`needsCredential`）
 *
 * 与"能不能配凭据"是两件事，别混：
 *   · 酷狗/汽水/YouTube/Apple —— true：没配好整个音源就是关的（状态卡给红牌"未配置"）
 *   · B站/网易云/酷我 —— false：**不配也能用**（匿名档），配了只是拿到更高的档
 * 状态卡据此决定"红牌未配置"还是"免登录可用"，所以必须是一份事实、一个函数。
 */
export function platformNeedsCredential(name = '') {
  return platformOf(name)?.needsCredential === true
}

/**
 * 凭据通道的**一句话标签**（帮助卡/状态卡的"这家怎么配"小标）
 *
 * 三种取值正好回答"哪几家能扫码、哪几家不能"：
 *   · `qr`     → 可扫码（有 `auth.qr`，命令是 `#qqm<平台>登录`）
 *   · `cookie` → 仅粘贴（只能粘，Apple 粘的是一整份文件 → 文案分开）
 *   · `none`   → 免凭据（没有账号体系，配了也没用）
 *
 * ⚠️ 色值的字段名是 `toneColor` 而**不是** `color`：这组字段会被 `...` 展开进
 *    平台条数据里，而那里已经有一个 `color`（**品牌色**）。叫 color 会把它覆盖掉，
 *    表现是"平台条的品牌色突然变成灰/绿"（这个 bug 就是这么写出来又抓回来的）。
 *
 * @returns {{tag:string, tone:'qr'|'cookie'|'none', toneColor:string}}
 */
export function platformAuthTag(name = '') {
  const id = platformOf(name)?.id
  if (!id) return { tag: '', tone: 'none', toneColor: '#8a8a8e' }
  if (platformCanQrLogin(id)) return { tag: '可扫码', tone: 'qr', toneColor: '#31c27c' }
  const ck = platformCookieOf(id)
  if (ck) return { tag: ck.file ? '仅粘贴文件' : '仅粘贴', tone: 'cookie', toneColor: '#e6a23c' }
  return { tag: '免凭据', tone: 'none', toneColor: '#8a8a8e' }
}

/**
 * 扫码通道的元信息 —— 认不出/不能扫码回 null
 *
 * @returns {{app:string, command:string}|null} command = 给用户抄的那条命令（用**最短平台名**）
 */
export function platformQrOf(name = '') {
  const p = platformOf(name)
  const qr = p?.auth?.qr
  if (!p || !qr) return null
  return { app: qr.app || '手机 App', command: `#qqm${platformShort(p.id)}登录` }
}

/**
 * 粘贴凭据通道的元信息 —— 认不出/这家不收 cookie 回 null
 *
 * 命令 / 上传路径 / 字段名 / 清除方式**都在这里算一次**（以前散在 login.js、card-data.js、
 * 锅巴 schema 三处，Apple 那个"字段叫 cookies、清除用 DELETE"的例外就漏过一次）。
 *
 * @returns {{command:string, clearCommand:string, where:string, keys:string, file:boolean,
 *            post:string, field:string, clear:{path:string, method:string}}|null}
 */
export function platformCookieOf(name = '') {
  const p = platformOf(name)
  const c = p?.auth?.cookie
  if (!p || !c) return null
  return {
    command: `#qqm${platformShort(p.id)}ck`,
    clearCommand: `#qqm${platformShort(p.id)}清ck`,
    where: c.where || '',
    keys: c.keys || '',
    // file = 粘贴的是一份**文件全文**（Apple），不是一行 cookie 串
    file: c.file === true,
    post: c.post || `/${p.id}/cookies`,
    field: c.field || 'cookie',
    clear: c.clear || { path: `/${p.id}/cookies/clear`, method: 'post' },
  }
}

/**
 * 粘贴 cookie 的说明（锅巴的 help 文案与命令的用法提示共用同一份文字）
 *
 * ⚠️ 结尾特意写明"私聊发"：凭据是**一人一份**存的（按发命令的 QQ 号），
 *    群里发等于把自己的账号凭据贴给全群看 —— 命令侧也会拒收（见 apps/login.js）。
 */
export function platformCookieHelp(name = '') {
  const c = platformCookieOf(name)
  if (!c) return ''
  return [
    `私聊发 ${c.command} ${c.file ? '<整份 cookies 文件全文>' : '<cookie>'}`,
    `从哪拿：${c.where || '（未登记）'}`,
    `关键字段：${c.keys || '（未登记）'}`,
  ].join('；')
}

/** 能扫码的平台（帮助卡文案 + 测试断言用） */
export function qrPlatforms() {
  return PLATFORMS.filter((p) => p.auth?.qr)
}

/** 能粘贴 cookie 的平台（帮助卡文案 + 测试断言用） */
export function cookiePlatforms() {
  return PLATFORMS.filter((p) => p.auth?.cookie)
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
  platformAuthOf,
  platformCanQrLogin,
  platformQrOf,
  platformCanCookie,
  platformCookieOf,
  platformNeedsCredential,
  platformAuthTag,
  platformCookieHelp,
  qrPlatforms,
  cookiePlatforms,
  platformAliasPattern,
}
