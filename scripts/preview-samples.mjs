/**
 * 预览样例数据：每张卡片一份 data（**纯数据，不依赖 puppeteer / art-template**）
 *
 * 为什么单独拆成一个模块：
 *   预览夹具（这份样例）和模板会**各自漂移** —— 模板里新写了 `{{data.payInfo}}`，
 *   样例里却没有这个键，art-template 就把空值原样画出去（星云详情卡那颗"空胶囊"就是这么来的）。
 *   真机数据由 utils/card-data.js 构建、字段齐全，所以只有预览在骗人。
 *
 *   把漂移变成**构建期报错**的办法：test.mjs 逐卡片检查"模板用到的每个 data.X 字段，
 *   样例里都得有"。而 test.mjs 必须在没有 puppeteer 的环境里也能跑，
 *   所以本模块只允许 import node 内置模块，不许碰 utils/render.js。
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** logo 的 file:// 地址：样例里当头像/封面占位用（不联网） */
const logoUrl = pathToFileURL(
  path.resolve(__dirname, '..', 'resources', 'img', 'logo.png')
).href

/* 2.0 的**来源色标**：「多平台」主题的全部立意就是每首歌左边那条来源色轨 + 右边同色 chip。
 * 样例里清一色 QQ 绿，等于把主题最要紧的那一眼藏起来（这一版之前就是这样，真实预览里
 * 那条色轨与 chip 根本没被画出来过）。所以样例必须混着来：QQ / 网易云 / B站 / 汽水。 */
const SRC = {
  qq: { color: '#31c27c', label: 'QQ', short: 'QQ', tag: '' },
  // 短名照抄 utils/platforms.js 的 platformShort()：网易云是「网易」不是「网易云」。
  // 夹具与真机取的名字不一样，预览就不能当"发出去的那张图"看。
  netease: { color: '#c62f2f', label: '网易云', short: '网易', tag: '128k' },
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
 * 覆盖四种状态：已登录 / 匿名可用 / 未配置(只能粘贴→给 #qqm<平台>ck) /
 * 未配置(可扫码→给 #qqm<平台>登录)，外加一行带 unreliable 的告警文案 —— 这几种在真机上都会出现。
 * ⚠️ action 字段必须**照抄真机**（由 utils/card-data.js 的 nextActionOf 生成）：
 *    只有能扫码/能粘贴的平台才有值，YouTube 那种"卡的是出网代理"的必须是空串。 */
const PLATFORM_ROWS = [
  { name: 'qq', label: 'QQ 音乐', color: '#31c27c', kindText: '账号', ready: true, stateText: '已登录', canQr: true,
    quality: '无损 / Hi-Res（看会员）', sourceText: '', ownersCount: 0, action: '', unreliable: '', note: '',
    detail: '档位：无损 / Hi-Res（看会员）' },
  { name: 'netease', label: '网易云', color: '#c62f2f', kindText: '凭据', ready: true, stateText: '已登录', canQr: true,
    quality: '128k', sourceText: '手机号扫码', ownersCount: 1, action: '', unreliable: '', note: '',
    detail: '来源：手机号扫码 · 档位：128k' },
  { name: 'kuwo', label: '酷我', color: '#ffb500', kindText: '凭据', ready: false, stateText: '未配置', canQr: false,
    quality: '128k', sourceText: '', ownersCount: 0, action: '#qqm酷我ck', unreliable: '', note: '',
    detail: '档位：128k' },
  { name: 'kugou', label: '酷狗', color: '#0ea0e8', kindText: '凭据', ready: false, stateText: '未配置', canQr: true,
    quality: '128k', sourceText: '', ownersCount: 0, action: '#qqm酷狗登录', unreliable: '', note: '',
    detail: '档位：128k' },
  { name: 'bilibili', label: 'B站', color: '#fb7299', kindText: '匿名', ready: true, stateText: '匿名可用', canQr: false,
    quality: '192k', sourceText: '', ownersCount: 0, action: '', unreliable: '', note: '',
    detail: '档位：192k' },
  { name: 'youtube', label: 'YouTube', color: '#ff0033', kindText: '凭据', ready: false, stateText: '未配置', canQr: false,
    quality: '128k', sourceText: '', ownersCount: 0, action: '', // 卡的是出网代理，配 cookie 没用 → 没有"下一步命令"
    unreliable: '版权曲取链失败率偏高，当兜底用，别当主力', note: '', detail: '档位：128k' },
  { name: 'apple', label: 'Apple Music', color: '#fa2a55', kindText: '音源', ready: false, stateText: '未启用', canQr: false,
    quality: '256k', sourceText: '', ownersCount: 0, action: '#qqmamck', unreliable: '', note: '', detail: '档位：256k' },
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
  { id: 'qishui', short: '汽水', label: '汽水', color: '#00e0c6', quality: '256k', needsCredential: true },
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
      // ⚠️ 照抄真机：由 "有 action 的行" + 注册表拼出 —— 酷我/Apple 只能粘贴、酷狗能扫码、YouTube 没通道
      '还没配的：酷我 私聊 #qqm酷我ck；酷狗 扫码 #qqm酷狗登录；Apple Music 私聊 #qqmamck',
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
      // ⚠️ 凭据渠道必须**独立成段**（第 0 段在四套主题里都被当"平台彩条"渲染，items 是死的）
      {
        title: '平台凭据',
        tag: '3 家可扫 / 5 家可粘',
        items: [
          { name: '扫码登录（主人）', desc: '用手机 App 扫，凭据按你的槽位存（想让全站共用 → 开「一律走主人账号」）。支持：网易云 / 酷狗 / 汽水', example: '#qqm网易登录' },
          { name: '粘贴 cookie（私聊）', desc: '不能扫码、或扫码被上游风控挡住时走这条（凭据按人存，只对你自己生效）。支持：网易云 / 酷我 / 酷狗 / 汽水 / Apple Music', example: '#qqm网易ck <cookie>' },
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
    // 品牌标 + 页脚那行提示：真值来自 logoUrl / apiHintFor()。没配 API 时提示就是空串 ——
    // 卡片里**永远不能出现 API 地址**，夹具同样不给。
    logo: logoUrl,
    apiHint: '',
    sourceLabel: 'QQ 音乐',
    sourceCounts: countSources(SONGS),
    hasExternal: true,
    // 只有「歌手搜索 / 专辑搜索」进来才有值，关键词搜索是空串
    singerInfo: '',
    albumInfo: '',
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
    // 版本徽标是 help 卡的**大标题**（apple 那张卡的设计）。
    // 真值来自 utils/update.js 的 displayVersion() —— 2026-09-24 起**发版后一律显示真实包版本**
    // （不再按闸门冻结成 1.x），所以这里跟着 package.json 的号手动跟。
    // 夹具只能写个字面量（本模块不许 import utils/，只许 node 内置）。
    version: 'v2.0.3',
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
    // 详情卡的字段照抄 utils/card-data.js 的 buildDetailCardData() 输出。
    //
    // 这里画的是**外源曲**那一版：2.0 的立意就是"这首歌来自哪家"，而 QQ 绿正好等于
    // `--src` 的兜底色 —— 用 QQ 曲预览，等于没验证"来源色真的从数据流进了样式"这条管道
    // （上一版就是这样：chip 里的 sourceShort 压根没给，预览画出一颗空胶囊，真机却好好的）。
    // QQ 曲版只是把下面四个字段换成 '#31c27c' / 'QQ' / false / 'QQ音乐'；另外 payplay 为真时
    // 画金色 payInfo pill，而外源曲一律免费，所以这两个分支一张预览里只能看到一边。
    title: '起风了',
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    songmid: '0039MnYb0qxYhV',
    duration: '05:25',
    qualityLabel: '128k',
    payplay: false,
    showPay: true,
    // 卡片上不再用 emoji（宿主机没 emoji 字体会变方框）：只给文字 + 图标名，
    // 图标由 resources/shared/theme-icons.css 用遮罩画
    payInfo: '免费',
    payIcon: 'spark',
    urlStatus: '有播放链接',
    urlIcon: 'check',
    source: '网易云 128k',
    sourceId: 'netease',
    sourceColor: SRC.netease.color,
    sourceShort: SRC.netease.short,
    sourceIsExternal: true,
    mvVid: '',
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

export { SRC, SONGS, PLATFORM_ROWS, GUIDE_PLATS, samples, logoUrl, withSource, countSources }
