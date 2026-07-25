/**
 * 热搜 / 歌词 / 设置 / 点歌列表 卡片数据装配
 */
import Config from '../components/Config.js'
import { QUALITY_LABEL } from './quality.js'
import { request } from './api.js'
import { maskApiBase, apiHintFor } from './privacy.js'

/** 点歌列表卡片 - 统一风格模板，用于歌手/专辑/歌单/排行 */
export function buildListCardData(keyword, songs, options = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  return {
    keyword: keyword || '歌曲列表',
    total: songs.length,
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
    })),
    tip: options.tip || '发送 #qqm听序号 播放（会话内也可 #听序号）；列表约 10 分钟内有效',
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
  let login = { ok: false, text: '查询失败', uin: '', nick: '' }
  try {
    const st = await request('/login/status')
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
  const apiBaseView = maskApiBase(c.apiBase, e)
  const apiHint = c.apiBase ? `API · ${apiBaseView.replace(/^https?:\/\//, '')}` : 'API 未配置'

  const onOff = (v) => (v === false ? '关' : '开')

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
      { k: '适配器', v: `${adapter.name} (${adapter.kind})` },
      { k: '音质', v: `${qualityLabel}${c.qualityFallback !== false ? ' · 自动降级' : ''}` },
      { k: '列表数', v: String(Number(c.maxList) || 10) },
      {
        k: '发送',
        v: `语音 ${onOff(c.sendVocal)} / 文件 ${onOff(c.uploadFile)} / 原生卡 ${onOff(c.sendNativeCard)} / 自定义卡 ${onOff(c.sendCustomCard)}`,
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
    tip: '详细开关可在锅巴面板修改；API 地址默认对群成员隐藏，可在配置 hideApiBase:false 关闭',
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

/** 歌曲详情卡片（解析后展示） */
export function buildDetailCardData(song, { qualityLabel = '', payplay = false, source = '' } = {}) {
  return {
    songName: song.songName || '未知',
    singerName: song.singerName || '未知歌手',
    albumName: song.albumName || '',
    cover: song.cover || '',
    songmid: song.songmid || '',
    duration: song.duration || '',
    qualityLabel: qualityLabel || '',
    payplay: payplay || Boolean(song.payplay),
    source: source || '',
    tip: '正在下载并发送语音...',
  }
}

/** 纯文本兜底：歌曲详情 */
export function formatDetailText(song, { qualityLabel = '' } = {}) {
  const lines = [
    `♪ ${song.songName || '未知'} - ${song.singerName || '未知'}`,
  ]
  if (song.albumName) lines.push(`专辑：${song.albumName}`)
  if (song.duration) lines.push(`时长：${song.duration}`)
  if (qualityLabel) lines.push(`音质：${qualityLabel}`)
  return lines.join('\n')
}
