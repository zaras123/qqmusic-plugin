/**
 * qqmusic-api-enhanced 客户端
 */
import axios from 'axios'
import Config from '../components/Config.js'
import {
  QUALITY_LABEL,
  QUALITY_LADDER,
  summarizeFileSizes,
} from './quality.js'
import { logInfo, logWarn } from './log.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 归一化 apiBase：兼容用户手改配置文件时的常见写法问题，
 * 不再因格式问题抛裸的 Invalid URL：
 *  - 漏写 http:// / https:// 协议头（如 127.0.0.1:3300）→ 自动补 http://
 *  - 中文输入法的全角冒号（http：//）→ 转半角
 *  - 复制粘贴带入的首尾引号、空格、零宽字符 / BOM → 清除
 */
export function normalizeApiBase(raw) {
  let s = String(raw ?? '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // 零宽字符 / BOM
    .replace(/^["'`]+|["'`]+$/g, '')            // 首尾引号
    .replace(/：/g, ':')                         // 全角冒号 → 半角
    .trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '')
  // 已带其它协议（ws:// 等）原样保留；否则视为漏写协议头，自动补 http://
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`
  return s.replace(/\/+$/, '')
}

function getBase() {
  const cfg = Config.getConfig('qqmusic') || {}
  return normalizeApiBase(cfg.apiBase) || 'http://127.0.0.1:3300'
}

function getApiToken() {
  const cfg = Config.getConfig('qqmusic') || {}
  return String(cfg.apiToken || cfg.api_token || process.env.QQMUSIC_API_TOKEN || '').trim()
}

/**
 * 清洗 userKey 使其可作为 HTTP header 值。
 * Node.js 对 header 值要求严格：仅可打印 ASCII（0x20-0x7E），其它字符抛 ERR_INVALID_CHAR。
 * ICQQ 等场景下 e.user_id 可能带脏数据，故在此统一过滤；空则返回空串（调用方据此跳过 header）。
 */
function sanitizeForHeader(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, '')   // 去不可打印 / 非 ASCII
    .replace(/[\r\n\t]/g, '')        // 再去 CR/LF/Tab（防御）
    .trim()
}

/**
 * 主人账号（配置键 publicAccount）：群友自己没登录时，播歌回落到主人已登录的账号（通常是主人的 VIP 号）。
 * 留空 = 不启用（默认），行为与没这个功能时完全一致。
 * 回落只发生在「播歌 / 取数据」类接口 —— 登录状态、取 CK、刷新都仍只看请求者本人。
 */
function getPublicAccount() {
  const cfg = Config.getConfig('qqmusic') || {}
  return sanitizeForHeader(cfg.publicAccount || cfg.public_account || '')
}

/** 「一律走主人账号」开关：播歌/取数据不看请求者是谁，全按主人的 ck 走 */
function isForceMasterAccount() {
  const cfg = Config.getConfig('qqmusic') || {}
  return cfg.forceMasterAccount === true
}

/** 登录管理类接口：就算开了「一律走主人账号」也只看请求者本人，不能被主人账号顶掉 */
function isLoginScopePath(pathname) {
  const p = String(pathname || '')
  return p.startsWith('/login/') || p === '/user/refresh' || p === '/user/liked'
}

/**
 * 播歌类请求实际生效的 userKey：
 * 开了「一律走主人账号」且配了主人账号 → 返回主人账号（主人的 ck）；否则原样返回请求者。
 * /song/file 直链（buildSongFileUrl）不经过 request()，调用方用它保证取链和下载用同一个账号。
 */
export function pickPlayUserKey(userKey = '') {
  const publicAccount = getPublicAccount()
  if (publicAccount && isForceMasterAccount()) return publicAccount
  return userKey
}

let forceNoAccountWarned = false

function emptyUrlResult(type, mediaId, extra = {}) {
  return {
    url: '',
    quality: type,
    mediaId,
    tip: '',
    retcode: undefined,
    hasLogin: undefined,
    pay: undefined,
    refreshed: undefined,
    refreshReason: undefined,
    triedChannels: undefined,
    tried: undefined,
    achieved: '',
    raw: undefined,
    ...extra,
  }
}

export async function request(pathname, params = {}, method = 'get', userKey = '') {
  const base = getBase()
  const url = `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`

  const publicAccount = getPublicAccount()
  const forceMaster = isForceMasterAccount()
  if (forceMaster && !publicAccount && !forceNoAccountWarned) {
    forceNoAccountWarned = true
    logWarn('[qqmusic-plugin] 开了「一律走主人账号」但没填主人账号（publicAccount），开关不生效')
  }

  // 一律走主人账号：播歌/取数据全按主人的 ck，不看请求者自己登录没有
  // （群友在别的机器人上扫码登录过也不影响）；登录管理类接口仍按请求者本人
  const effectiveUserKey =
    publicAccount && forceMaster && !isLoginScopePath(pathname) ? publicAccount : userKey

  // 多账号：带 userKey（机器人侧调用者标识，通常是 QQ 号）
  // 仅作为 query/body 参数传递；header 版见下方 sanitizeForHeader
  if (effectiveUserKey) {
    params = { ...params, userKey: effectiveUserKey }
  }
  const token = getApiToken()
  const headers = {}
  const safeUserKey = sanitizeForHeader(effectiveUserKey)
  if (safeUserKey) headers['x-qqmusic-user'] = safeUserKey
  // 主人账号：带上就好，是否真的回落由 API 判断（请求者自己登录了就一直用他自己的）
  if (publicAccount) {
    params = { ...params, publicUserKey: publicAccount }
    headers['x-qqmusic-public-user'] = publicAccount
  }
  if (token) {
    headers['x-api-token'] = token
    headers.Authorization = `Bearer ${token}`
  }
  try {
    const res = await axios({
      url,
      method,
      params: method === 'get' ? params : undefined,
      data: method === 'post' ? params : undefined,
      timeout: 20000,
      headers: Object.keys(headers).length ? headers : undefined,
      validateStatus: () => true,
    })
    const data = res.data
    if (res.status === 401) {
      throw new Error(
        `API 鉴权失败（401）：请检查插件 apiToken 与 API 的 QQMUSIC_API_TOKEN 是否一致`
      )
    }
    if (res.status === 403) {
      throw new Error(`API 拒绝访问（403）：IP 可能不在白名单`)
    }
    if (res.status === 429) {
      throw new Error(`API 限流（429）：请求过于频繁`)
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    if (data?.result && data.result !== 100 && data.result !== 0) {
      const err = new Error(data.errMsg || `API result=${data.result}`)
      err.code = data.result
      err.payload = data
      err.pay = data.pay
      err.retcode = data.retcode
      err.tip = data.tip
      throw err
    }
    return data
  } catch (e) {
    if (e.code === 'ECONNREFUSED' || e?.cause?.code === 'ECONNREFUSED') {
      throw new Error(`无法连接 QQ 音乐 API（${base}），请先启动 qqmusic-api-enhanced`)
    }
    if (e.code === 'ERR_INVALID_URL' || e?.cause?.code === 'ERR_INVALID_URL' ||
        /invalid url/i.test(e.message || '')) {
      throw new Error(
        `API 地址无效，请检查配置里的 apiBase（需形如 http://IP:端口）`
      )
    }
    throw e
  }
}

/**
 * 仅取登录态元信息
 */
export async function pullLoginMeta(userKey = '') {
  const st = await request('/login/status', {}, 'get', userKey)
  const d = st?.data || {}
  return {
    login: Boolean(d.login),
    userKey: d.userKey || userKey || 'default',
    uin: String(d.uin || '').replace(/\D/g, ''),
    nick: d.nick || '',
    hasKey: Boolean(d.hasKey),
    hasRefresh: Boolean(d.hasRefresh),
    loginType: d.login_type,
    tmeLoginType: d.tmeLoginType,
    keyAgeSec: d.keyAgeSec ?? null,
    // key 有效期（秒）与「登录时实测能否续期」—— 见 loginRenewHint
    keyExpiresIn: Number(d.keyExpiresIn) || 0,
    refreshable: d.refreshable === true,
    refreshChecked: Boolean(d.refreshChecked),
    refreshReason: d.refreshReason || '',
  }
}

/**
 * 加密曲目的「服务端下载并解密」地址（主逻辑在 API，插件只负责搬运明文）。
 * 抓包显示客户端下载 URL 上只有 vkey、没有 ekey，故两个都带上让 API 逐个试。
 */
export function buildSongFileUrl({ url = '', filename = '', ekey = '', vkey = '', userKey = '' } = {}) {
  const base = getBase()
  const params = new URLSearchParams()
  params.set('url', String(url))
  if (filename) params.set('filename', String(filename))
  if (ekey) params.set('key', String(ekey))
  if (vkey) params.set('vkey', String(vkey))
  if (userKey) params.set('userKey', String(userKey))
  const token = getApiToken()
  if (token) params.set('token', token) // 下载器不方便加头，用 query token（API 支持）
  return `${base}/song/file?${params.toString()}`
}

/**
 * 登录续期状态的用户可见提示（导出以便单测）
 *
 * ⚠️ 不能只看「有没有 refresh 材料」：微信 PC 流程换到的会话**有 refresh_key 但续期实测被拒**
 * （所有形状都回 code=1000），而 App 扫码的会话能续期 —— 两者表面一样。
 * 所以以 API 登录时实测的结果 `refreshable` 为准；没实测过时才退回看材料。
 */
export function loginRenewHint(meta = {}) {
  if (!meta || !meta.login) return ''
  const days = Number(meta.keyExpiresIn) > 0 ? Math.round(Number(meta.keyExpiresIn) / 86400) : 0
  const ttl = days > 0 ? `key 有效期约 ${days} 天` : ''
  const withTtl = (s) => (ttl ? `${s}（${ttl}）` : s)
  if (meta.refreshChecked && meta.refreshable === false) {
    return `⚠️ 该登录方式不支持自动续期（登录时实测被服务端拒绝），${ttl ? `${ttl}，` : ''}到期需重新扫码`
  }
  if (meta.hasRefresh) return withTtl('含 refresh 材料，可自动续期')
  return withTtl('⚠️ 无 refresh，过期后需重新扫码')
}

export async function listAccounts() {
  const body = await request('/login/accounts')
  return body?.data?.accounts || []
}

export async function searchSongs(
  keyword,
  { pageNo = 1, pageSize = 10, userKey = '', fill = false, fillLimit = 5 } = {}
) {
  // fill：让 API 在 QQ 结果尾部追加其它平台的免费可播曲（拿不到链的不会返回）。
  // 默认关 —— 只有点歌列表需要它；直接播放/歌词/链接解析只取首条，带了只是白等一轮
  const params = { key: keyword, t: 0, pageNo, pageSize }
  if (fill) {
    params.fill = 1
    params.fillLimit = fillLimit
  }
  const body = await request('/search', params, 'get', userKey)
  return (body?.data?.list || []).map((item, idx) => normalizeSearchItem(item, idx)).filter(Boolean)
}

/**
 * 外部平台来源 → 展示名 + app 图标
 * 图标用 QQ互联 的官方应用图标（与卡片里封面图一样走远程加载）
 */
export const SOURCE_META = {
  netease: {
    label: '网易云',
    icon: 'https://i.gtimg.cn/open/app_icon/00/49/50/85/100495085_100_m.png',
    color: '#c62f2f',
  },
  kuwo: {
    label: '酷我',
    icon: 'https://p.qpic.cn/qqconnect/0/app_100243533_1636374695/100',
    color: '#ffb500',
  },
  kugou: {
    label: '酷狗',
    icon: 'https://open.gtimg.cn/open/app_icon/00/20/51/41/205141_100_m.png',
    color: '#0ea0e8',
  },
  bilibili: {
    label: 'B站',
    icon: 'https://i.gtimg.cn/open/app_icon/00/95/17/76/100951776_100_m.png',
    color: '#fb7299',
  },
  qq: {
    label: 'QQ音乐',
    icon: 'https://p.qpic.cn/qqconnect/0/app_100497308_1626060999/100',
    color: '#31c27c',
  },
}

export const SOURCE_LABEL = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.label])
)

/** 取来源图标 URL（未知来源返回空串） */
export function sourceIconOf(source) {
  return SOURCE_META[source]?.icon || ''
}

/** 统一歌曲对象归一化：兼容 /data 包裹、/track_info 包裹、扁平结构 */
export function normalizeSearchItem(item, idx = 0) {
  // 兼容多种 API 返回结构：/data 包裹、/track_info 包裹、扁平结构
  const raw = item?.data || item?.track_info || item
  if (!raw) return null

  const singer = Array.isArray(raw.singer)
    ? raw.singer.map((s) => s.name || s.title).filter(Boolean).join(' / ')
    : raw.singername || raw.singerName || raw.singer || ''
  const albummid = raw.albummid || raw.album?.mid || raw.albumMID || ''
  // 封面：专辑图 → 外部平台自带图 → 专辑 pic → 歌手图（翻唱/UGC 条目常没有专辑 mid）
  const singerMid = Array.isArray(raw.singer)
    ? raw.singer[0]?.mid || ''
    : raw.singermid || raw.singerMid || ''
  const cover = albummid
    ? coverUrl(albummid)
    : raw.cover || raw.album?.pic || raw.album?.cover || singerCoverUrl(singerMid)
  // 时长：QQ 给秒（interval），外部 provider 统一给毫秒（duration）
  const interval = Number(
    raw.interval || raw.songTime || (raw.duration ? Math.round(Number(raw.duration) / 1000) : 0)
  )
  const duration =
    interval > 0
      ? `${String(Math.floor(interval / 60)).padStart(2, '0')}:${String(interval % 60).padStart(2, '0')}`
      : ''

  return {
    index: idx + 1,
    songmid: raw.songmid || raw.mid || '',
    songid: raw.songid || raw.id || 0,
    // 外部平台补充曲：带 source 前缀的 songmid 交给 API 自动路由，播放链路无需特殊处理
    source: raw.source || '',
    // 档位由 API 按平台给出（B站 192k 比网易云/酷我 128k 好），缺失时按 128k 兜底
    quality: raw.quality || '',
    external: Boolean(raw.external),
    media_mid: raw.media_mid || raw.strMediaMid || raw.songmid || '',
    songName:
      raw.songname ||
      raw.songName ||
      raw.songname_hilight?.replace(/<[^>]+>/g, '') ||
      raw.name ||
      raw.title ||
      '',
    singerName: singer,
    albumName: raw.albumname || raw.albumName || raw.album?.name || '',
    albummid,
    cover,
    duration,
    interval,
    payplay: raw.pay?.payplay ?? raw.pay?.pay_play ?? raw.payplay,
    msgid: raw.msgid,
    raw: item,
  }
}

export async function songDetail(songmid, userKey = '') {
  const body = await request('/song', { songmid }, 'get', userKey)
  return body?.data
}

function mapSongUrlBody(body, type, realMedia) {
  let url = ''
  if (typeof body?.data === 'string') url = body.data
  else if (body?.data?.url) url = body.data.url

  if (url) {
    const d = body?.data || {}
    return {
      url,
      file: body.file || d.file,
      domain: body.domain || d.domain,
      purl: body.purl || d.purl,
      // API 的 QQ 阶梯把 quality 放在响应顶层；外部平台补充曲放在 data 里 —— 两处都认
      quality: d.quality || body.quality || type,
      tried: d.tried || body.tried || undefined, // API 侧音质阶梯的逐档记录
      // 外部平台补充曲带回来的标记：来源与档位要能显示出来（别谎报 FLAC）
      qualityLabel: d.qualityLabel || '',
      source: d.source || '',
      external: Boolean(d.external),
      mediaId: body.mediaId || d.mediaId || realMedia,
      pay: body.pay || d.pay,
      refreshed: body.refreshed,
      playChannel: body.playChannel || d.playChannel,
      // 加密文件（.mflac/.mgg）：API 会一并下发 ekey / purl 里的 vkey。
      // 解密（含密钥候选与魔数校验）在 **API 侧**完成（util/drm.js），
      // 插件只把这两个值回传给 /song/file 让它去下载+解密
      ekey: body.ekey || d.ekey || '',
      vkey: body.vkey || d.vkey || '',
      encrypted: Boolean(body.encrypted || d.encrypted),
    }
  }
  return emptyUrlResult(type, body?.mediaId || realMedia, {
    raw: body,
    tip: body?.tip || body?.errMsg || '',
    retcode: body?.retcode,
    hasLogin: body?.hasLogin,
    pay: body?.pay,
    refreshed: body?.refreshed,
    refreshReason: body?.refreshReason,
    triedChannels: body?.triedChannels,
  })
}

/** 单次指定音质 */
export async function songUrl(
  songmid,
  { type = '128', quality = '', fallback = 0, mediaId, channel = 'auto', userKey = '' } = {}
) {
  const realMedia = mediaId || songmid
  // quality + fallback 交给 API 侧的音质阶梯（一次请求内部逐级下探）
  const params = { id: songmid, mediaId: realMedia, channel }
  if (quality) params.quality = quality
  else params.type = type
  if (Number(fallback) === 1) params.fallback = 1
  try {
    const body = await request('/song/url', params, 'post', userKey)
    return mapSongUrlBody(body, quality || type, realMedia)
  } catch (e) {
    const p = e.payload || {}
    return emptyUrlResult(quality || type, p.mediaId || realMedia, {
      raw: p,
      tip: p.errMsg || p.tip || e.message || '',
      retcode: p.retcode ?? e.retcode,
      hasLogin: p.hasLogin,
      pay: p.pay || e.pay,
      refreshed: p.refreshed,
      refreshReason: p.refreshReason,
      triedChannels: p.triedChannels,
      tried: Array.isArray(p.tried) ? p.tried : undefined, // 阶梯逐档记录
      achieved: p.achieved || '',
      error: e.message,
    })
  }
}

export async function refreshLogin(userKey = '') {
  try {
    return await request('/login/refresh', {}, 'post', userKey)
  } catch {
    return request('/user/refresh', {}, 'get', userKey)
  }
}

async function probeUrlAlive(url, timeout = 6000) {
  if (!url) return false
  const headers = { 'User-Agent': UA, Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' }
  let headOk = false
  try {
    const head = await axios.head(url, {
      timeout,
      maxRedirects: 3,
      headers,
      validateStatus: () => true,
    })
    if (head.status > 0 && head.status < 400) headOk = true
    // 注意：HEAD 失败不能直接判死 —— 有些 CDN（如 B站 bilivideo）根本不支持 HEAD，
    // 一律回 404，但 Range GET 是好的。所以这里继续往下试 GET。
  } catch {
    /* HEAD 不支持/被拒 → 试 GET */
  }
  if (headOk) return true
  try {
    const g = await axios.get(url, {
      timeout,
      maxRedirects: 3,
      responseType: 'arraybuffer',
      headers: { ...headers, Range: 'bytes=0-1023' },
      validateStatus: () => true,
    })
    if (g.status >= 400) return false
    const buf = Buffer.from(g.data || [])
    if (buf.length < 16) return false
    const head = buf.slice(0, 32).toString('utf8').toLowerCase()
    if (head.includes('<html') || head.includes('<!doctype')) return false
    return true
  } catch {
    return false
  }
}

/** 生成降级说明：显式请求的高音质没拿到时，向用户解释原因（多为需绿钻会员） */
function buildDegradeNote(preferred, achieved, tried) {
  const req = String(preferred || '')
  if (!req || req === 'auto' || !achieved || req === achieved) return ''
  const hi = QUALITY_LADDER.indexOf(req)
  const lo = QUALITY_LADDER.indexOf(achieved)
  if (hi < 0 || lo < 0 || lo <= hi) return '' // 未降级（auto / 相同 / 更高）不提示
  const entry = tried.find((t) => t.startsWith(`${req}:`)) || ''
  let reason = '获取失败（该音质通常需绿钻会员）'
  if (entry.endsWith(':skip-size')) reason = '该歌曲未提供此音质'
  else if (entry.endsWith(':cdn-dead')) reason = '播放链接不可用'
  else if (entry.endsWith(':no-url')) reason = 'API 未返回链接（通常需绿钻会员）'
  return `已请求${QUALITY_LABEL[req] || req}，实际${QUALITY_LABEL[achieved] || achieved}（${reason}）`
}

/**
 * 最高音质 + 自适配降级
 */
/** 音质阶梯里比 q 低一档（用于客户端探活失败后继续下探）；没有更低档返回 '' */
function nextQualityBelow(q) {
  const i = QUALITY_LADDER.indexOf(String(q))
  if (i < 0 || i + 1 >= QUALITY_LADDER.length) return ''
  return QUALITY_LADDER[i + 1]
}

/**
 * 组装「拿不到播放链」的用户可见文案（导出以便单测）
 *
 * DRM 曲目要省略「该曲需会员播放，请 #qqm登录」那句：API 已说明该曲**只提供加密文件**，
 * 登录/会员都解决不了 —— 再追加会员提示是自相矛盾，会把用户往错方向带（实测踩过）。
 */
export function buildPlayFailMessage(payload = {}, pay = null, tried = [], detailFallback = '') {
  const hint = tried.length ? ` 已尝试: ${tried.join(', ')}` : ''
  const text = String(payload.errMsg || payload.tip || '')
  const isDrm = Boolean(payload.drm) || /加密文件|加密\(DRM\)|DRM/i.test(text)
  const payHint = pay && Number(pay.pay_play) === 1 && !isDrm ? ' 该曲需会员播放，请 #qqm登录' : ''
  const detail = text || detailFallback || ''
  return detail
    ? `${detail}${payHint}${hint}`
    : `所有音质均无可用链接（可 #qqm登录 重新扫码）${payHint}${hint}`
}

export async function songUrlBest(
  songmid,
  { quality = 'flac', mediaId, fallback = true, probe = true, userKey = '' } = {}
) {
  const preferred = String(quality || 'flac').toLowerCase()
  let realMedia = mediaId || songmid
  let mvVid = ''

  // 补充曲（ne_/kw_/bi_ 前缀）走外部平台：没有音质阶梯
  const isExternalMid = /^(ne|kw|bi)_/.test(String(songmid))
  if (!isExternalMid) {
    try {
      const detail = await songDetail(songmid, userKey)
      const file = detail?.track_info?.file || detail?.file || {}
      realMedia = mediaId || file.media_mid || file.master_tape_media_mid || songmid
      mvVid = detail?.track_info?.mv?.vid || ''
      const sz = summarizeFileSizes(file)
      logInfo(
        `音质自适配: 上限=${preferred}（逐档下探交由 API）sizes(flac=${sz.flac},hires=${sz.hires},dolby=${sz.dolby},new0=${sz.new0},new2=${sz.new2},new10=${sz.new10})`
      )
    } catch {
      logInfo(`音质自适配: 上限=${preferred}（无详情 size，交由 API 阶梯判断）`)
    }
  }

  const tried = []
  let askFrom = preferred
  let lastResult = null
  let lastErr = null

  // 音质阶梯已挪到 API：一次请求内部就从请求档位逐级下探到可用档。
  // 插件只按「客户端探活」结果继续下探 —— 下载发生在机器人主机，
  // 那条链能不能下只有这里知道（API 那边看不到机器人的网络）。
  // 最多 5 轮：与阶梯长度对齐，避免探活连续失败时够不到 m4a/128 这两档
  for (let round = 0; round < 5; round++) {
    let r = null
    try {
      r = await songUrl(songmid, {
        quality: askFrom,
        fallback: fallback !== false ? 1 : 0,
        mediaId: realMedia,
        userKey,
      })
    } catch (e) {
      lastErr = e
      if (e?.payload?.pay) lastErr.pay = e.payload.pay
      if (Array.isArray(e?.payload?.tried)) tried.push(...e.payload.tried)
      break
    }

    lastResult = r
    if (Array.isArray(r?.tried) && r.tried.length) tried.push(...r.tried)

    if (!r?.url) {
      const pl = r?.raw || r || {}
      lastErr = new Error(pl.errMsg || pl.tip || '获取播放链接失败')
      lastErr.payload = pl
      if (pl.pay) lastErr.pay = pl.pay
      break
    }

    const isExt = Boolean(r.external)
    if (probe !== false) {
      const ok = await probeUrlAlive(r.url)
      if (!ok) {
        tried.push(`${r.quality}:cdn-dead`)
        logWarn(`${r.quality} 链接不可用${isExt ? '' : '，继续下探…'}`)
        // 外部平台补充曲没有音质阶梯：探活失败即失败，不再下探
        const next = isExt ? '' : nextQualityBelow(r.quality)
        if (!next || fallback === false) {
          lastErr = new Error(`${r.quality} CDN 不可用`)
          lastErr.payload = r.raw || r
          break
        }
        askFrom = next
        continue
      }
    }

    tried.push(`${r.quality}:ok`)
    logInfo(
      `音质选定: ${isExt ? r.qualityLabel || r.source : r.quality} ch=${r.playChannel || 'auto'} [${tried.join(', ')}]`
    )
    return {
      ...r,
      quality: r.quality,
      qualityLabel: isExt
        ? r.qualityLabel || r.quality || '128k'
        : r.qualityLabel || QUALITY_LABEL[r.quality] || r.quality,
      mediaId: r.mediaId || realMedia,
      adaptedFrom: preferred,
      tried,
      mvVid: r.mvVid || mvVid,
      degradeNote: isExt ? '' : buildDegradeNote(preferred, r.quality, tried),
    }
  }

  const payload = lastErr?.payload || lastResult?.raw || lastResult || {}
  const pay = payload.pay || lastErr?.pay
  const hint = tried.length ? ` 已尝试: ${tried.join(', ')}` : ''
  const msg = buildPlayFailMessage(payload, pay, tried, lastErr?.message || '')
  const err = lastErr || new Error(msg)
  if (!err.message || err.message === 'Error') err.message = msg
  else if (hint && !String(err.message).includes('已尝试')) err.message = `${err.message}${hint}`
  if (pay) err.pay = pay
  err.payload = payload
  err.tried = tried
  throw err
}

export async function lyric(songmid, userKey = '') {
  const body = await request('/lyric', { songmid }, 'get', userKey)
  return body?.data || body
}

export async function hotKeys(userKey = '') {
  const body = await request('/search/hot', {}, 'get', userKey)
  return body?.data || []
}

export function parseQQMusicIds(text = '') {
  const s = String(text)
  const out = { songmid: '', songid: '', albummid: '', media_mid: '' }

  // songmid / song_mid / songMid / mid 参数变体，或 /songDetail|/song|/playsong.html 路径
  const mid =
    s.match(/[?&](?:songmid|song_mid|songMid|mid)=([A-Za-z0-9]{5,})/i) ||
    s.match(/\/(?:songDetail|song|playsong\.html)\/?[?#]*([A-Za-z0-9]{10,})/i) ||
    s.match(/\/song\/([A-Za-z0-9]{14})/i)
  if (mid) out.songmid = mid[1]

  const id = s.match(/[?&]songid=(\d+)/i) || s.match(/[?&]id=(\d{5,})/i)
  if (id) out.songid = id[1]

  const album = s.match(/[?&]albummid=([A-Za-z0-9]+)/i)
  if (album) out.albummid = album[1]

  // media_mid / mediaMid / mediaid 参数变体
  const media = s.match(/[?&](?:media_mid|mediaMid|mediaid)=([A-Za-z0-9]+)/i)
  if (media) out.media_mid = media[1]

  return out
}

function tryParseJsonLoose(text) {
  if (!text || typeof text !== 'string') return null
  const t = text.trim()
  if (!t.startsWith('{')) return null
  try {
    return JSON.parse(t)
  } catch {
    try {
      return JSON.parse(t.replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
    } catch {
      return null
    }
  }
}

export function parseQQMusicCard(msg) {
  const text = typeof msg === 'string' ? msg : ''
  const json = tryParseJsonLoose(text)
  if (!json || typeof json !== 'object') return null

  const app = String(json.app || '')
  const blob = () => JSON.stringify(json)
  const looksQQMusic =
    app.includes('structmsg') ||
    app.includes('music.lua') ||
    app.includes('tencent.qqmusic') ||
    json.meta?.music != null ||
    json.meta?.news != null ||
    blob().includes('100497308') ||
    blob().includes('y.qq.com')
  if (!looksQQMusic) return null

  const news = json.meta?.news || {}
  const music = json.meta?.music || {}
  const title = news.title || music.title || json.prompt || ''
  const desc = news.desc || music.desc || music.tag || ''
  const jumpUrl = news.jumpUrl || music.jumpUrl || music.musicUrl || ''
  const preview = news.preview || music.preview || music.picture || ''
  const ids = parseQQMusicIds(jumpUrl || blob())

  return {
    title: String(title).replace(/…/g, '').trim(),
    desc: String(desc).trim(),
    jumpUrl,
    cover: preview,
    keyword: [title, desc]
      .filter(Boolean)
      .join(' ')
      .replace(/[《》【】\[\]]/g, ' ')
      .trim(),
    ...ids,
    raw: json,
  }
}

export function coverUrl(albummid, size = 300) {
  if (!albummid) return ''
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albummid}.jpg`
}

/** 歌手头像：无专辑图时的兜底（翻唱/上传/UGC 条目常没有专辑 mid，但有歌手 mid） */
export function singerCoverUrl(singermid, size = 300) {
  if (!singermid) return ''
  return `https://y.gtimg.cn/music/photo_new/T001R${size}x${size}M000${singermid}.jpg`
}

// ──────────── 排行榜 ────────────

export async function topCategory(userKey = '') {
  const body = await request('/top/category', {}, 'get', userKey)
  return body?.data || []
}

export async function topDetail(id, { pageNo = 1, pageSize = 100, period, userKey = '' } = {}) {
  const body = await request('/top', { id, pageNo, pageSize, ...(period ? { period } : {}) }, 'get', userKey)
  return body?.data || body
}

// ──────────── 推荐 ────────────

export async function recommendHot(userKey = '') {
  const body = await request('/recommend/playlist/u', {}, 'get', userKey)
  return body?.data?.list || []
}

// ──────────── 搜索扩展 ────────────

export async function searchSingers(keyword, { pageNo = 1, pageSize = 20, userKey = '' } = {}) {
  const body = await request('/search', { key: keyword, t: 9, pageNo, pageSize }, 'get', userKey)
  return (body?.data?.list || []).map((item, idx) => ({
    index: idx + 1,
    singermid: item.singerMID || item.singermid || item.mid || '',
    singerName: item.singerName || item.name || item.singer || '',
    songNum: item.songNum || item.songnum || 0,
    albumNum: item.albumNum || item.albumnum || 0,
    cover: item.singerMID ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${item.singerMID || item.singermid || item.mid}.jpg` : '',
    raw: item,
  }))
}

export async function searchAlbums(keyword, { pageNo = 1, pageSize = 20, userKey = '' } = {}) {
  const body = await request('/search', { key: keyword, t: 8, pageNo, pageSize }, 'get', userKey)
  return (body?.data?.list || []).map((item, idx) => ({
    index: idx + 1,
    albummid: item.albumMID || item.albummid || item.mid || '',
    albumName: item.albumName || item.name || '',
    singerName: item.singerName || item.singer || '',
    songCount: item.song_count || item.songCount || 0,
    publicTime: item.publicTime || item.publish_date || '',
    cover: item.albumMID || item.albummid ? coverUrl(item.albumMID || item.albummid) : '',
    raw: item,
  }))
}

export async function searchSonglists(keyword, { pageNo = 1, pageSize = 20, userKey = '' } = {}) {
  const body = await request('/search', { key: keyword, t: 2, pageNo, pageSize }, 'get', userKey)
  return (body?.data?.list || []).map((item, idx) => ({
    index: idx + 1,
    disstid: item.dissid || item.disstid || item.id || '',
    dissname: item.dissname || item.title || item.name || '',
    creator: item.creator?.nick || item.creator?.nickname || item.nickname || '',
    songCount: item.song_count || item.songCount || item.songnum || 0,
    listenNum: item.listennum || item.listen_count || 0,
    cover: item.imgurl || item.logo || '',
    raw: item,
  }))
}

// ──────────── 歌手 ────────────

export async function singerSongs(singermid, { pageNo = 1, pageSize = 50, order = 1, userKey = '' } = {}) {
  const body = await request('/singer/songs', { singermid, pageNo, pageSize, order }, 'get', userKey)
  const d = body?.data || {}
  const list = d.list || []
  return {
    list: list.map((item, idx) => {
      // 歌手歌曲接口返回的是 { songInfo: {...} } 结构
      const raw = item?.songInfo || item
      return normalizeSearchItem(raw, idx)
    }).filter(Boolean),
    total: d.total || 0,
    pageNo: d.pageNo || pageNo,
    singermid,
  }
}

export async function singerDesc(singermid, userKey = '') {
  const body = await request('/singer/desc', { singermid }, 'get', userKey)
  return body?.data || body
}

// ──────────── 专辑 ────────────

export async function albumSongs(albummid, { begin = 0, num = 999, userKey = '' } = {}) {
  const body = await request('/album/songs', { albummid, begin, num }, 'get', userKey)
  const d = body?.data || {}
  const list = Array.isArray(d.list) ? d.list : (Array.isArray(d.songs) ? d.songs : [])
  return {
    list: list.map((item, idx) => normalizeSearchItem(item, idx)).filter(Boolean),
    total: d.total || 0,
    albummid,
  }
}

// ──────────── 歌单 ────────────

export async function songlistDetail(disstid, userKey = '') {
  const body = await request('/songlist', { id: disstid }, 'get', userKey)
  const d = body?.data || body || {}
  const raw = d.songlist || d.songs || d.list || []
  const songs = (Array.isArray(raw) ? raw : [])
    .map((item, idx) => normalizeSearchItem(item, idx))
    .filter(Boolean)
    .filter((s) => s.songmid)
  return {
    dissname: d.dissname || d.title || d.name || '',
    songCount: d.song_count || d.songCount || songs.length,
    listenNum: d.listennum || d.listenNum || 0,
    disstid,
    creator: d.creator?.nick || d.creator?.nickname || d.nickname || '',
    songlist: songs,
    raw: d,
  }
}

// ──────────── 评论 ────────────

export async function comment(id, { pageNo = 1, pageSize = 20, biztype = 1, userKey = '' } = {}) {
  const body = await request('/comment', { id, pageNo, pageSize, biztype }, 'get', userKey)
  return body?.data || body
}

// ──────────── 链接 ID 提取（扩展专辑/歌单/歌手） ────────────

export function parseQQMusicExtendedIds(text = '') {
  const s = String(text)
  const out = { ...parseQQMusicIds(s) }

  // 专辑：PC 端标准分享链接是 /n/ryqq/albumDetail/<mid>（与 songDetail/playlist/singer 同族路由），
  // 漏掉 albumDetail 会导致最常见的那种专辑链接解析为空、整个专辑解析功能静默失效
  const albumMid =
    s.match(/\/(?:albumDetail|album)\/([A-Za-z0-9]+)/i) ||
    s.match(/[?&]albummid=([A-Za-z0-9]+)/i)
  if (albumMid) out.albummid = out.albummid || albumMid[1]

  // 歌单
  const dissid =
    s.match(/\/playlist\/(\d+)/i) ||
    s.match(/disstid[=:](\d+)/i)
  if (dissid) out.disstid = dissid[1]

  // 歌手
  const singerMid =
    s.match(/\/singer\/([A-Za-z0-9]+)/i) ||
    s.match(/[?&]singermid=([A-Za-z0-9]+)/i)
  if (singerMid) out.singermid = singerMid[1]

  return out
}

// ──────────── 推荐歌曲（随机一首） ────────────

export async function recommendFeed(userKey = '') {
  try {
    const body = await request('/cgi', {
      module: 'recommend.RecommendFeedServer',
      method: 'get_recommend_feed',
      param: JSON.stringify({ direction: 1, page: 1, v_cache: [], v_uniq: [], s_num: 0 }),
    }, 'get', userKey)
    const v_shelf = body?.data?.data?.v_shelf || body?.data?.v_shelf || []
    const playlists = []
    for (const shelf of v_shelf) {
      if (shelf.style === 1 || true) {
        for (const niche of shelf.v_niche || []) {
          for (const card of niche.v_card || []) {
            if (card.id && card.type === 500) {
              playlists.push({
                disstid: card.id,
                dissname: card.title || '',
                cover: card.cover || '',
                listenNum: card.cnt || 0,
              })
            }
          }
        }
      }
    }
    if (!playlists.length) return []
    // 随机选一个歌单，获取其歌曲
    const pl = playlists[Math.floor(Math.random() * playlists.length)]
    try {
      const detail = await songlistDetail(pl.disstid, userKey)
      return detail.songlist || []
    } catch {
      return []
    }
  } catch (e) {
    logWarn(`recommendFeed failed: ${e.message}`)
    return []
  }
}

// ──────────── 个性电台 ────────────

export async function personalRadio(count = 5, userKey = '') {
  const body = await request('/cgi', {
    module: 'pc_track_radio_svr',
    method: 'get_radio_track',
    param: JSON.stringify({ id: 99, num: count }),
  }, 'get', userKey)
  const tracks = body?.data?.data?.tracks || body?.data?.tracks || []
  return tracks.map((item, idx) => normalizeRadioTrack(item, idx))
}

function normalizeRadioTrack(item, idx = 0) {
  if (!item) return null
  // 电台返回的是扁平结构，直接用 item 而非 item.data
  const singer = Array.isArray(item.singer)
    ? item.singer.map((s) => s.name || s.title).filter(Boolean).join(' / ')
    : item.singername || item.singerName || item.singer || ''
  const albummid = item.albummid || item.album?.mid || ''
  const interval = Number(item.interval || 0)
  const duration = interval > 0
    ? `${String(Math.floor(interval / 60)).padStart(2, '0')}:${String(interval % 60).padStart(2, '0')}`
    : ''
  return {
    index: idx + 1,
    songmid: item.mid || item.songmid || '',
    songid: item.id || item.songid || 0,
    media_mid: item.file?.media_mid || item.media_mid || item.mid || '',
    songName: item.name || item.title || item.songname || '',
    singerName: singer,
    albumName: item.album?.name || item.albumname || item.title || '',
    albummid,
    cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : (item.album?.cover || ''),
    duration,
    interval,
    payplay: item.pay?.pay_play ?? item.payplay,
    raw: item,
  }
}

// ──────────── 每日推荐 / 收藏（走 API 专用端点，替代 /cgi 裸透传） ────────────

/** 通用：把 API 返回的 { list, title, desc } 转成插件侧 { songs, title, desc } */
function dissPayload(body) {
  const d = body?.data || {}
  const list = Array.isArray(d.list) ? d.list : []
  return {
    songs: list.map((item, idx) => normalizeSearchItem(item, idx)).filter(Boolean),
    title: d.title || '',
    desc: d.desc || '',
  }
}

export async function dailyRecommend({ songBegin = 0, songNum = 30, userKey = '' } = {}) {
  const body = await request('/recommend/daily', { songBegin, num: songNum }, 'get', userKey)
  return dissPayload(body)
}

export async function userFavorites({ songBegin = 0, songNum = 30, userKey = '' } = {}) {
  const body = await request('/user/liked', { songBegin, num: songNum }, 'get', userKey)
  return dissPayload(body)
}

// ──────────── MV 浏览 / 搜索（API 新增端点） ────────────

/** 规范化 MV 对象：兼容 /mv/tag（vid/mvtitle/singer_name/picurl）与 /search t=12（v_id/mv_name/mv_pic_url/play_count）两组字段 */
function normalizeMvItem(item, idx = 0) {
  if (!item || typeof item !== 'object') return null
  const vid = item.vid || item.v_id || ''
  const title =
    item.mv_name || item.mvname || item.name || item.mvtitle || item.title || item.songname || ''
  if (!vid && !title) return null
  const singer = Array.isArray(item.singer)
    ? item.singer.map((s) => s.name || s.title).filter(Boolean).join(' / ')
    : item.singer_name || item.singername || item.singer || ''
  return {
    index: idx + 1,
    vid,
    mvtitle: title,
    name: title,
    singerName: singer,
    cover: item.mv_pic_url || item.pic || item.picurl || item.cover || '',
    pubdate: item.publish_date || item.pubdate || item.pub_date || item.publictime || '',
    listennum: Number(item.play_count || item.listennum || item.listenNum || item.playcnt || item.cnt || 0),
    duration: Number(item.duration || item.durationSec || item.mv_duration || 0), // 秒
    raw: item,
  }
}

export async function mvCategory(userKey = '') {
  const body = await request('/mv/category', {}, 'get', userKey)
  const d = body?.data || {}
  return { area: d.area || [], version: d.version || [], list: d.list || [] }
}

export async function mvByTag(tagId, { pageNo = 1, pageSize = 20, userKey = '' } = {}) {
  const body = await request('/mv/tag', { tagId, pageNo, pageSize }, 'get', userKey)
  const raw = body?.data?.list || body?.data?.mvlist || []
  return { list: raw.map(normalizeMvItem).filter(Boolean), total: body?.data?.total || 0 }
}

/** 搜索 MV（/search t=12） */
export async function searchMv(keyword, { pageNo = 1, pageSize = 10, userKey = '' } = {}) {
  const body = await request('/search', { key: keyword, t: 12, pageNo, pageSize }, 'get', userKey)
  return (body?.data?.list || []).map(normalizeMvItem).filter(Boolean)
}

/** 取 MV 视频流 URL（/mv/url 返回 mp4 变体数组），失败返回空串 */
export async function mvUrl(vid, userKey = '') {
  if (!vid) return ''
  const body = await request('/mv/url', { id: vid }, 'get', userKey)
  const d = body?.data
  const mp4s = Array.isArray(d?.mp4) ? d.mp4 : []
  // 仅取 code=0（可用）条目；倒序优先取体积小的（filetype 大 = 码率低），提高机器人发送成功率
  const usable = mp4s.filter((m) => m && typeof m === 'object' && Number(m.code) === 0)
  let src = ''
  for (const m of usable.reverse()) {
    src =
      (Array.isArray(m.freeflow_url) && m.freeflow_url.find((u) => typeof u === 'string' && u.trim())) ||
      (Array.isArray(m.comm_url) && m.comm_url.find((u) => typeof u === 'string' && u.trim())) || ''
    if (src) break
    const base = (Array.isArray(m.url) && m.url.find((u) => typeof u === 'string' && u.trim())) || ''
    if (base && m.urlPath) {
      src = `${base.replace(/\/+$/, '')}${String(m.urlPath).startsWith('/') ? m.urlPath : `/${m.urlPath}`}`
      break
    }
    if (base && base.length > 10) { src = base; break }
  }
  const url = String(src || '').trim()
  return url ? url.replace(/^http:\/\//, 'https://') : ''
}

// ──────────── 新歌速递 ────────────

export async function newSongs(type = 5, { num = 20, userKey = '' } = {}) {
  const body = await request('/song/new', { type, num }, 'get', userKey)
  const list = body?.data?.list || []
  return list.map((item, idx) => normalizeSearchItem(item, idx)).filter(Boolean)
}

// ──────────── 批量详情 ────────────

export async function songInfoBatch(ids = [], { userKey = '' } = {}) {
  if (!ids.length) return []
  const body = await request('/song/info', { ids: ids.join(',') }, 'get', userKey)
  return (body?.data?.list || [])
    .map((item, idx) => {
      const n = normalizeSearchItem(item, idx) || {}
      n.mvVid = item?.mv?.vid || '' // track_info.mv.vid，供列表卡打 🎬 徽标
      return n
    })
    .filter(Boolean)
}

export default {
  searchSongs,
  songDetail,
  songUrl,
  songUrlBest,
  lyric,
  hotKeys,
  parseQQMusicIds,
  parseQQMusicCard,
  coverUrl,
  request,
  pullLoginMeta,
  refreshLogin,
  topCategory,
  topDetail,
  recommendHot,
  searchSingers,
  searchAlbums,
  searchSonglists,
  singerSongs,
  singerDesc,
  albumSongs,
  songlistDetail,
  comment,
  parseQQMusicExtendedIds,
  recommendFeed,
  personalRadio,
  dailyRecommend,
  userFavorites,
  // 新增端点 wrapper
  mvCategory,
  mvByTag,
  mvUrl,
  searchMv,
  newSongs,
  songInfoBatch,
}
