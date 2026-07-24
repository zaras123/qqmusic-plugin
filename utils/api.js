/**
 * qqmusic-api-enhanced 客户端
 */
import axios from 'axios'
import Config from '../components/Config.js'
import {
  qualityCandidates,
  QUALITY_LABEL,
  isQualitySizeOk,
  pickBestAvailableQuality,
  summarizeFileSizes,
} from './quality.js'
import { logInfo, logWarn } from './log.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function getBase() {
  const cfg = Config.getConfig('qqmusic') || {}
  return String(cfg.apiBase || 'http://127.0.0.1:3300').replace(/\/$/, '')
}

function getApiToken() {
  const cfg = Config.getConfig('qqmusic') || {}
  return String(cfg.apiToken || cfg.api_token || process.env.QQMUSIC_API_TOKEN || '').trim()
}

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
    raw: undefined,
    ...extra,
  }
}

export async function request(pathname, params = {}, method = 'get', userKey = '') {
  const base = getBase()
  const url = `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
  // 多账号：带 userKey（机器人侧调用者标识，通常是 QQ 号）
  if (userKey) {
    params = { ...params, userKey }
  }
  const token = getApiToken()
  const headers = {}
  if (userKey) headers['x-qqmusic-user'] = userKey
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
  }
}

export async function listAccounts() {
  const body = await request('/login/accounts')
  return body?.data?.accounts || []
}

export async function searchSongs(keyword, { pageNo = 1, pageSize = 10 } = {}) {
  const body = await request('/search', { key: keyword, t: 0, pageNo, pageSize })
  return (body?.data?.list || []).map((item, idx) => normalizeSearchItem(item, idx))
}

function normalizeSearchItem(item, idx = 0) {
  const singer = Array.isArray(item.singer)
    ? item.singer.map((s) => s.name || s.title).filter(Boolean).join(' / ')
    : item.singername || item.singerName || ''
  const albummid = item.albummid || item.album?.mid || ''
  const cover = albummid
    ? coverUrl(albummid)
    : item.album?.pic || ''
  const interval = Number(item.interval || item.songTime || 0)
  const duration =
    interval > 0
      ? `${String(Math.floor(interval / 60)).padStart(2, '0')}:${String(interval % 60).padStart(2, '0')}`
      : ''

  return {
    index: idx + 1,
    songmid: item.songmid || item.mid || '',
    songid: item.songid || item.id || 0,
    media_mid: item.media_mid || item.strMediaMid || item.songmid || '',
    songName:
      item.songname || item.songname_hilight?.replace(/<[^>]+>/g, '') || item.name || '',
    singerName: singer,
    albumName: item.albumname || item.album?.name || '',
    albummid,
    cover,
    duration,
    interval,
    payplay: item.pay?.payplay ?? item.payplay,
    msgid: item.msgid,
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
    return {
      url,
      file: body.file || body?.data?.file,
      domain: body.domain || body?.data?.domain,
      purl: body.purl || body?.data?.purl,
      quality: type,
      mediaId: body.mediaId || realMedia,
      pay: body.pay || body?.data?.pay,
      refreshed: body.refreshed,
      playChannel: body.playChannel,
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
export async function songUrl(songmid, { type = '128', mediaId, channel = 'auto', userKey = '' } = {}) {
  const realMedia = mediaId || songmid
  try {
    const body = await request('/song/url', {
      id: songmid,
      type,
      mediaId: realMedia,
      channel,
    }, 'post', userKey)
    return mapSongUrlBody(body, type, realMedia)
  } catch (e) {
    const p = e.payload || {}
    return emptyUrlResult(type, p.mediaId || realMedia, {
      raw: p,
      tip: p.errMsg || p.tip || e.message || '',
      retcode: p.retcode ?? e.retcode,
      hasLogin: p.hasLogin,
      pay: p.pay || e.pay,
      refreshed: p.refreshed,
      refreshReason: p.refreshReason,
      triedChannels: p.triedChannels,
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
  try {
    const head = await axios.head(url, {
      timeout,
      maxRedirects: 3,
      headers,
      validateStatus: () => true,
    })
    if (head.status > 0 && head.status < 400) return true
    if (head.status === 404 || head.status === 401 || head.status === 403) return false
  } catch {
    /* range */
  }
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

/**
 * 最高音质 + 自适配降级
 */
export async function songUrlBest(
  songmid,
  { quality = 'flac', mediaId, fallback = true, probe = true, userKey = '' } = {}
) {
  const preferred = String(quality || 'flac').toLowerCase()
  const list = qualityCandidates(preferred, fallback !== false)
  let realMedia = mediaId || songmid
  let sizeInfo = null
  let predicted = ''

  try {
    const detail = await songDetail(songmid, userKey)
    const file = detail?.track_info?.file || detail?.file || {}
    realMedia = mediaId || file.media_mid || file.master_tape_media_mid || songmid
    sizeInfo = file
    predicted = pickBestAvailableQuality(file, preferred)
    const sz = summarizeFileSizes(file)
    logInfo(
      `音质自适配: 上限=${preferred} 预判=${predicted || 'unknown'} 候选=${list.join('→')} sizes(flac=${sz.flac},hires=${sz.hires},dolby=${sz.dolby},new0=${sz.new0},new2=${sz.new2},new10=${sz.new10})`
    )
  } catch {
    logInfo(`音质自适配: 上限=${preferred}（无详情 size，将逐级探测）`)
  }

  let lastErr = null
  const tried = []

  for (const type of list) {
    if (sizeInfo && !isQualitySizeOk(type, sizeInfo)) {
      tried.push(`${type}:skip-size`)
      continue
    }
    try {
      const r = await songUrl(songmid, { type, mediaId: realMedia, userKey })
      if (!r?.url) {
        tried.push(`${type}:no-url`)
        lastErr = Object.assign(new Error(r.tip || `${type} 无播放链`), {
          payload: r.raw || r,
          pay: r.pay,
          retcode: r.retcode,
        })
        continue
      }

      const fileName = String(r.file || r.url || '')
      if (/RS01|RS02|Q000/i.test(fileName) && sizeInfo && !isQualitySizeOk(type, sizeInfo)) {
        tried.push(`${type}:skip-fake-file`)
        continue
      }

      if (probe !== false) {
        const ok = await probeUrlAlive(r.url)
        if (!ok) {
          tried.push(`${type}:cdn-dead`)
          logWarn(`${type} 链接不可用，降级…`)
          lastErr = new Error(`${type} CDN 不可用`)
          continue
        }
      }

      tried.push(`${type}:ok`)
      logInfo(
        `音质选定: ${type} (${QUALITY_LABEL[type] || type}) ch=${r.playChannel || 'auto'} [${tried.join(', ')}]`
      )
      return {
        ...r,
        quality: type,
        qualityLabel: QUALITY_LABEL[type] || type,
        mediaId: realMedia,
        adaptedFrom: preferred,
        predicted,
        tried,
        playChannel: r.playChannel,
      }
    } catch (e) {
      lastErr = e
      if (e?.payload?.pay) lastErr.pay = e.payload.pay
      if (!lastErr.payload && e?.payload) lastErr.payload = e.payload
      tried.push(`${type}:err`)
    }
  }

  const hint = tried.length ? ` 已尝试: ${tried.join(', ')}` : ''
  const payload = lastErr?.payload || lastErr?.raw || {}
  const pay = payload.pay || lastErr?.pay
  const payHint =
    pay && Number(pay.pay_play) === 1
      ? ' 该曲需会员播放，请 #qqm登录'
      : ''
  const detail = payload.errMsg || payload.tip || lastErr?.message || ''
  const msg = detail
    ? `${detail}${payHint}${hint}`
    : `所有音质均无可用链接（可 #qqm登录 重新扫码）${payHint}${hint}`
  const err = lastErr || new Error(msg)
  if (!err.message || err.message === 'Error') err.message = msg
  else if (hint && !String(err.message).includes('已尝试')) err.message = `${err.message}${hint}`
  if (pay) err.pay = pay
  err.payload = payload
  throw err
}

export { isQualitySizeOk as isQualityAvailable, pickBestAvailableQuality }

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

  const mid =
    s.match(/[?&]songmid=([A-Za-z0-9]+)/i) ||
    s.match(/\/songDetail\/([A-Za-z0-9]+)/i) ||
    s.match(/\/song\/([A-Za-z0-9]{14})/i)
  if (mid) out.songmid = mid[1]

  const id = s.match(/[?&]songid=(\d+)/i) || s.match(/[?&]id=(\d{5,})/i)
  if (id) out.songid = id[1]

  const album = s.match(/[?&]albummid=([A-Za-z0-9]+)/i)
  if (album) out.albummid = album[1]

  const media = s.match(/[?&]media_mid=([A-Za-z0-9]+)/i)
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
  return {
    list: (d.list || []).map((item, idx) => normalizeSearchItem(item, idx)),
    total: d.total || 0,
    pageNo: d.pageNo || pageNo,
    singermid,
  }
}

export async function singerAlbum(singermid, { pageNo = 1, pageSize = 50, userKey = '' } = {}) {
  const body = await request('/singer/album', { singermid, pageNo, pageSize }, 'get', userKey)
  return body?.data || { list: [], total: 0 }
}

export async function singerDesc(singermid, userKey = '') {
  const body = await request('/singer/desc', { singermid }, 'get', userKey)
  return body?.data || body
}

// ──────────── 专辑 ────────────

export async function albumDetail(albummid, userKey = '') {
  const body = await request('/album', { albummid }, 'get', userKey)
  return body?.data || body
}

export async function albumSongs(albummid, { begin = 0, num = 999, userKey = '' } = {}) {
  const body = await request('/album/songs', { albummid, begin, num }, 'get', userKey)
  const d = body?.data || {}
  return {
    list: (d.list || []).map((item, idx) => normalizeSearchItem(item, idx)),
    total: d.total || 0,
    albummid,
  }
}

// ──────────── 歌单 ────────────

export async function songlistDetail(disstid, userKey = '') {
  const body = await request('/songlist', { id: disstid }, 'get', userKey)
  return body?.data || body
}

// ──────────── 评论 ────────────

export async function comment(id, { pageNo = 1, pageSize = 20, biztype = 1, userKey = '' } = {}) {
  const body = await request('/comment', { id, pageNo, pageSize, biztype }, 'get', userKey)
  return body?.data || body
}

// ──────────── 相似歌曲 ────────────

export async function similarSongs(songid, userKey = '') {
  const body = await request('/song/similar', { id: songid }, 'get', userKey)
  return body?.data?.list || body?.data || []
}

// ──────────── 链接 ID 提取（扩展专辑/歌单/歌手） ────────────

export function parseQQMusicExtendedIds(text = '') {
  const s = String(text)
  const out = { ...parseQQMusicIds(s) }

  // 专辑
  const albumMid =
    s.match(/\/album\/([A-Za-z0-9]+)/i) ||
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

// ──────────── CGI 代理（调用 QQ 音乐内部模块） ────────────

export async function cgiProxy(module, method, param = {}, userKey = '') {
  const body = await request('/cgi', { module, method, param: JSON.stringify(param) }, 'get', userKey)
  return body?.data || body
}

// ──────────── 推荐歌曲（随机一首） ────────────

export async function recommendFeed(userKey = '') {
  const body = await request('/cgi', {
    module: 'recommend.RecommendFeedServer',
    method: 'get_recommend_feed',
    param: JSON.stringify({ direction: 1, page: 1, v_cache: [], v_uniq: [], s_num: 0 }),
  }, 'get', userKey)
  const v_shelf = body?.data?.v_shelf || []
  const idSet = new Set()
  for (const shelf of v_shelf) {
    if (shelf.style === 1) {
      for (const niche of shelf.v_niche || []) {
        for (const card of niche.v_card || []) {
          if (card.id) idSet.add(card.id)
        }
      }
    }
  }
  const ids = [...idSet]
  if (!ids.length) return []
  try {
    const detailBody = await request('/cgi', {
      module: 'track_info.UniformRuleCtrlServer',
      method: 'GetTrackInfo',
      param: JSON.stringify({ ids: ids.slice(0, 20), types: ids.slice(0, 20).map(() => 200) }),
    }, 'get', userKey)
    return (detailBody?.data?.tracks || []).map((item, idx) => normalizeSearchItem(item, idx))
  } catch (e) {
    console.warn('[qqmusic-plugin] recommendFeed failed:', e.message)
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
  const tracks = body?.data?.tracks || []
  return tracks.map((item, idx) => normalizeSearchItem(item, idx))
}

// ──────────── 每日推荐 / 收藏（dirid: 202=日推, 201=收藏） ────────────

export async function userDissList(dirid = 202, { songBegin = 0, songNum = 30, userKey = '' } = {}) {
  const body = await request('/cgi', {
    module: 'srf_diss_info.DissInfoServer',
    method: 'CgiGetDiss',
    param: JSON.stringify({ disstid: 0, dirid, onlysonglist: 0, song_begin: songBegin, song_num: songNum, userinfo: 1, pic_dpi: 800, orderlist: 1 }),
  }, 'get', userKey)
  const d = body?.data || {}
  const songs = (d.songlist || []).map((item, idx) => normalizeSearchItem(item, idx))
  const dirinfo = d.dirinfo || {}
  return { songs, title: dirinfo.title || '', desc: dirinfo.desc || '' }
}

export async function dailyRecommend(opts = {}) {
  return userDissList(202, opts)
}

export async function userFavorites(opts = {}) {
  return userDissList(201, opts)
}

// ──────────── 用户歌单列表 ────────────

export async function userSonglists(qqId, userKey = '') {
  const body = await request('/user/songlist', { id: qqId }, 'get', userKey)
  return body?.data?.list || []
}

export async function userCollectSonglists(qqId, { pageNo = 1, pageSize = 20, userKey = '' } = {}) {
  const body = await request('/user/collect/songlist', { id: qqId, pageNo, pageSize }, 'get', userKey)
  return body?.data || { list: [] }
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
  singerAlbum,
  singerDesc,
  albumDetail,
  albumSongs,
  songlistDetail,
  comment,
  similarSongs,
  parseQQMusicExtendedIds,
  cgiProxy,
  recommendFeed,
  personalRadio,
  dailyRecommend,
  userFavorites,
  userSonglists,
  userCollectSonglists,
}
