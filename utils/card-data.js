/**
 * 热搜 / 歌词 / 设置 / 点歌列表 卡片数据装配
 */
import Config from '../components/Config.js'
import { QUALITY_LABEL } from './quality.js'
import { request, listAccounts, SOURCE_LABEL, sourceIconOf } from './api.js'
import { maskApiBase, apiHintFor } from './privacy.js'
import { logoUrl } from './path.js'

/** 点歌列表卡片 - 统一风格模板，用于歌手/专辑/歌单/排行 */
export function buildListCardData(keyword, songs, options = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  const hasMv = songs.some((s) => s.mvVid)
  // 常用指令：原卡片底部「小提示」的内容并入此列表
  const commands = [
    {
      name: '#qqm听序号',
      desc: options.tip || '播放当前列表中的指定歌曲（会话内也可 #听序号）',
      example: '#qqm听1',
    },
    {
      name: '#qqm歌词 序号',
      desc: '查看指定歌曲的纯文本歌词',
      example: '#qqm歌词1',
    },
  ]
  if (hasMv) {
    commands.push({
      name: '#qqmMV 播放 序号',
      desc: '播放 / 下载该曲 MV（列表带 🎬 即是有 MV 的歌曲）',
      example: '#qqmMV 播放 1',
    })
  }
  commands.push({
    name: '列表有效期',
    desc: '本列表约 10 分钟内有效，过期请重新搜索',
    example: '#qqm点歌 关键词',
  })
  return {
    keyword: keyword || '歌曲列表',
    total: songs.length,
    logo: logoUrl,
    quality: String(cfg.quality || 'auto').toUpperCase(),
    apiHint: apiHintFor(),
    singerInfo: options.singerInfo || '',
    albumInfo: options.albumInfo || '',
    songs: songs.map((s, i) => ({
      index: i + 1,
      songName: s.songName || '未知',
      singerName: s.singerName || '未知',
      albumName: s.albumName || '',
      cover: s.cover || '',
      duration: s.duration || '',
      payplay: Boolean(s.payplay),
      hasMv: Boolean(s.mvVid),
      // 外部平台补充曲：卡片上标来源与音质，避免误以为是自己账号的问题
      sourceTag: s.source ? `${SOURCE_LABEL[s.source] || s.source} · ${s.quality || '128k'}` : '',
      sourceIcon: sourceIconOf(s.source),
      external: Boolean(s.external),
    })),
    hasMv,
    commands,
  }
}

/** 热搜卡片 */
export function buildHotCardData(items = []) {
  const list = (Array.isArray(items) ? items : [])
    .map((item, i) => {
      const word =
        item.k ||
        item.keyword ||
        item.query ||
        item.name ||
        item.title ||
        (typeof item === 'string' ? item : '')
      if (!word) return null
      return {
        index: i + 1,
        word: String(word),
        hot: item.n || item.hot || item.score || item.rank || '',
      }
    })
    .filter(Boolean)
    .slice(0, 15)

  return {
    title: 'QQ音乐热搜',
    subtitle: '实时热搜 · 可直接 #qqm点歌 关键词',
    total: list.length,
    items: list,
    apiHint: apiHintFor(),
    tip: '复制热搜词后发送 #qqm点歌 关键词 即可搜索',
  }
}

/** 清理评论正文：去掉 QQ音乐表情代码 / 换行 / 音频图片标记 */
export function cleanCommentText(text = '') {
  return String(text || '')
    .replace(/\[em\]e?\d+\[\/em\]/gi, '') // [em]e400668[/em] 表情代码
    .replace(/\[[\w一-龥]{1,10}\]/g, ' ') // [音频] [图片] 等剩余标记
    .replace(/\\r\\n|\\n/g, ' ') // 字面量 \r\n / \n（接口返回常是反斜杠+n）
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 评论时间戳（秒）→ YYYY-MM-DD */
function formatCommentTime(ts) {
  if (!ts) return ''
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return ''
  const d = new Date(t * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 评论卡片：每条评论一个格子（头像 + 昵称 + 时间 + 内容 + 赞数）
 * @param {object} opts
 * @param {Array<object>} opts.comments 原始评论对象（含 nick/avatarurl/praisenum/time/rootcommentcontent）
 */
export function buildCommentCardData({
  songName = '未知',
  singerName = '未知',
  cover = '',
  albumName = '',
  comments = [],
  songmid = '',
} = {}) {
  const list = (Array.isArray(comments) ? comments : [])
    .map((c, i) => {
      const nick = c.nick || c.nickname || '匿名'
      const raw = c.rootcommentcontent || c.middlecommentcontent || c.content || c.comment || ''
      const content = cleanCommentText(raw) || '（仅表情 / 图片）'
      return {
        index: i + 1,
        nick: String(nick),
        avatar: c.avatarurl || c.headurl || c.headPic || '',
        time: formatCommentTime(c.time),
        likes: c.praisenum || c.likeCount || 0,
        content,
        hot: Boolean(c.is_hot || c.is_hot_cmt),
      }
    })
    .filter(Boolean)
    .slice(0, 20)

  return {
    songName,
    singerName,
    cover: cover || '',
    albumName: albumName || '',
    songmid: songmid || '',
    comments: list,
    total: list.length,
    apiHint: apiHintFor(),
    tip: '发送 #qqm点歌 关键词 可以搜索播放',
  }
}

/** 歌词卡片 */
export function buildLyricCardData({
  songName = '未知',
  singerName = '未知',
  cover = '',
  albumName = '',
  lines = [],
  songmid = '',
} = {}) {
  const body = (Array.isArray(lines) ? lines : [])
    .map((l) => String(l || '').trim())
    .filter(Boolean)
    .slice(0, 36)

  return {
    songName,
    singerName,
    cover: cover || '',
    albumName: albumName || '',
    songmid: songmid || '',
    lines: body,
    lineCount: body.length,
    apiHint: apiHintFor(),
    tip: body.length >= 36 ? '仅展示前 36 行，完整歌词请到 QQ 音乐查看' : '已去除时间戳，纯文本歌词',
  }
}

/**
 * 设置卡片（含登录/适配器探测）
 * @param {object} e 消息事件（可选，用于适配器识别）
 */
export async function buildSettingsCardData(e = null) {
  const c = Config.getConfig('qqmusic') || {}
  // ⚠️ 必须带调用者 userKey：多账号下不带就落到 API 的 default 槽，
  // 会把「另一个账号」的 uin/昵称当成当前登录显示（与 #qqm状态 自相矛盾）
  const userKey = String(e?.user_id || '')
  let login = { ok: false, text: '查询失败', uin: '', nick: '' }
  try {
    const st = await request('/login/status', {}, 'get', userKey)
    const d = st?.data || {}
    if (d.login) {
      login = {
        ok: true,
        text: `已绑定${d.nick ? ` · ${d.nick}` : ''}`,
        uin: String(d.uin || ''),
        nick: d.nick || '',
      }
    } else {
      login = { ok: false, text: '未绑定（#qqm登录）', uin: '', nick: '' }
    }
  } catch (err) {
    login = { ok: false, text: `API 异常`, uin: '', nick: '' }
  }

  let adapter = { kind: 'unknown', name: '-', id: '-' }
  try {
    if (e) {
      const { detectAdapter } = await import('./adapter.js')
      const a = detectAdapter(e)
      adapter = {
        kind: a.kind || 'unknown',
        name: a.name || a.kind || '-',
        id: a.id || '-',
      }
    }
  } catch {
    /* ignore */
  }

  const q = c.quality || 'auto'
  const qualityLabel = QUALITY_LABEL[q] || String(q).toUpperCase()
  const apiBaseView = maskApiBase(c.apiBase)
  const apiHint = c.apiBase ? `API · ${apiBaseView.replace(/^https?:\/\//, '')}` : 'API 未配置'

  const onOff = (v) => (v === false ? '关' : '开')
  // 公共账号：没登录的群友点歌回落到这个号（留空=不启用）
  const publicAccount = String(c.publicAccount || c.public_account || '').trim()
  // 配了公共账号、但那个号其实没登录 = 静默失效（回落不生效却看不出原因），查一次并标注。
  // 查不到（API 异常）时不下结论，避免误报。
  let publicAccountReady = null
  if (publicAccount) {
    try {
      const list = await listAccounts()
      publicAccountReady = list.some((a) => String(a.userKey) === publicAccount)
    } catch {
      publicAccountReady = null
    }
  }
  const publicAccountText = !publicAccount
    ? '未启用'
    : publicAccountReady === false
      ? `${publicAccount} · ⚠️ 该账号未登录，回落不会生效`
      : `${publicAccount} · 未登录者点歌回落`

  return {
    title: 'QQ音乐设置',
    subtitle: '当前插件运行配置一览',
    apiBase: apiBaseView,
    apiHint,
    enable: onOff(c.enable),
    enableRaw: c.enable !== false,
    song: onOff(c.enableSongRequest),
    resolve: onOff(c.enableResolve),
    listCard: onOff(c.renderListCard),
    quality: qualityLabel,
    qualityKey: q,
    qualityFallback: onOff(c.qualityFallback),
    maxList: Number(c.maxList) || 10,
    sendVocal: onOff(c.sendVocal),
    uploadFile: onOff(c.uploadFile),
    sendNativeCard: onOff(c.sendNativeCard),
    sendCustomCard: onOff(c.sendCustomCard),
    loginOk: login.ok,
    loginText: login.text,
    loginUin: login.uin,
    loginNick: login.nick,
    publicAccount,
    publicAccountText,
    adapterName: adapter.name,
    adapterKind: adapter.kind,
    adapterId: adapter.id,
    tiles: [
      { label: '点歌', value: onOff(c.enableSongRequest), on: c.enableSongRequest !== false },
      { label: '解析', value: onOff(c.enableResolve), on: c.enableResolve !== false },
      { label: '列表卡', value: onOff(c.renderListCard), on: c.renderListCard !== false },
      { label: '语音', value: onOff(c.sendVocal), on: c.sendVocal !== false },
      { label: '群文件', value: onOff(c.uploadFile), on: c.uploadFile !== false },
      { label: '降级', value: onOff(c.qualityFallback), on: c.qualityFallback !== false },
    ],
    rows: [
      { k: 'API', v: apiBaseView },
      { k: '登录', v: login.text },
      { k: '公共账号', v: publicAccountText },
      { k: '适配器', v: `${adapter.name} (${adapter.kind})` },
      { k: '音质', v: `${qualityLabel}${c.qualityFallback !== false ? ' · 自动降级' : ''}` },
      { k: '列表数', v: String(Number(c.maxList) || 10) },
      {
        k: '发送',
        v: `语音 ${onOff(c.sendVocal)} / 文件 ${onOff(c.uploadFile)} / 原生卡 ${onOff(c.sendNativeCard)} / 自定义卡 ${onOff(c.sendCustomCard)}${c.disableHighQualityVocal ? ' / 禁高清语音' : ''}`,
      },
    ],
    commands: [
      { name: '扫码登录', desc: '绑定 QQ 音乐账号获取付费曲权限', example: '#qqm登录' },
      { name: '状态卡片', desc: '查看当前插件运行状态', example: '#qqm状态' },
      { name: '改 API', desc: '切换 qqmusic-api 地址（主人）', example: '#qqm api <地址>' },
      { name: '改音质', desc: '设置最高播放音质', example: '#qqm 音质 flac' },
      { name: '开关点歌', desc: '开启 / 关闭点歌功能', example: '#qqm 开启点歌' },
      { name: '连通测试', desc: '测试 API 是否正常响应', example: '#qqm 测试' },
    ],
    tip: '详细开关可在锅巴面板修改；API 地址对所有人打码显示',
  }
}

/** 纯文本兜底：热搜 */
export function formatHotText(items = []) {
  const list = (Array.isArray(items) ? items : []).slice(0, 15)
  if (!list.length) return '暂无热搜'
  const text = list
    .map((item, i) => {
      const word =
        item.k || item.keyword || item.query || item.name || item.title || JSON.stringify(item)
      return `${i + 1}. ${word}`
    })
    .join('\n')
  return `QQ音乐热搜\n${text}`
}

/** 纯文本兜底：歌词 */
export function formatLyricText({ songName, singerName, lines }) {
  const head =
    songName || singerName ? `歌词：${songName || '未知'} - ${singerName || '未知'}\n` : ''
  const body = (lines || []).join('\n')
  return `${head}${body}`.trim() || '暂无歌词'
}

/** 纯文本兜底：设置 */
export function formatSettingsText(data) {
  return [
    '【QQ音乐插件配置】',
    `enable: ${data.enableRaw !== false}`,
    `apiBase: ${data.apiBase}`,
    `login: ${data.loginText}`,
    `公共账号: ${data.publicAccountText || '未启用（留空）'}`,
    `adapter: ${data.adapterName} (${data.adapterKind})`,
    `点歌: ${data.song}  解析: ${data.resolve}  列表卡: ${data.listCard}`,
    `音质: ${data.qualityKey}（自动降级: ${data.qualityFallback}）  列表: ${data.maxList}`,
    `语音: ${data.sendVocal}  群文件: ${data.uploadFile}`,
    `原生卡: ${data.sendNativeCard}  自定义卡: ${data.sendCustomCard}`,
    '',
    '主人命令：',
    '#qqm登录 / #qqm状态 / #qqm 音质 flac',
    '#qqm api <地址>   （设置 API 地址，主人）',
    '#qqm 开启点歌 / #qqm 关闭解析 / #qqm 测试',
  ].join('\n')
}

/** 生成基于当前配置的动态提示文案：精准反映当前会发送什么（语音 / 群文件 / 原生卡 / 自定义卡） */
export function buildDeliveryTip(cfg = {}, { qualityLabel = '', hasUrl = false, degradeNote = '', error = '' } = {}) {
  if (!hasUrl) {
    if (error) return `获取播放链接失败：${error}`
    return '未获取到播放链接，请 #qqm登录'
  }

  const q = qualityLabel || '默认音质'
  const sendVocal = cfg.sendVocal !== false
  const uploadFile = cfg.uploadFile !== false
  const sendNative = Boolean(cfg.sendNativeCard)
  const sendCustom = Boolean(cfg.sendCustomCard)

  const actions = []
  if (sendVocal) actions.push('语音')
  if (uploadFile) actions.push('群文件')
  if (sendNative || sendCustom) actions.push('音乐卡片')

  let main = actions.length
    ? `正在发送${actions.join(' + ')}（${q}）...`
    : `已获取播放链接（${q}）`

  if (degradeNote) main += ` · ${degradeNote}`
  return main
}

/** 歌曲详情卡片（解析后展示） */
export function buildDetailCardData(song, { qualityLabel = '', payplay = false, source = '', hasUrl = false, mvVid = '', tip = '', degradeNote = '', error = '', cfg = null } = {}) {
  const isVip = Boolean(song.payplay) || payplay
  const payInfo = isVip ? '🔒 会员' : (song.pay?.pay_down ? '💰 付费' : '🆓 免费')
  const urlStatus = (hasUrl ? '✅ 有播放链接' : '⚠️ 仅免费链接') + (mvVid ? ' · 🎬 有MV' : '')

  let title = song.songName || '未知'
  if (isVip) title += ' [会员]'
  else if (song.pay?.pay_down) title += ' [付费]'

  let sourceText = source || '未知来源'
  if (source === '链接') sourceText = '🔗 链接解析'
  else if (source === '卡片') sourceText = '📋 卡片解析'

  // 动态 tip：调用方若传了自定义 tip 优先用；否则读 cfg 动态生成（精准反映 语音/群文件/音乐卡片）
  const activeCfg = cfg || Config.getConfig('qqmusic') || {}
  const baseTip = tip || buildDeliveryTip(activeCfg, { qualityLabel, hasUrl, degradeNote, error })
  // 模板 .tips 无 white-space:pre，\n 会被折叠，故用 · 分隔；#qqmMV 播放/下载 不带参数 = 操作本曲 MV
  const mvHint = mvVid ? ` · 🎬 该曲有 MV：#qqmMV 播放/下载 直接操作` : ''

  return {
    title: title,
    songName: song.songName || '未知',
    singerName: song.singerName || '未知歌手',
    albumName: song.albumName || '',
    cover: song.cover || '',
    songmid: song.songmid || '',
    duration: song.duration || '',
    qualityLabel: qualityLabel || '',
    payplay: isVip,
    showPay: true,
    payInfo,
    urlStatus,
    source: sourceText,
    tip: baseTip + mvHint,
    mvVid: mvVid || '',
  }
}

/** 播放量友好格式化：1.2亿 / 12018万 / 9999 */
function fmtCount(n) {
  if (!n) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(n)
}

/** MV 详情卡片 - 复用 qqmusic-detail 模板；按 MV 语义映射（无专辑/无音质/显示时长） */
export function buildMvCardData(mv) {
  const title = mv.mvtitle || mv.name || mv.songName || 'MV'
  const singer = mv.singerName || mv.singer_name || ''
  const play = Number(mv.listennum || mv.listenNum || 0)
  const pubdate = mv.pubdate || mv.pub_date || mv.publish_date || ''
  // 时长：秒 → m:ss
  let duration = ''
  const sec = Number(mv.duration || mv.durationSec || 0)
  if (sec > 0) {
    duration = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }
  const tipParts = [
    play ? `累计播放 ${fmtCount(play)}` : '',
    pubdate ? `发行 ${pubdate}` : '',
    '发 #qqmMV 播放/下载 序号',
  ].filter(Boolean)
  return {
    title,
    songName: title,
    singerName: singer || '未知歌手',
    albumName: '', // MV 无专辑概念，发行日期进 tip
    cover: mv.cover || mv.picurl || '',
    songmid: '', // songmid 语义是歌曲 mid，MV 用 vid
    duration,
    qualityLabel: '', // 音质概念不适用于 MV
    payplay: false,
    showPay: false, // 不显示 付费/免费 徽章
    source: 'MV',
    tip: tipParts.join(' · ') || '发 #qqmMV 播放/下载 序号',
    vid: mv.vid || '',
    listennum: play,
  }
}

/** 纯文本兜底：歌曲详情 */
export function formatDetailText(song, { qualityLabel = '', hasUrl = false } = {}) {
  const isVip = Boolean(song.payplay)
  const lines = [
    `♪ ${song.songName || '未知'} - ${song.singerName || '未知'}${isVip ? ' [会员/付费]' : ''}`,
  ]
  if (song.albumName) lines.push(`专辑：${song.albumName}`)
  if (song.duration) lines.push(`时长：${song.duration}`)
  if (qualityLabel) lines.push(`音质：${qualityLabel}`)
  if (!hasUrl && isVip) lines.push('⚠️ 该曲需会员，请 #qqm登录')
  return lines.join('\n')
}
