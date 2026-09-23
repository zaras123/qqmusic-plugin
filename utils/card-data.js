/**
 * 热搜 / 歌词 / 设置 / 点歌列表 卡片数据装配
 */
import Config from '../components/Config.js'
import { QUALITY_LABEL } from './quality.js'
import { request, listAccounts, SOURCE_LABEL, sourceIconOf } from './api.js'
// 「多平台」主题要按来源上色：色值/短名从注册表取（单一事实来源）
import {
  platformColor,
  platformShort,
  platformOf,
  platformIdOf,
  platformQualities,
  platformCanQrLogin,
  platformQrOf,
  platformCookieOf,
} from './platforms.js'
import { maskApiBase, apiHintFor } from './privacy.js'
import { logoUrl } from './path.js'
import { resolveTheme, TIME_LABEL } from './theme.js'
import { describeBackground } from './background.js'
import { enabledPlatforms } from './v2.js'

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
    // options.title：2.0 的单平台点歌（"网易云 点歌结果"）用它，QQ 点歌不传 → 一个字都不变
    keyword: options.title || keyword || '歌曲列表',
    // 卡片副标题/页脚可显示"本列表来自哪个平台"
    sourceLabel: options.sourceLabel || '',
    /**
     * 「多平台」主题用：按来源统计条数（列表头部那排彩色 chip）
     * 例：QQ 6 · 网易云 2 · B站 2 —— 一眼看出这次搜索里每家占了几条
     */
    sourceCounts: (() => {
      const byId = new Map()
      for (const s of songs) {
        const id = s.source || 'qq'
        const cur = byId.get(id) || { id, label: id === 'qq' ? 'QQ' : SOURCE_LABEL[id] || id, color: id === 'qq' ? '#31c27c' : platformColor(id), n: 0 }
        cur.n += 1
        byId.set(id, cur)
      }
      const list = [...byId.values()]
      /**
       * 「多平台」主题把这一排画成 **iOS 分段控制器**（一条胶囊底 + 发丝分隔）。
       * 控制器总得有一段是"选中"的 —— 选条数最多的那家（并列取先出现的，
       * 保证同一份数据每次渲染选中的都是同一段，否则卡片会闪）。
       */
      let top = null
      for (const c of list) if (!top || c.n > top.n) top = c
      if (top) top.on = true
      return list
    })(),
    hasExternal: songs.some((s) => s.source),
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
      // 多平台主题用：来源 id / 品牌色 / 短名（QQ 曲目 source 为空 → 走默认绿）
      sourceId: s.source || '',
      sourceColor: s.source ? platformColor(s.source) : '#31c27c',
      sourceShort: s.source ? platformShort(s.source) : 'QQ',
      // 只带档位（不带平台名）——「多平台」主题的 chip 自己会显示平台名
      sourceTagShort: s.source ? String(s.quality || '128k') : '',
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
 * 平台登录状态卡（`#qqm平台状态`）
 *
 * 数据来自 API 的 `GET /platforms`（聚合了 QQ / 网易云 / 酷狗 / 汽水 / 酷我 / Apple / 匿名音源），
 * 这里只做**展示层**的归一：状态词、来源词、能不能扫码、没配好时给哪条命令。
 *
 * 三种 kind 的语义差别必须体现在卡上（否则用户会拿"匿名可用"当"已登录"）：
 *   · account   —— 账号级（QQ）：登录了才有无损/付费曲
 *   · credential—— 凭据级（网易云/酷狗/汽水/酷我）：自己那份 / 共享那份 / 未配置
 *   · anonymous —— 匿名即可（B站/咪咕/YouTube/JioSaavn）：**不需要登录**，只报档位
 */

/**
 * 这一行"下一步该做什么"：**能扫码就给登录命令，否则给粘贴命令**，匿名/已就绪给空
 *
 * 事实来自注册表（platformQrOf / platformCookieOf）—— 卡片 / 帮助 / 命令 / 锅巴共用一份。
 * 以前这里写的是 `POST /<平台>/cookies`，那是**运维接口**，群里没人会去 curl。
 */
function nextActionOf(name, ready) {
  if (ready) return ''
  return platformQrOf(name)?.command || platformCookieOf(name)?.command || ''
}

/**
 * 平台状态行（**聚合卡与单平台卡共用**，别两处各算一遍 —— 状态词/来源词/下一步
 * 的口径必须一致，否则同一台机器上两张卡会说不一样的话）
 */
function platformStatusRow(p) {
  const known = platformOf(p.name)
  const short = known ? platformShort(p.name) : p.name === 'qq' ? 'QQ' : p.name
  const color = known ? platformColor(p.name) : p.name === 'qq' ? '#31c27c' : '#8a8a8e'
  const anonymous = p.kind === 'anonymous'
  const apple = p.kind === 'apple'
  const ready = anonymous ? true : apple ? Boolean(p.configured) : Boolean(p.loggedIn)
  const stateText = anonymous ? '匿名可用' : apple ? (p.configured ? '已启用' : '未启用') : p.loggedIn ? '已登录' : '未配置'
  // QQ 是账号级音源，档位由你的会员决定（不是"免登录档位"），这里写它实际能到的顶
  const quality = p.quality || (p.name === 'qq' ? '无损 / Hi-Res（看会员）' : '')
  const srcText = p.sourceText && p.sourceText !== '未配置' ? `来源：${p.sourceText}` : ''
  return {
    name: p.name,
    label: p.label || p.name,
    short,
    color,
    kindText: { account: '账号', credential: '凭据', apple: '音源', anonymous: '匿名' }[p.kind] || p.kind || '',
    ready,
    stateText,
    sourceText: p.sourceText || '',
    quality,
    // 能不能扫码、下一步该发什么，全按**注册表**算（与 #qqm<平台>登录/ck 命令同一份事实）：
    // 用 API 的 canQr 会出现"卡片说可扫码、命令说没这条通道"（两边各有一份清单，必分手）
    canQr: platformCanQrLogin(p.name),
    ownersCount: Array.isArray(p.owners) ? p.owners.length : 0,
    unreliable: p.unreliable || '',
    note: p.note || '',
    // 该做什么（可操作的一步）：能扫码给登录命令，否则给粘贴命令，匿名/已就绪给空
    action: nextActionOf(p.name, ready),
    // ⚠️ 用上面算好的 quality/srcText —— 直接读 p.quality 会让 QQ 那行（API 不给 quality）
    //    明明有档位却显示空（实测踩过）
    detail: [srcText, quality ? `档位：${quality}` : ''].filter(Boolean).join(' · '),
  }
}

/**
 * **单平台**状态卡（`#qqm网易状态` / `#qqm酷狗状态` …）
 *
 * 与聚合卡（`#qqm平台状态`）同一份数据源 `GET /platforms`（10s 缓存），
 * 这里只挑出那一家，再把它的**命令清单**补齐 —— 卡的价值是"这一家怎么用、缺什么、下一步点哪"。
 */
export function buildPlatformCardData(status = {}, platformId = '') {
  const id = platformIdOf(platformId) || String(platformId || '').toLowerCase()
  const list = Array.isArray(status.list) ? status.list : []
  const hit = list.find((x) => x.name === id)
  if (!hit) return null
  const row = platformStatusRow(hit)
  const short = row.short
  const isQq = id === 'qq'
  const commands = [
    { name: '点歌', example: isQq ? '#qqm点歌 关键词' : `#qqm${short} 关键词`, desc: isQq ? 'QQ 曲库（结果尾部自动补其它平台免费曲）' : `只在 ${row.label} 里搜（免登录 ${row.quality || '-'}）` },
    { name: '播放', example: isQq ? '#qqm播放 关键词' : `#qqm${short}播放 关键词`, desc: '搜第一条直接播' },
    { name: '歌词', example: isQq ? '#qqm歌词 关键词' : `#qqm${short}歌词 关键词`, desc: '按歌取词（也可 #qqm歌词 序号）' },
  ]
  if (!isQq) commands.push({ name: '设为当前音源', example: `#qqm源 ${short}`, desc: '设一次，之后 #qqm点歌 默认走它（主人=全群、成员=只对自己）' })
  // 凭据通道（事实来自注册表）：能扫码的给登录命令（换号也用它），只有粘贴的给粘贴命令。
  // ⚠️ QQ 排除在外 —— 它的登录命令是 #qqm登录/#qqm登录app，不是 `#qqm<平台>登录`
  //   （以前这里按 API 的 canQr 拼出过 `#qqmQQ音乐登录` 这种不存在的命令）
  const qrOf = isQq ? null : platformQrOf(id)
  const ckOf = isQq ? null : platformCookieOf(id)
  if (qrOf) {
    commands.push({ name: '扫码登录', example: qrOf.command, desc: '主人扫码；凭据按主人槽位存（想全站共用 → 开「一律走主人账号」）' })
  } else if (ckOf) {
    commands.push({ name: '粘贴凭据', example: ckOf.command, desc: '私聊发（这家不能扫码）；从哪拿见帮助卡' })
  }
  commands.push({ name: '看全部平台', example: '#qqm平台状态', desc: '10 家音源的登录状态一览' })

  const cfg = Config.getConfig('qqmusic') || {}
  return {
    title: `${row.label} · 平台状态`,
    subtitle: `${row.kindText}音源 · ${row.stateText}`,
    logo: logoUrl,
    apiHint: apiHintFor(),
    themeText: resolveTheme(cfg).manifest.name,
    row,
    commands,
    qualities: platformQualities(id),
    tips: [
      row.ready
        ? (row.detail || '已就绪，可直接用上面的命令')
        : `下一步：${row.action || (row.kindText === '匿名' ? '无需配置（匿名可用）' : '见上方说明')}`,
      row.unreliable ? `⚠️ ${row.unreliable}` : '',
      row.ownersCount ? `已有 ${row.ownersCount} 人配了自己那份（他们各自用自己的）` : '',
    ].filter(Boolean),
  }
}

/** 单平台卡的纯文本兜底 */
export function formatPlatformCardText(data) {
  const r = data.row || {}
  return [
    `【${data.title}${r.ready ? ' ✅' : ' ⬜'}】${data.subtitle}`,
    r.detail || '',
    ...((data.commands || []).map((c) => `${c.example}   →  ${c.desc}`)),
    ...(data.tips || []),
  ].filter(Boolean).join('\n')
}

export function buildPlatformsCardData(status = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  const list = Array.isArray(status.list) ? status.list : []
  const kindText = { account: '账号', credential: '凭据', apple: '音源', anonymous: '匿名' }

  const rows = list.map(platformStatusRow)

  const total = rows.length
  const readyCount = rows.filter((r) => r.ready).length
  // 「还没配的」= 有下一步动作的那些（`action` 空 ⟺ 已就绪 / 这家根本没通道）。
  // 命令文案**从注册表拼**：以前这里手写「其余（酷我/Apple）」——二手名单，注册表一变就成假话
  const todo = rows.filter((r) => r.action)
  const todoHint = todo
    .map((r) => {
      const qr = platformQrOf(r.name)
      if (qr) return `${r.label} 扫码 ${qr.command}`
      const ck = platformCookieOf(r.name)
      return ck ? `${r.label} 私聊 ${ck.command}` : `${r.label} 见 API 配置`
    })
    .join('；')

  return {
    title: '平台登录状态',
    subtitle: `${readyCount}/${total} 可用 · 点歌会用到下面这些音源`,
    logo: logoUrl,
    apiHint: apiHintFor(),
    total,
    readyCount,
    canQrCount: rows.filter((r) => r.canQr).length,
    themeText: resolveTheme(cfg).manifest.name,
    rows,
    tips: [
      '「匿名可用」= 不需要登录就能取链（B站/咪咕/YouTube 这类）',
      '「已登录」= 有账号凭据，能拿更高档位或 VIP 曲',
      todo.length ? `还没配的：${todoHint}` : '所有能配的平台都配好了 🎉',
    ],
  }
}

/** 平台状态卡的纯文本兜底（图渲染失败时用） */
export function formatPlatformsText(data = {}) {
  const rows = data.rows || []
  return [
    `【${data.title || '平台登录状态'}】${data.readyCount}/${data.total} 可用`,
    ...rows.map(
      (r) =>
        `${r.ready ? '✅' : '⬜'} ${r.label}（${r.kindText}）${r.stateText}` +
        (r.detail ? ` · ${r.detail}` : '') +
        (r.action ? ` · 下一步：${r.action}` : '') +
        (r.unreliable ? `\n     ⚠️ ${r.unreliable}` : '')
    ),
    '',
    '（这张卡只在 2.0 里可用；细节看 #qqm平台）',
  ].join('\n')
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
  // 主人账号：没登录的群友点歌回落到这个号；开了「一律走主人账号」时则不看请求者。
  // 未手填时自动取最近扫码登录的账号（lastLoginUserKey 是登录会话键，备注 uin 兜底）
  const explicitAccount = String(c.publicAccount || c.public_account || '').trim()
  const publicAccount =
    explicitAccount || String(c.lastLoginUserKey || c.lastLoginUin || '').trim()
  const autoAccount = !explicitAccount && publicAccount
  const forceMasterAccount = c.forceMasterAccount === true
  // 主人账号没登录 = 静默失效（回落不生效却看不出原因），查一次并标注。
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
  const autoTag = autoAccount ? '（自动·最近登录）' : ''
  // 一起听：插件只管开关，协议参数在 API 侧；这里不显示技术细节，只标是否开着
  const togetherOn = c.togetherEnable === true
  const togetherText = !togetherOn
    ? '关闭'
    : `开${c.togetherAuto === true ? ' · 点歌后自动同步' : ''}`
  // 界面：显示**实际生效**的主题与时段（配置里写了个不存在的名字时能一眼看出回落了）
  const themeNow = resolveTheme(c)
  const periodLabel = TIME_LABEL[themeNow.period] || themeNow.period
  const modeLabel = themeNow.dark ? '深色' : '浅色'
  const modePrefLabel =
    themeNow.darkPref === 'auto' ? `自动·${modeLabel}` : modeLabel
  const themeText = `${themeNow.manifest.name}（${themeNow.id} · ${themeNow.useTimeColor ? `${periodLabel}配色` : '固定配色'} · ${modePrefLabel}）${
    themeNow.fallback ? ' ⚠️ 已回落' : ''
  }`
  const publicAccountText = !publicAccount
    ? forceMasterAccount
      ? '未登录 · ⚠️ 开了「一律走主人账号」但还没有扫码登录记录'
      : '未启用'
    : publicAccountReady === false
      ? `${publicAccount} · ⚠️ 该账号未登录，回落不会生效`
      : forceMasterAccount
        ? `${publicAccount} · 所有人点歌一律走此号${autoTag}`
        : `${publicAccount} · 未登录者点歌回落${autoTag}`

  // 2.0：解锁后统计"开了几家外部音源"（未解锁恒为 0 → 设置卡与 1.x 完全一致）
  const platformCount = enabledPlatforms(c).length
  const platformText = platformCount
    ? `已开启 ${platformCount} 家：${enabledPlatforms(c).map((p) => p.label).join(' / ')}`
    : ''

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
    togetherText,
    platformCount,
    platformText,
    themeText,
    tiles: [
      { label: '点歌', value: onOff(c.enableSongRequest), on: c.enableSongRequest !== false },
      { label: '解析', value: onOff(c.enableResolve), on: c.enableResolve !== false },
      { label: '列表卡', value: onOff(c.renderListCard), on: c.renderListCard !== false },
      { label: '语音', value: onOff(c.sendVocal), on: c.sendVocal !== false },
      { label: '群文件', value: onOff(c.uploadFile), on: c.uploadFile !== false },
      { label: '降级', value: onOff(c.qualityFallback), on: c.qualityFallback !== false },
      { label: '一起听', value: onOff(c.togetherEnable), on: togetherOn },
      // 2.0：「音源平台」只在解锁后出现（未解锁时与 1.x 的卡片一模一样）
      ...(platformCount > 0 ? [{ label: '音源平台', value: `${platformCount} 家`, on: true }] : []),
    ],
    rows: [
      { k: '登录', v: login.text },
      { k: '主人账号', v: publicAccountText },
      { k: '适配器', v: `${adapter.name} (${adapter.kind})` },
      { k: '界面', v: themeText },
      { k: '卡片背景', v: describeBackground(c) },
      { k: '一起听', v: togetherText },
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
      { name: '一起听', desc: '把点歌列表加进群里的一起听（ICQQ / NapCat / SnowLuma）', example: '#qqm一起听 1' },
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
    `login: ${data.loginText}`,
    `主人账号: ${data.publicAccountText || '未启用'}`,
    `adapter: ${data.adapterName} (${data.adapterKind})`,
    `点歌: ${data.song}  解析: ${data.resolve}  列表卡: ${data.listCard}`,
    `音质: ${data.qualityKey}（自动降级: ${data.qualityFallback}）  列表: ${data.maxList}`,
    `语音: ${data.sendVocal}  群文件: ${data.uploadFile}`,
    `原生卡: ${data.sendNativeCard}  自定义卡: ${data.sendCustomCard}`,
    `界面: ${data.themeText || 'classic'}`,
    `一起听: ${data.togetherText || '关闭'}`,
    // 2.0 解锁后才有内容（未解锁是空串 → 文本与 1.x 完全一致）
    ...(data.platformText ? [`音源平台: ${data.platformText}`] : []),
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
    // 多平台主题用：来源 id / 品牌色 / 短名
    sourceId: song.source || '',
    sourceColor: song.source ? platformColor(song.source) : '#31c27c',
    sourceShort: song.source ? platformShort(song.source) : 'QQ',
    sourceIsExternal: Boolean(song.source),
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
