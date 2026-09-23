/**
 * 离线预览：把**所有主题 × 所有卡片 × 浅色/深色**渲染成 PNG
 *
 * 用法:
 *   node scripts/preview-cards.mjs                  # 全部
 *   node scripts/preview-cards.mjs apple            # 只渲染某个主题
 *   node scripts/preview-cards.mjs apple qqmusic-list
 *   node scripts/preview-cards.mjs --dark           # 只渲染深色（支持深色的主题）
 *
 * 产出: temp/preview/<主题>[-dark]/<卡片>.png
 *
 * 为什么复用 utils/render.js 而不另写一份：预览必须走**生产同一条**路径变换
 * （resources/ 绝对化、data-theme/data-mode 注入、art-template 热更新），
 * 否则「预览好看、真机发出去是另一回事」。
 * 为此先在环境变量里给出框架目录，path.js 会优先用它。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.resolve(__dirname, '..')

/** 找框架根目录：预览要借它的 node_modules（art-template / puppeteer） */
function resolveYunzai() {
  const candidates = [
    process.env.QQMUSIC_YUNZAI_PATH,
    path.resolve(pluginPath, '../Yunzai'),
    path.resolve(pluginPath, '../Miao-Yunzai'),
    path.resolve(pluginPath, '../../机器人框架/Yunzai'),
    path.resolve(pluginPath, '../../机器人框架/Miao-Yunzai'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node_modules/art-template'))) return c
  }
  for (const base of [path.resolve(pluginPath, '..'), path.resolve(pluginPath, '../..')]) {
    let entries = []
    try {
      entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of entries) {
      if (!d.isDirectory()) continue
      const p = path.join(base, d.name)
      if (fs.existsSync(path.join(p, 'node_modules/art-template'))) return p
    }
  }
  throw new Error('找不到 Yunzai 框架目录；请设置 QQMUSIC_YUNZAI_PATH')
}

// 必须在 import utils/* 之前设好：path.js 在模块加载时就要解析框架目录
process.env.QQMUSIC_YUNZAI_PATH = resolveYunzai()

const { listThemeIds, loadManifest, resolveTheme, pageBgOf, viewportWidthOf, CARDS } = await import(
  '../utils/theme.js'
)
const { renderHtmlFile, screenshotDirect } = await import('../utils/render.js')

const outRoot = path.join(pluginPath, 'temp', 'preview')
fs.mkdirSync(outRoot, { recursive: true })

const logoUrl = pathToFileURL(path.join(pluginPath, 'resources/img/logo.png')).href

// —————————————————————— 样例数据（每张卡一套） ——————————————————————

/* 2.0 的**来源色标**：「多平台」主题的全部立意就是每首歌左边那条来源色轨 + 右边同色 chip。
 * 样例里清一色 QQ 绿，等于把主题最要紧的那一眼藏起来（这一版之前就是这样，真实预览里
 * 那条色轨与 chip 根本没被画出来过）。所以样例必须混着来：QQ / 网易云 / B站 / 汽水。 */
const SRC = {
  qq: { color: '#31c27c', label: 'QQ', short: 'QQ', tag: '' },
  netease: { color: '#c62f2f', label: '网易云', short: '网易云', tag: '128k' },
  kuwo: { color: '#ffb500', label: '酷我', short: '酷我', tag: '128k' },
  bilibili: { color: '#fb7299', label: 'B站', short: 'B站', tag: '192k' },
  qishui: { color: '#00e0c6', label: '汽水', short: '汽水', tag: '256k' },
}

const SONGS = [
  { songName: '起风了', singerName: '买辣椒也用券', albumName: '起风了', duration: '05:25', payplay: false, src: 'qq' },
  { songName: '起风了（Live）', singerName: '吴青峰', albumName: '歌手', duration: '05:11', payplay: true, src: 'qq' },
  { songName: '起风了', singerName: '周深', albumName: '深的深', duration: '04:58', payplay: false, src: 'netease' },
  { songName: '起风了（翻唱）', singerName: '某翻唱歌手', albumName: '翻唱合集', duration: '05:02', payplay: false, src: 'bilibili' },
  { songName: '起风了 · 钢琴版', singerName: '钢琴曲合辑', albumName: '纯音乐', duration: '04:20', payplay: false, src: 'qishui' },
]

/** 把 src 展开成模板要的字段（口径对齐 utils/card-data.js 里 songs.map 的产物） */
function withSource(song) {
  const m = SRC[song.src] || SRC.qq
  const external = song.src !== 'qq'
  return {
    ...song,
    external,
    sourceId: external ? song.src : '',
    sourceColor: m.color,
    sourceShort: m.short,
    sourceTagShort: m.tag,
    sourceTag: external ? `${m.label} · ${m.tag}` : '',
  }
}

/** 按来源统计（对齐 card-data 的 sourceCounts：{id,label,color,n}） */
function countSources(list) {
  const byId = new Map()
  for (const s of list) {
    const id = s.src || 'qq'
    const cur = byId.get(id) || { id, label: (SRC[id] || SRC.qq).label, color: (SRC[id] || SRC.qq).color, n: 0 }
    cur.n += 1
    byId.set(id, cur)
  }
  const out = [...byId.values()]
  // 与 utils/card-data.js 同口径：条数最多的那段是"选中"的（并列取先出现的）
  let top = null
  for (const c of out) if (!top || c.n > top.n) top = c
  if (top) top.on = true
  return out
}

/* 平台行样例：字段与 utils/card-data.js 的 platformStatusRow() **一一对应**
 * （聚合卡与单平台卡共用那一个函数，样例也必须共用同一份，否则预览会骗人）。
 * 覆盖四种状态：已登录 / 匿名可用 / 未配置(凭据→给 POST) / 未配置(可扫码→给命令)，
 * 外加一行带 unreliable 的告警文案 —— 这几种在真机上都会出现。 */
const PLATFORM_ROWS = [
  { name: 'qq', label: 'QQ 音乐', color: '#31c27c', kindText: '账号', ready: true, stateText: '已登录', canQr: true,
    quality: '无损 / Hi-Res（看会员）', sourceText: '', ownersCount: 0, action: '', unreliable: '', note: '',
    detail: '档位：无损 / Hi-Res（看会员）' },
  { name: 'netease', label: '网易云', color: '#c62f2f', kindText: '账号', ready: true, stateText: '已登录', canQr: true,
    quality: '128k', sourceText: '手机号扫码', ownersCount: 1, action: '', unreliable: '', note: '',
    detail: '来源：手机号扫码 · 档位：128k' },
  { name: 'kuwo', label: '酷我', color: '#ffb500', kindText: '账号', ready: false, stateText: '未配置', canQr: true,
    quality: '128k', sourceText: '', ownersCount: 0, action: '#qqm酷我登录', unreliable: '', note: '',
    detail: '档位：128k' },
  { name: 'kugou', label: '酷狗', color: '#0ea0e8', kindText: '凭据', ready: false, stateText: '未配置', canQr: false,
    quality: '128k', sourceText: '', ownersCount: 0, action: 'POST /kugou/cookies', unreliable: '', note: '',
    detail: '档位：128k' },
  { name: 'bilibili', label: 'B站', color: '#fb7299', kindText: '匿名', ready: true, stateText: '匿名可用', canQr: false,
    quality: '192k', sourceText: '', ownersCount: 0, action: '', unreliable: '', note: '',
    detail: '档位：192k' },
  { name: 'youtube', label: 'YouTube', color: '#ff0033', kindText: '凭据', ready: false, stateText: '未配置', canQr: false,
    quality: '128k', sourceText: '', ownersCount: 0, action: 'POST /youtube/cookies',
    unreliable: '版权曲取链失败率偏高，当兜底用，别当主力', note: '', detail: '档位：128k' },
  { name: 'apple', label: 'Apple Music', color: '#fa2a55', kindText: '音源', ready: false, stateText: '未启用', canQr: false,
    quality: '256k', sourceText: '', ownersCount: 0, action: '', unreliable: '', note: '', detail: '档位：256k' },
]

/* 帮助卡的音源清单：模板有两种吃法 ——
 *   · 老主题（classic / apple）读 `sections[0].platforms`
 *   · 2.0 的「星云 / 多平台」读 `data.sources`（多要 short / needsCredential）
 * 生产数据由 utils/help-card.js **同时**给出这两份（同一份数据的两种形状）。
 * 样例也必须照做：只给 `sections[0].platforms` 的话，2.0 帮助卡最核心的那一段
 * ——"一行一个音源 + 品牌色轨 + 最短命令"——根本不会被画出来（预览会骗人，
 * 这一版之前就是这样：整段音源区在预览里是缺席的）。 */
const GUIDE_PLATS = [
  { id: 'netease', short: '网易', label: '网易云', color: '#c62f2f', quality: '128k', needsCredential: false },
  { id: 'kuwo', short: '酷我', label: '酷我', color: '#ffb500', quality: '128k', needsCredential: false },
  { id: 'bilibili', short: 'B站', label: 'B站', color: '#fb7299', quality: '192k', needsCredential: false },
  { id: 'kugou', short: '酷狗', label: '酷狗', color: '#0ea0e8', quality: '128k', needsCredential: true },
  { id: 'qishui', short: '汽水', label: '汽水', color: '#00e0c6', quality: '256k', needsCredential: false },
  { id: 'migu', short: '咪咕', label: '咪咕', color: '#ff5a5f', quality: '128k', needsCredential: false },
  { id: 'youtube', short: 'YouTube', label: 'YouTube', color: '#ff0033', quality: '128k', needsCredential: true },
  { id: 'apple', short: 'Apple', label: 'Apple Music', color: '#fa2a55', quality: '256k', needsCredential: true },
]

const samples = {
  // 2.0 平台登录状态卡（`#qqm平台状态`）：这是 2.0 才有的卡，之前预览里一直是 SKIP
  'qqmusic-platforms': {
    title: '平台登录状态',
    subtitle: `${PLATFORM_ROWS.filter((r) => r.ready).length}/${PLATFORM_ROWS.length} 可用 · 点歌会用到下面这些音源`,
    logo: logoUrl,
    apiHint: '',
    total: PLATFORM_ROWS.length,
    readyCount: PLATFORM_ROWS.filter((r) => r.ready).length,
    canQrCount: PLATFORM_ROWS.filter((r) => r.canQr).length,
    rows: PLATFORM_ROWS,
    tips: [
      '「匿名可用」= 不需要登录就能取链（B站/咪咕/YouTube 这类）',
      '「已登录」= 有账号凭据，能拿更高档位或 VIP 曲',
      '还没配的：酷我 / 酷狗 / YouTube —— 可扫码的发 #qqm<平台>登录，其余用 POST /<平台>/cookies',
    ],
  },
  // 2.0 单平台状态卡（`#qqm网易状态`）
  'qqmusic-platform': {
    title: '网易云 · 平台状态',
    subtitle: '账号音源 · 已登录',
    logo: logoUrl,
    apiHint: '',
    row: PLATFORM_ROWS[1],
    qualities: ['128k', '192k', '320k'],
    commands: [
      { name: '点歌', example: '#qqm网易云 关键词', desc: '只在 网易云 里搜（免登录 128k）' },
      { name: '播放', example: '#qqm网易云播放 关键词', desc: '搜第一条直接播' },
      { name: '歌词', example: '#qqm网易云歌词 关键词', desc: '按歌取词（也可 #qqm歌词 序号）' },
      { name: '设为当前音源', example: '#qqm源 网易云', desc: '设一次，之后 #qqm点歌 默认走它' },
      { name: '扫码登录', example: '#qqm网易云登录', desc: '主人扫码（凭据写共享那份，全站可用）' },
      { name: '看全部平台', example: '#qqm平台状态', desc: '10 家音源的登录状态一览' },
    ],
    tips: ['来源：手机号扫码 · 档位：128k'],
  },
  // 2.0 帮助卡（解锁后才会真机渲染）：样例按"全平台都开着"来画，方便看彩条与两列布局
  'qqmusic-guide': {
    version: 'v2.0.0',
    logo: logoUrl,
    title: '2.0 帮助',
    subtitle: '8 家音源 · 点歌 / 解析 / 卡片',
    statCommands: '24+',
    statQuality: 'FLAC',
    statPlatforms: '8',
    statPlatformsTotal: String(GUIDE_PLATS.length + 1),
    statMode: '全开',
    currentSource: 'QQ 曲库',
    full: false,
    sources: GUIDE_PLATS.map((p) => ({ id: p.id, label: p.label, short: p.short, color: p.color, quality: p.quality, needsCredential: p.needsCredential })),
    apiHint: '',
    isMaster: true,
    tip: '外源曲免登录可直接播（档位看标签）；QQ 音乐付费曲仍需主人扫码登录。',
    sections: [
      {
        title: '多平台音源',
        tag: '8 家',
        platforms: GUIDE_PLATS.map((p) => ({ id: p.id, label: p.label, color: p.color, quality: p.quality })),
        items: [
          { name: '跨平台补歌', desc: 'QQ 结果尾部自动追加可播的外源曲', example: '#qqm点歌 关键词' },
          { name: '网易云 点歌', desc: '只在网易云里搜（免登录 128k）', example: '#qqm网易云点歌 关键词' },
          { name: '平台清单', desc: '列出现在开着的平台与命令', example: '#qqm平台' },
        ],
      },
      {
        title: '点歌播放',
        tag: '全员',
        items: [
          { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
          { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
          { name: '直接播放', desc: '搜索并立即播放第一条', example: '#qqm播放 晴天' },
          { name: '查看歌词', desc: '按歌名/mid 取歌词', example: '#qqm歌词 七里香' },
          { name: '热搜榜', desc: '查看 QQ 音乐热搜', example: '#qqm热搜' },
          { name: '一起听', desc: '把列表第 N 首加进群里的一起听', example: '#qqm一起听 1' },
        ],
      },
      {
        title: '发现音乐',
        tag: '探索',
        items: [
          { name: '排行榜', desc: '查看各大榜单歌曲', example: '#qqm排行 飙升' },
          { name: '推荐歌单', desc: '热门推荐歌单列表', example: '#qqm推荐' },
          { name: '歌手搜索', desc: '搜索歌手并展示热门歌曲', example: '#qqm歌手 周杰伦' },
          { name: '专辑搜索', desc: '搜索专辑并展示曲目列表', example: '#qqm专辑 叶惠美' },
        ],
      },
      {
        title: '主人管理',
        tag: 'Master',
        items: [
          { name: '查看配置', desc: 'API、开关、音质与发送方式', example: '#qqm设置' },
          { name: '切换界面', desc: '换一套卡片 UI / 深浅色', example: '#qqm界面' },
        ],
      },
    ],
  },
  'qqmusic-list': {
    keyword: '起风了',
    total: 5,
    quality: 'FLAC',
        commands: [
      { name: '#qqm听序号', desc: '播放当前列表中的指定歌曲（会话内也可 #听序号）', example: '#qqm听1' },
      { name: '#qqm歌词 序号', desc: '查看指定歌曲的纯文本歌词', example: '#qqm歌词1' },
      { name: '#qqmMV 播放 序号', desc: '播放 / 下载该曲 MV（列表带 🎬 即是有 MV 的歌曲）', example: '#qqmMV 播放 1' },
      { name: '列表有效期', desc: '本列表约 10 分钟内有效，过期请重新搜索', example: '#qqm点歌 关键词' },
    ],
    // 头部那排"来源计数"（iOS 分段控件）与每行的来源色轨都靠这几个字段
    sourceLabel: 'QQ 音乐',
    sourceCounts: countSources(SONGS),
    hasExternal: true,
    songs: SONGS.map((s, i) => ({ ...withSource(s), index: i + 1, cover: '' })),
  },
  'qqmusic-hot': {
    title: 'QQ音乐热搜',
    subtitle: '实时热搜 · 可直接 #qqm点歌 关键词',
    total: 10,
        tip: '复制热搜词后发送 #qqm点歌 关键词 即可搜索',
    items: [
      { index: 1, word: '起风了', hot: '982万' },
      { index: 2, word: '七里香', hot: '865万' },
      { index: 3, word: '晴天', hot: '741万' },
      { index: 4, word: '稻香', hot: '620万' },
      { index: 5, word: '夜曲', hot: '588万' },
      { index: 6, word: '告白气球', hot: '512万' },
      { index: 7, word: '倒带', hot: '476万' },
      { index: 8, word: '一路向北', hot: '431万' },
      { index: 9, word: '青花瓷', hot: '398万' },
      { index: 10, word: '搁浅', hot: '365万' },
    ],
  },
  'qqmusic-lyric': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    songmid: '0039MnYb0qxYhV',
    lineCount: 16,
        tip: '已去除时间戳，纯文本歌词',
    lines: [
      '这一路上走走停停',
      '顺着少年漂流的痕迹',
      '迈出车站的前一刻',
      '竟有些犹豫',
      '',
      '不禁笑这近乡情怯',
      '仍无可避免',
      '而长野的天',
      '依旧那么暖',
      '风吹起了从前',
      '',
      '从前初识这世间',
      '万般流连',
      '看着天边似在眼前',
      '也甘愿赴汤蹈火去走它一遍',
      '如今走过这世间',
    ],
  },
  'qqmusic-settings': {
    title: 'QQ音乐设置',
    subtitle: '当前插件运行配置一览',
    loginOk: true,
    quality: 'FLAC',
    tip: '详细开关可在锅巴面板修改；付费曲需主人 #qqm登录',
    tiles: [
      { label: '点歌', value: '开', on: true },
      { label: '解析', value: '开', on: true },
      { label: '列表卡', value: '开', on: true },
      { label: '语音', value: '开', on: true },
      { label: '群文件', value: '开', on: true },
      { label: '降级', value: '开', on: true },
      { label: '一起听', value: '关', on: false },
    ],
    rows: [
      { k: '登录', v: '已绑定 · DemoUser' },
      { k: '适配器', v: 'QQBot (qqbot)' },
      { k: '主题', v: 'classic（浅色）' },
      { k: '音质', v: 'FLAC · 自动降级' },
      { k: '列表数', v: '10' },
      { k: '发送', v: '语音 开 / 文件 开 / 原生卡 关 / 自定义卡 关' },
    ],
    commands: [
      { name: '扫码登录', desc: '绑定 QQ 音乐账号获取付费曲权限', example: '#qqm登录' },
      { name: '状态卡片', desc: '查看当前插件运行状态', example: '#qqm状态' },
      { name: '换界面', desc: '切换卡片主题 / 深浅色', example: '#qqm界面 apple' },
      { name: '改 API', desc: '切换 qqmusic-api 地址', example: '#qqm api <地址>' },
      { name: '改音质', desc: '设置最高播放音质', example: '#qqm 音质 flac' },
      { name: '连通测试', desc: '测试 API 是否正常响应', example: '#qqm 测试' },
    ],
  },
  'qqmusic-status': {
    title: 'QQ音乐状态',
    subtitle: '账号 / 会员 / 音质',
    nickname: 'DemoUser',
    uin: '1234****',
    loginTypeText: '扫码登录',
    loggedIn: true,
    vipTitle: '绿钻豪华版',
    vipStateText: '生效中',
    vipExpireText: '到期：2026-12-31',
    musicQuality: 'FLAC',
    keyStatus: '正常（剩余 2 天）',
    avatarUrl: logoUrl,
    avatarIsPhoto: true,
    stats: [
      { label: '点歌', value: '开' },
      { label: '解析', value: '开' },
      { label: '降级', value: '开' },
    ],
    footer: 'QQMusic Plugin · 状态卡片',
  },
  'qqmusic-help': {
    version: 'v1.5.0',
    logo: logoUrl,
    statCommands: '40+',
    statQuality: 'FLAC',
    statMode: '全开',
        tip: '付费曲需主人扫码登录；指令统一 #qqm 前缀；#听序号 取自己最近一次列表。',
    sections: [
      {
        title: '点歌播放',
        tag: '全员',
        items: [
          { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
          { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
          { name: '一起听', desc: '把列表第 N 首加进群里的一起听', example: '#qqm一起听 1' },
        ],
      },
      {
        title: '主人管理',
        tag: 'Master',
        items: [
          { name: '查看配置', desc: 'API、开关、音质与发送方式', example: '#qqm设置' },
          { name: '切换界面', desc: '换一套卡片 UI / 深浅色', example: '#qqm界面' },
        ],
      },
    ],
  },
  'qqmusic-detail': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    duration: '05:25',
    payplay: false,
    showPay: false,
    qualityLabel: 'FLAC',
    source: 'QQ音乐',
    tip: '正在下载并发送…',
  },
  'qqmusic-comment': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    songmid: '0039MnYb0qxYhV',
    total: 4,
        tip: '热门评论按点赞排序',
    comments: [
      {
        nick: '听风的人',
        avatar: '',
        content: '愿你走出半生，归来仍是少年。',
        time: '2024-05-01',
        likes: '1.2万',
        hot: true,
      },
      { nick: '深夜食堂', avatar: '', content: '这首歌单曲循环了一整个夏天。', time: '2023-08-12', likes: '8623', hot: false },
      { nick: '路人甲', avatar: '', content: '前奏一响就知道是它。', time: '2023-03-04', likes: '4210', hot: false },
      { nick: '钢琴手', avatar: '', content: '钢琴版也很好听，推荐。', time: '2022-11-19', likes: '1908', hot: false },
    ],
  },
}

// —————————————————————— 主流程 ——————————————————————

const argv = process.argv.slice(2)
const flags = argv.filter((a) => a.startsWith('--'))
const words = argv.filter((a) => !a.startsWith('--'))
const onlyTheme = words[0] || ''
const onlyCard = words[1] || ''
const darkOnly = flags.includes('--dark')
const lightOnly = flags.includes('--light')
/** --time=dawn|day|dusk|night 强制某个时段；--times 四段全渲染（否则用真实时间） */
const forcedTime = (flags.find((f) => f.startsWith('--time=')) || '').split('=')[1] || ''
const allTimes = flags.includes('--times')
/** --bg=<本地路径或链接> 用自定义背景渲染（走与真机同一套解析，含远端抓取与缓存） */
const bgArg = (flags.find((f) => f.startsWith('--bg=')) || '').slice(5).trim()
/** 时段 → 用来喂给 resolveTheme 的假时间（纯为了稳定出图，不影响真机行为） */
const PERIOD_HOUR = { dawn: 6, day: 12, dusk: 18, night: 22 }

function periodDate(period) {
  const d = new Date()
  d.setHours(PERIOD_HOUR[period] ?? 12, 0, 0, 0)
  return d
}

async function main() {
  // 只重建总览页（不重新渲染，改完索引样式或想刷新清单时用）
  if (flags.includes('--index-only')) {
    writeIndex()
    return
  }
  const themeIds = listThemeIds().filter((id) => !onlyTheme || id === onlyTheme)
  if (!themeIds.length) throw new Error(`没有匹配的主题（可用: ${listThemeIds().join(', ') || '无'}）`)

  const cards = CARDS.filter((c) => !onlyCard || c === onlyCard)
  const done = []
  const failed = []
  const periods = allTimes ? Object.keys(PERIOD_HOUR) : forcedTime ? [forcedTime] : ['']

  // 自定义背景（可选）：解析一次，所有卡片共用
  let bg = null
  if (bgArg) {
    const { resolveBackground } = await import('../utils/background.js')
    bg = await resolveBackground({ uiBgEnable: true, uiBgValue: bgArg, uiBgCacheMin: 10 })
    if (!bg) {
      console.log(`⚠️ 背景解析失败（${bgArg}），按无背景渲染`)
    } else {
      console.log(`[preview] 背景: ${bg.source}/${bg.from} → ${bg.path}`)
    }
  }

  for (const id of themeIds) {
    const manifest = loadManifest(id) || {}
    const modes = []
    if (!darkOnly) modes.push('light')
    if (!lightOnly && manifest.dark === true) modes.push('dark')

    for (const mode of modes) {
      for (const period of periods) {
        const theme = resolveTheme(
          { uiTheme: id, uiDark: mode },
          period ? { now: periodDate(period) } : undefined
        )
        // 目录名：真实时段时不带后缀；强制/全时段/带背景时带上，便于对比
        const suffix =
          (mode === 'dark' ? '-dark' : '') + (period ? `-${period}` : '') + (bg ? '-bg' : '')
        const dirName = `${id}${suffix}`
        const dir = path.join(outRoot, dirName)
        fs.mkdirSync(dir, { recursive: true })

        for (const card of cards) {
          const data = samples[card]
          if (!data) {
            console.log(`SKIP ${dirName}/${card}（没有样例数据）`)
            continue
          }
          try {
            const { outFile, tpl } = renderHtmlFile(data, card, theme, { bgUrl: bg?.url || '' })
            const png = await screenshotDirect(outFile, {
              viewportWidth: viewportWidthOf(theme, card),
              pageBg: pageBgOf(theme),
            })
            const outPng = path.join(dir, `${card}.png`)
            fs.writeFileSync(outPng, png)
            const tag = tpl.fallback ? ` [回落到 ${tpl.from}]` : ''
            console.log(`OK   ${dirName}/${card} ${(png.length / 1024).toFixed(1)}KB${tag}`)
            done.push(`${dirName}/${card}`)
          } catch (err) {
            console.log(`FAIL ${dirName}/${card}: ${err.message}`)
            failed.push(`${dirName}/${card}`)
          }
        }
      }
    }
  }

  console.log(`\n完成 ${done.length} 张，失败 ${failed.length} 张`)
  console.log(`输出目录: ${outRoot}`)
  writeIndex()
  if (failed.length) process.exitCode = 1
}

/**
 * 总览页：扫描输出目录（不是只看本次渲染 —— 否则分几次跑会把先前的覆盖掉）
 */
function writeIndex() {
  try {
    const dirNames = fs
      .readdirSync(outRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    const groups = {}
    let total = 0
    for (const dirName of dirNames) {
      const pngs = fs
        .readdirSync(path.join(outRoot, dirName))
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.replace(/\.png$/, ''))
        .sort()
      if (!pngs.length) continue
      groups[dirName] = pngs
      total += pngs.length
    }
    const idx = path.join(outRoot, 'index.html')
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>卡片预览 · ${total} 张</title>
<style>
  body{margin:0;padding:28px;background:#111;color:#eee;
       font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei UI",sans-serif}
  h1{font-size:20px;margin:0 0 8px}
  h2{margin:28px 0 12px;font-size:16px;font-weight:600;color:#fff}
  .grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
  figure{margin:0;width:300px}
  figcaption{margin-top:6px;font-size:12px;color:#9aa}
  img{width:100%;height:auto;border-radius:8px;display:block;background:#222}
</style></head><body>
<h1>卡片预览（${total} 张 · ${Object.keys(groups).length} 组）</h1>
<p style="color:#9aa;margin:0">目录名 = 主题 [-dark] [-时段]；时段四组用于对比"底色随时段"的效果</p>
${Object.entries(groups)
  .map(
    ([dirName, cards]) => `<h2>${dirName}</h2>\n<div class="grid">
${cards
  .map(
    (c) =>
      `  <figure><img src="./${dirName}/${c}.png" alt="${c}" loading="lazy"><figcaption>${c}</figcaption></figure>`
  )
  .join('\n')}
</div>`
  )
  .join('\n')}
</body></html>`
    fs.writeFileSync(idx, html, 'utf8')
    console.log(`总览页: ${idx}`)
  } catch (err) {
    console.log(`总览页生成失败: ${err.message}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
