/**
 * 组装 QQ 音乐状态卡片数据（对齐 R 插件 neteaseStatus / kugouStatus 字段风格）
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Config from '../components/Config.js'
import { request } from './api.js'
import { QUALITY_LABEL } from './quality.js'
import { pluginPath } from './path.js'
import { maskApiBase } from './privacy.js'

const DEFAULT_AVATAR = pathToFileURL(
  path.join(pluginPath, 'resources/img/logo.png')
).href

function loginTypeText(cookie = {}, status = {}) {
  const t = Number(status.login_type || cookie.login_type || cookie.tmeLoginType || 0)
  if (String(cookie.tmeLoginType) === '1' || (t === 2 && cookie.wxuin)) return '微信登录'
  if (String(cookie.tmeLoginType) === '2' || t === 1) return 'QQ 登录'
  if (t === 2) return '微信登录'
  if (cookie.qm_keyst || cookie.qqmusic_key || status.hasKey) return 'Cookie 登录'
  return '未登录'
}

function maskUin(uin = '') {
  const s = String(uin || '')
  if (!s || s === '0') return '-'
  if (s.length <= 4) return s
  return `${s.slice(0, 3)}***${s.slice(-2)}`
}

function maskKey(key = '') {
  const s = String(key || '')
  if (!s) return '无'
  if (s.length < 12) return '已配置'
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

async function enrichProfile(uin, userKey = '') {
  let nickname = ''
  let avatarUrl = ''
  if (!uin || uin === '0') {
    return { nickname: '未登录', avatarUrl: DEFAULT_AVATAR }
  }
  try {
    const body = await request('/user/detail', { id: uin }, 'get', userKey)
    const d = body?.data || body
    const creator = d?.creator || d?.base || d
    nickname =
      creator?.nick ||
      creator?.nickname ||
      creator?.name ||
      d?.nickname ||
      d?.nick ||
      ''
    avatarUrl =
      creator?.headurl ||
      creator?.avatarUrl ||
      creator?.avatar ||
      d?.headurl ||
      d?.avatarUrl ||
      ''
  } catch {
    /* ignore */
  }
  if (!avatarUrl) {
    if (/^\d{5,}$/.test(String(uin))) {
      avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`
    } else {
      avatarUrl = DEFAULT_AVATAR
    }
  }
  if (!nickname) nickname = `用户 ${maskUin(uin)}`
  return { nickname, avatarUrl }
}

export async function buildQQMusicStatusData(userKey = '') {
  const cfg = Config.getConfig('qqmusic')
  let status = {}
  let cookie = {}
  let apiOk = true
  let apiError = ''

  try {
    const st = await request('/login/status', {}, 'get', userKey)
    status = st?.data || {}
  } catch (e) {
    apiOk = false
    apiError = e.message
    status = { login: false }
  }

  try {
    const c = await request('/user/cookie', {}, 'get', userKey)
    cookie = c?.data?.server || c?.data || {}
  } catch {
    cookie = {}
  }

  const loggedIn = Boolean(status.login || (status.uin && status.hasKey))
  const uin = String(status.uin || cookie.uin || cookie.qqmusic_uin || '').replace(/\D/g, '')
  const key = cookie.qm_keyst || cookie.qqmusic_key || ''
  const quality = cfg.quality || 'flac'
  const qualityLabel = QUALITY_LABEL[quality] || quality

  const profile = loggedIn
    ? await enrichProfile(uin, userKey)
    : { nickname: '未登录', avatarUrl: DEFAULT_AVATAR }

  let vipTitle = '普通用户'
  let vipStateText = '未开通 / 未检测'
  let vipExpireText = '登录后可解锁付费曲与更高音质解析'
  if (!apiOk) {
    vipTitle = 'API 异常'
    vipStateText = '无法连接'
    vipExpireText = apiError || '请检查 apiBase 与 qqmusic-api-enhanced 是否启动'
  } else if (loggedIn) {
    vipTitle = '已绑定账号'
    vipStateText = status.hasRefresh ? 'Key 可刷新' : '已登录'
    vipExpireText = cookie.keyExpiresIn
      ? `Key 相关时效字段: ${cookie.keyExpiresIn}`
      : '建议定期 #qqm登录 刷新 Cookie，保持高音质可用'
  }

  const avatarUrl = profile.avatarUrl || DEFAULT_AVATAR
  // 本地 logo / 默认图用 contain，真实用户头像用 cover
  const avatarIsPhoto = Boolean(
    loggedIn &&
      avatarUrl &&
      !String(avatarUrl).includes('/resources/img/logo') &&
      !String(avatarUrl).startsWith('file:')
  )

  return {
    title: 'QQ音乐状态',
    loggedIn,
    badge: loggedIn ? 'ON' : 'OFF',
    nickname: cookie.nick || profile.nickname,
    subtitle: !apiOk
      ? 'API 连接失败'
      : loggedIn
        ? status.bound
          ? `Token 绑定槽 ${status.userKey || userKey || 'default'} · 可扫码更新`
          : '账号已绑定到 qqmusic-api-enhanced'
        : status.bound
          ? '本 Token 尚未扫码 · 发 #qqm登录 绑定 QQ 音乐'
          : '发送 #qqm登录 扫码绑定',
    uin: loggedIn ? maskUin(uin) : '-',
    uinRaw: uin,
    loginTypeText: loginTypeText(cookie, status),
    apiBase: maskApiBase(cfg.apiBase),
    keyStatus: loggedIn
      ? `API 保管 ${maskKey(key)}${status.hasRefresh ? ' · 可刷新' : ''}`
      : '未配置',
    vipTitle,
    vipStateText,
    musicQuality: qualityLabel,
    vipExpireText,
    stats: [
      { label: '点歌', value: cfg.enableSongRequest ? '开' : '关' },
      { label: '解析', value: cfg.enableResolve ? '开' : '关' },
      { label: '降级', value: cfg.qualityFallback !== false ? '开' : '关' },
    ],
    footer: 'QQMusic Plugin · 状态卡片',
    avatarUrl,
    avatarIsPhoto,
  }
}
