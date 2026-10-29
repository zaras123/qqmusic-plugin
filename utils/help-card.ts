/**
 * 帮助卡数据（按发送者身份动态渲染）
 *
 * 主人（e.isMaster）可见全部：登录/登出等 master 指令 + 「主人管理」整段；
 * 其他人只看到全员可用的条目，标了 master 的条目与整段直接不渲染，
 * 顶部「指令能力」数字也随之按实际渲染的条目数变化。
 */
import Config from '../components/Config.js'
import { apiHintFor } from './privacy.js'
// 版本徽标走 displayVersion：解锁显示 2.0 专属版，未解锁与 2.0 之前逐字一致
import { displayVersion } from './update.js'
import { logoUrl } from './path.js'
import { enabledPlatforms } from './v2.js'
// 凭据通道（能扫码 / 只能粘贴）的事实来自注册表 —— 帮助卡里不许再手抄一份平台名单
import { platformCanQrLogin, platformCanCookie, platformQrOf, platformCookieOf, platformAuthTag } from './platforms.js'
import { QUALITY_LABEL } from './quality.js'
import { LISTENING_HELP_SECTION, LISTENING_TIP } from './listening.js'

/** 全部帮助条目；master: true = 仅主人渲染（与 rule 的 permission: 'master' 对应） */
const SECTIONS = [
  {
    title: '演出票务',
    tag: '档案',
    items: [
      { name: '未来演唱会', desc: '本地缺失时自动补全实时演出并保存', example: '#qqm演唱会' },
      { name: '近期开演', desc: '七天内开演的演唱会', example: '#qqm近期演唱会' },
      { name: '历史演出', desc: '查询已收录的往期演出', example: '#qqm往期演唱会' },
      { name: '筛选演出', desc: '直接写艺人、城市或关键词，逗号空格可叠加', example: '#qqm演唱会 宋雨琦' },
      { name: '演出详情', desc: '艺人、地点、场次、票档和简介提及曲目', example: '#qqm演出详情1' },
      { name: '演出翻页', desc: '保留当前筛选；序号按当前页选择', example: '#qqm演出下一页' },
      { name: '票务帮助', desc: '查询写法、城市与分类入口', example: '#qqm演出帮助' },
      { name: '同步档案', desc: '城市或艺人名都行：城市按城市收录，艺人名自动检索', example: '#qqm演出同步 北京', master: true },
    ],
  },
  {
    title: '点歌播放',
    tag: '全员',
    items: [
      { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
      { name: '渠道标识', desc: '列表同时保留本地库、QQ音乐官方和已启用的填充渠道', example: '#qqm点歌 晴天' },
      { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
      { name: '直接播放', desc: '搜索并立即播放第一条', example: '#qqm播放 晴天' },
      { name: '查看歌词', desc: '按歌名/mid 取歌词；点歌后 #qqm歌词1 取列表第 1 首歌词', example: '#qqm歌词 七里香' },
      { name: '热搜榜', desc: '查看 QQ 音乐热搜', example: '#qqm热搜' },
      { name: '副歌试听', desc: '只发副歌片段（30 秒左右），先听听好不好听', example: '#qqm试听 晴天' },
      { name: '歌词海报', desc: '副歌几句 + 封面排成一张分享图；点歌后可用序号', example: '#qqm海报 晴天' },
      { name: '一起听', desc: '把列表第 N 首加进群里的一起听（ICQQ / NapCat / SnowLuma）', example: '#qqm一起听 1' },
      { name: '一起听状态', desc: '查看本群一起听房间当前曲目', example: '#qqm一起听 状态' },
      { name: '我的本地点播统计', desc: '按成功发歌与歌曲时长估算，不代表实际收听或平台入账', example: '#qqm听歌' },
      { name: '听歌状态 / 官方时长', desc: '分别查看本地点播记录、本人 QQ 音乐平台进度（只读，需本人登录）', example: '#qqm听歌状态' },
      { name: '本群听歌榜', desc: '按成功发歌的估算时长排行，可加「今日 / 本周」', example: '#qqm听歌榜 本周' },
      { name: '勋章进度', desc: '平台侧的听歌时长与勋章任务进度（只读，按本人账号）', example: '#qqm勋章' },
    ],
  },
  {
    title: '发现音乐',
    tag: '探索',
    items: [
      { name: '排行榜', desc: '查看各大榜单歌曲', example: '#qqm排行 飙升' },
      { name: '推荐歌单', desc: '热门推荐歌单列表', example: '#qqm推荐' },
      { name: '打开推荐歌单', desc: '查看第 N 个推荐歌单的歌曲', example: '#qqm推荐听1' },
      { name: '随机推荐', desc: '随机推荐一首歌并播放', example: '#qqm来首歌' },
      { name: '个性电台', desc: '根据口味推荐 5 首', example: '#qqm电台' },
      { name: '每日推荐', desc: '每日推荐歌曲（需登录）', example: '#qqm日推' },
      { name: '我的收藏', desc: '查看收藏歌曲（需登录）', example: '#qqm收藏' },
      { name: '歌手搜索', desc: '搜索歌手并展示热门歌曲', example: '#qqm歌手 周杰伦' },
      { name: '专辑搜索', desc: '搜索专辑并展示曲目列表', example: '#qqm专辑 叶惠美' },
      { name: '歌单搜索', desc: '搜索歌单并展示歌曲', example: '#qqm歌单 华语流行' },
      { name: '歌曲评论', desc: '查看歌曲热门评论', example: '#qqm评论 晴天' },
      { name: '新歌速递', desc: '最新热门歌曲（#qqm新歌 序号 选地区）', example: '#qqm新歌' },
      { name: 'MV 搜索/播放/下载', desc: '点歌后 #qqmMV 播放/下载 直接播；#qqmMV 搜索 词 搜 MV', example: '#qqmMV' },
    ],
  },
  {
    title: '账号状态',
    tag: '登录',
    items: [
      { name: '扫码登录', desc: '主人扫码登录（网页码）', example: '#qqm登录', master: true },
      { name: '微信登录', desc: '用 QQ音乐 App 扫码，App 内用微信账号登录', example: '#qqm登录微信', master: true },
      { name: 'App 扫码', desc: '用 QQ音乐 App 扫码（QQ 账号用）', example: '#qqm登录qq', master: true },
      { name: '状态卡片', desc: '账号 / 会员 / 音质 可视化', example: '#qqm状态' },
      { name: '快捷状态', desc: '状态卡短指令', example: '#qms' },
      { name: '登出解绑', desc: '清除登录态（主人）', example: '#qqm登出', master: true },
    ],
  },
  LISTENING_HELP_SECTION,
  {
    title: '账号操作',
    tag: '主人',
    master: true,
    // 全部要带「确认」才执行 —— desc 里对用户明说，避免误触账号数据
    items: [
      { name: '新建 / 删除歌单', desc: '末尾带「确认」才执行', example: '#qqm歌单新建 我的歌单 确认' },
      { name: '歌单加歌 / 删歌', desc: '歌曲用 songId:type，多首逗号分隔', example: '#qqm歌单加歌 123 456:1 确认' },
      { name: '收藏 / 取消喜欢', desc: '收藏进「我喜欢」或移出', example: '#qqm喜欢歌曲 123:1 确认' },
      { name: '收藏 / 取消收藏歌单', desc: '收藏外部歌单', example: '#qqm收藏歌单 7011264340 确认' },
      { name: '收藏 / 取消收藏专辑', desc: '收藏外部专辑', example: '#qqm收藏专辑 9001 确认' },
      { name: '不喜欢管理', desc: '歌曲 / 歌手 / 风格；可单项或清空', example: '#qqm不喜欢 歌曲 123 确认' },
      { name: '发布 / 删除评论', desc: '支持歌曲 / 专辑 / 歌单 / 排行 / MV', example: '#qqm发评论 歌曲 123 好听 确认' },
      { name: '音响力点赞 / 隐私', desc: '好友听歌榜点赞、取消与隐私开关', example: '#qqm音响力点赞 10001 确认' },
      { name: '私信操作', desc: '发送、删除会话 / 消息、清空、设置、已读、卡片操作', example: '#qqm私信发送 10001 1 你好 确认' },
      { name: '账号操作帮助', desc: '列出全部账号操作命令（仅主人）', example: '#qqm账号操作' },
    ],
  },
  {
    title: '订阅与定时',
    tag: '计划',
    // 添加/删除限主人（整群推送与整群定时，不能谁都能加）；查看对全员开放
    items: [
      { name: '歌手订阅', desc: '新歌进歌手歌曲列表时推到本群（约每 6 小时查一次）', example: '#qqm订阅 周杰伦', master: true },
      { name: '订阅列表', desc: '查看本群订阅了哪些歌手', example: '#qqm订阅列表' },
      { name: '退订', desc: '按序号或歌手名退订', example: '#qqm退订 1', master: true },
      { name: '定时点歌', desc: '每天到点把这首歌发进群（认 8:30 / 8点30 / 8点半）', example: '#qqm定时 8:30 晴天', master: true },
      { name: '定时列表', desc: '查看本群的定时点歌', example: '#qqm定时列表' },
      { name: '取消定时', desc: '按序号删除一条定时', example: '#qqm取消定时 1', master: true },
    ],
  },
  {
    title: '主人管理',
    tag: 'Master',
    master: true,
    items: [
      { name: '查看配置', desc: 'API、开关、音质与发送方式', example: '#qqm设置' },
      { name: '设置 API', desc: '修改接口地址', example: '#qqm api <地址>' },
      { name: '切换音质', desc: '128 / 320 / flac / hires …', example: '#qqm 音质 flac' },
      { name: '功能开关', desc: '开启或关闭点歌、解析', example: '#qqm 开启点歌' },
      { name: '默认点歌', desc: '接管不加前缀的「#点歌」（默认关）', example: '#qqm 默认点歌 开' },
      { name: '补充曲', desc: '其它平台免费曲补进列表（默认开）', example: '#qqm 补充曲 关' },
      {
        name: '一起听探测',
        desc: '探测一起听参数；加「写入」= 主动开房探测（会在本群真的建房间，探到即自动写配置）',
        example: '#qqm一起听 探测 写入',
      },
      { name: '切换界面', desc: '换一套卡片 UI / 深浅色 / 热重载模板', example: '#qqm界面' },
      { name: '连通测试', desc: '探测 API 是否可用', example: '#qqm 测试' },
      { name: '插件更新', desc: 'git / npm 更新到最新版本', example: '#qqm更新' },
      { name: '强制更新', desc: 'git 丢弃本地改动；npm 更新 latest', example: '#qqm强制更新' },
      { name: '更新日志', desc: '查看提交日志或 npm 版本状态', example: '#qqm更新日志' },
    ],
  },
  {
    title: '智能解析',
    tag: '自动',
    items: [
      { name: '分享卡片', desc: '群内 QQ 音乐分享自动识别', example: '（发送音乐卡片）' },
      { name: '链接解析', desc: 'QQ音乐、Spotify、Apple Music 链接自动匹配播放', example: '粘贴分享链接' },
    ],
  },
]

/** 按身份筛出可见的段与条目（老帮助卡与 2.0 帮助卡**共用**，避免两处各筛一遍走样） */
function visibleSections(isMaster, base = SECTIONS) {
  return base
    .filter((s) => isMaster || !s.master)
    .map(({ master, items, ...section }) => ({
      ...section,
      items: items
        .filter((it) => isMaster || !it.master)
        .map(({ master: _m, ...item }) => item), // 不把内部标记带进模板
    }))
    .filter((s) => s.items.length > 0)
}


/** 主卡只列常用操作和分类入口；完整文案由各分类卡复用。 */
const HELP_CATEGORIES = [
  { key: '点歌', name: '点歌播放', desc: '选歌、歌词、试听与海报', titles: ['点歌播放'] },
  { key: '发现', name: '发现音乐', desc: '榜单、推荐、歌手与歌单', titles: ['发现音乐'] },
  { key: '平台', name: '平台音源', desc: '各平台点歌与音源切换', titles: ['多平台音源'] },
  { key: '登录', name: '登录与状态', desc: '扫码、私聊凭据与账号状态', titles: ['账号状态', '平台凭据'] },
  { key: '解析', name: '链接解析', desc: '音乐卡片与跨平台链接', titles: ['智能解析'] },
  { key: '订阅', name: '订阅与定时', desc: '歌手新歌订阅、定时点歌', titles: ['订阅与定时'] },
  { key: '演出', name: '演出票务', desc: '演唱会查询、筛选与详情', titles: ['演出票务'] },
  { key: '统计', name: '听歌统计', desc: '本地听歌榜与平台勋章进度', titles: ['点歌播放'] },
  { key: '一起听', name: '群里一起听', desc: '添加曲目与查看房间状态', titles: ['点歌播放'] },
  { key: '刷歌', name: '刷歌与每日计划', desc: '单次任务、每日计划与状态', titles: [LISTENING_HELP_SECTION.title], master: true },
  { key: '账号', name: '账号操作', desc: '歌单、收藏与评论管理', titles: ['账号操作'], master: true },
  { key: '管理', name: '插件管理', desc: '音质、功能开关、界面与更新', titles: ['主人管理'], master: true },
]

// 已有专用处理器：刷歌、账号、演出；这里仅注册其余分类，避免同一条命令重复回复。
export const RE_CATEGORY_HELP = /^#?(?:[qQ]{2}[mM]|[qQ]{2}音乐)\s*(点歌|发现|平台|登录|解析|订阅|统计|一起听|管理)帮助$/i

function primarySections(isMaster) {
  const main = { title: '常用功能', tag: '快速开始', items: [
    { name: '搜索点歌', desc: '搜索后按序号选歌', example: '#qqm点歌 晴天' },
    { name: '选择曲目', desc: '播放自己最近一次列表第 1 首', example: '#qqm听1' },
    { name: '直接播放', desc: '搜索并播放第一条', example: '#qqm播放 七里香' },
    { name: '查看歌词', desc: '歌名或点歌列表序号', example: '#qqm歌词 晴天' },
    { name: '音乐解析', desc: '分享卡片、QQ / Spotify / Apple 链接', example: '直接发送音乐分享链接' },
    { name: '账号状态', desc: '查看登录、会员与音质', example: '#qqm状态' },
  ] }
  const entry = c => ({ name: c.name, desc: c.desc, example: '#qqm' + c.key + '帮助' })
  return [main,
    { title: '音乐与平台帮助', tag: '分类卡片', items: HELP_CATEGORIES.slice(0, 5).map(entry) },
    { title: '更多功能帮助', tag: '按需查看', items: HELP_CATEGORIES.slice(5, 9).map(entry) },
    ...(isMaster ? [{ title: '主人功能帮助', tag: '仅主人', items: HELP_CATEGORIES.slice(9).map(entry) }] : []),
  ]
}

export function formatHelpCardText(data) {
  return ['【' + (data.title || 'QQ音乐插件帮助') + '】', ...data.sections.flatMap(s =>
    ['— ' + s.title + ' —', ...s.items.map(i => i.name + '：' + i.example + '\n' + i.desc)]), data.tip].filter(Boolean).join('\n\n')
}

export function buildCategoryHelpCardData(e, key) {
  const category = HELP_CATEGORIES.find(c => c.key === key)
  if (!category) return null
  const base = buildHelpCardData(e)
  const all = ['平台', '登录'].includes(key) ? buildGuideCardData(e, { full: true }).sections : visibleSections(e?.isMaster === true)
  let sections = category.master && !e?.isMaster ? [] : all.filter(s => category.titles.includes(s.title))
  if (key === '统计') sections = sections.map(s => ({ ...s, title: '统计与进度', items: s.items.filter(i => /统计|听歌榜|勋章/.test(i.name)) }))
  if (key === '一起听') sections = sections.map(s => ({ ...s, title: '一起听', items: s.items.filter(i => /一起听/.test(i.name)) }))
  return { ...base, title: key === '刷歌' ? '刷歌帮助' : category.name + '帮助', detail: true, subtitle: category.desc, sections,
    statCommands: String(sections.reduce((n, s) => n + s.items.length, 0)),
    tip: key === '刷歌' ? LISTENING_TIP : '返回主菜单：#qqm帮助；这里只显示当前身份可用的命令。',
  }
}

/**
 * @param {object} [e] 消息事件；e.isMaster 为真时渲染主人相关条目
 */
export function buildHelpCardData(e, { full = false } = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  const quality = (cfg.quality || 'flac').toUpperCase()
  const songOn = cfg.enableSongRequest !== false
  const resolveOn = cfg.enableResolve !== false
  const isMaster = e?.isMaster === true
  const sections = full ? visibleSections(isMaster) : primarySections(isMaster)

  const cmdCount = sections.reduce((n, s) => n + s.items.length, 0)

  return {
    title: 'QQ音乐帮助',
    subtitle: '常用功能 · 分类帮助',
    version: displayVersion(cfg),
    logo: logoUrl,
    statCommands: `${cmdCount}+`,
    statQuality: quality,
    statMode: songOn && resolveOn ? '全开' : songOn ? '点歌' : resolveOn ? '解析' : '待机',
    apiHint: apiHintFor(),
    isMaster,
    tip: '列表保留本地库、官方与填充渠道。更多用法发送对应的 #qqm分类帮助；主人可在锅巴 / WebUI 关闭本地曲库。',
    sections,
  }
}

/**
 * 2.0 帮助卡数据（**只在解锁时用**，见 apps/song.js 的 help）
 *
 * 与老卡的差别：
 *   · 第一段是**动态的多平台清单**（当前开着哪几家、各自的命令与免登录档位）
 *   · 头部统计换成"平台数 / 最高音质 / 运行模式"，让一眼看出 2.0 在跑
 *   · 默认只放主要功能和分类入口；full=true 保留完整分组清单
 */
export function buildGuideCardData(e, { currentSource = '', full = false } = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  const isMaster = e?.isMaster === true
  const plats = enabledPlatforms(cfg)
  // 凭据通道：这家能扫码吗、只能粘贴吗 —— 全按注册表算（别再手抄"网易云/酷狗/汽水"）
  const qrPlats = plats.filter((p) => platformCanQrLogin(p.id))
  const ckPlats = plats.filter((p) => platformCanCookie(p.id))
  // "自动" 别再 toUpperCase 成 "AUTO"（用户看到的应该是一个看得懂的档位）
  const q = String(cfg.quality || 'auto').toLowerCase()
  const quality = q === 'auto' || !q ? '自动' : QUALITY_LABEL[q] || q.toUpperCase()
  const songOn = cfg.enableSongRequest !== false
  const resolveOn = cfg.enableResolve !== false

  const multiPlatform = {
    title: '多平台音源',
    tag: plats.length ? `${plats.length} 家` : '未启用',
    /**
     * classic/apple 主题的 2.0 帮助卡把这一段渲染成**彩色平台条**
     * （label + 品牌色 + 档位 + 凭据小标）
     *
     * `authTag` 回答的正是用户会问的那句"哪几家能扫码、哪几家不行"——
     * 值是 `platformAuthTag()` 算出来的（可扫码 / 仅粘贴 / 免凭据），
     * 别再在模板或文案里手抄平台名单（抄一次漏一次，kugou 就漏过）。
     */
    platforms: plats.map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
      quality: p.quality,
      ...platformAuthTag(p.id),
    })),
    items: plats.length
      ? [
          { name: '跨平台补歌', desc: 'QQ 结果尾部自动追加这些平台的可播曲（哪几家参与由 Karin WebUI 决定）', example: '#qqm点歌 关键词' },
          ...plats.map((p) => ({
            name: `${p.label} 点歌 / 播放`,
            desc: `只在 ${p.label} 里搜（免登录 ${p.quality}）`,
            // 给**最短写法**：动词可以省（平台名 + 空格 + 关键词）
            example: `#qqm${p.short || p.label} 关键词`,
          })),
          { name: '当前音源', desc: '设一次就好：之后 #qqm点歌 默认走它（切回 QQ：#qqm源 默认）', example: '#qqm源 网易' },
          { name: '平台清单', desc: '列出现在开着的平台与最短写法', example: '#qqm平台' },
          { name: '平台登录状态', desc: '各家配没配、什么来源、下一步该做什么（一张卡看全）', example: '#qqm平台状态' },
        ]
      : [
          { name: '没有开启外部平台', desc: 'Karin WebUI → 音源平台 里打开后，这一段会列出各自的命令', example: '#qqm点歌 关键词' },
        ],
  }

  /**
   * 凭据通道**必须自己成段**，不能塞进「多平台音源」那段的 items 里 ——
   * 第 0 段在所有主题里都被当成"平台彩条"渲染（classic/apple/星云/多平台 都是
   * `{{if index === 0}}` 走平台清单、`{{else}}` 才渲染 items），塞进去等于**四个主题全看不见**：
   * 最难的那一步（配凭据）恰恰在帮助卡上隐身。
   *
   * 两条通道：能扫的列扫码，能粘贴的列粘贴（两种都有的平台两条都出现）。
   * 扫码限主人（rule 上就是 permission: master），所以条目标 master 只给主人看；
   * 粘贴反过来 —— 它必须**私聊**发，成员也能配自己那份。
   */
  const credentialItems = [
    ...(qrPlats.length
      ? [
          {
            name: '扫码登录（主人）',
            master: true,
            desc: `用手机 App 扫，凭据按你的槽位存（想让全站共用 → 开「一律走主人账号」）。支持：${qrPlats.map((p) => p.label).join(' / ')}`,
            example: platformQrOf(qrPlats[0].id).command,
          },
        ]
      : []),
    ...(ckPlats.length
      ? [
          {
            name: '粘贴 cookie（私聊）',
            desc: `不能扫码、或扫码被上游风控挡住时走这条（凭据按人存，只对你自己生效）。支持：${ckPlats.map((p) => p.label).join(' / ')}`,
            example: `${platformCookieOf(ckPlats[0].id).command} <cookie>`,
          },
        ]
      : []),
  ]
  const credentialSection = {
    title: '平台凭据',
    // tag 由注册表计数拼：几家的凭据是"扫出来的"、几家只能"粘"
    tag: [qrPlats.length ? `${qrPlats.length} 家可扫` : '', ckPlats.length ? `${ckPlats.length} 家可粘` : '']
      .filter(Boolean)
      .join(' / '),
    /**
     * 这一段在**两列网格**的主题（apple）里横跨整行渲染。
     *
     * 原因是这段的 desc 和其它段不是一个量级：别段是"按关键词搜索并展示列表"这种**短语**，
     * 这两条却是**成句的操作说明**（凭据存哪、怎么全站共用、谁能看见）。
     * 半列只有 269px、一行连 12 个字都放不下，截断掉就正好把最关键的半句藏了
     * （2026-09-30 用户截图："帮助渲染不全"）。
     * 标记只对用网格的主题有意义；classic / 星云 / 多平台的条目本来就一行一条，无影响。
     */
    wide: true,
    items: credentialItems,
  }

  // 两段自定义段（多平台 / 平台凭据）也过一遍同一套身份过滤：以前第一段是直接塞进
  // sections 的，一旦给里面的条目标 master（扫码就是主人专属），标记会漏给成员。
  // 过完滤再丢掉空段 —— 成员看不到扫码那条时，"平台凭据"整段可能只剩粘贴一条（或彻底为空）
  const sections = [
    ...visibleSections(isMaster, [multiPlatform]),
    ...(full ? [...visibleSections(isMaster, [credentialSection]), ...visibleSections(isMaster)] : primarySections(isMaster)),
  ]
  const cmdCount = sections.reduce((n, s) => n + s.items.length, 0)

  return {
    version: displayVersion(cfg),
    logo: logoUrl,
    title: 'QQ音乐帮助',
    subtitle: plats.length ? `${plats.length} 家音源 · 点歌 / 解析 / 卡片` : '点歌 / 解析 / 卡片',
    /**
     * 音源清单（「多平台」主题的帮助卡"一行一个平台"用它）
     * ⚠️ 与 `sections[0].platforms` 是同一份数据的两种形状：老主题（classic/apple）
     * 吃的是 sections 里的那个数组，这里单独给一份带 needsCredential/short 的，
     * 免得为了新主题去改老模板的取值路径。
     */
    sources: plats.map((p) => ({
      id: p.id,
      label: p.label,
      short: p.short || p.label,
      color: p.color,
      quality: p.quality,
      needsCredential: p.needsCredential === true,
      // 凭据小标（可扫码 / 仅粘贴 / 免凭据）—— 与上面 platforms[] 同一份事实
      ...platformAuthTag(p.id),
    })),
    statPlatformsTotal: String(plats.length + 1), // 含 QQ 本体（老模板的 statPlatforms 仍是"外源家数"）
    platformsText: plats.length ? `${plats.length} 家` : '未启用',
    currentSource,
    /**
     * 是否展开全部条目
     *   false（默认）：主要功能 + 分类帮助目录，每组不超过 6 个入口。
     *   true（`#qqm帮助 全部`）：完整清单，给需要"查手册"的人。
     */
    full: full === true,
    statCommands: `${cmdCount}+`,
    statQuality: quality,
    statPlatforms: String(plats.length),
    statMode: songOn && resolveOn ? '全开' : songOn ? '点歌' : resolveOn ? '解析' : '待机',
    apiHint: apiHintFor(),
    isMaster,
    tip: '外源曲免登录可直接播（档位看标签）；QQ 音乐付费曲仍需主人扫码登录。',
    sections,
  }
}

/**
 * 账号写操作专用卡片。
 *
 * 复用 2.0 guide 模板（四套主题都已具备），只把第一段从"多平台音源"切换成
 * "账号操作"：模板靠 `kind === 'manage'` 跳过平台彩条与统计栏。
 *
 * 为什么不新增一个 card 名：`qqmusic-guide` 的 data 形状本来就是
 * `sections[] / items[]`，账号操作正好是同一类内容；复用可以少维护 4 份模板。
 */
export function buildManageCardData(e = null) {
  const base = buildGuideCardData(e, { full: true })
  const accountSection = visibleSections(e?.isMaster === true).find((s) => s.title === '账号操作')
  return {
    ...base,
    kind: 'manage',
    title: '账号操作',
    subtitle: '24 个接口 · 末尾带「确认」才执行',
    sources: [],
    sections: accountSection ? [accountSection] : [],
    tip: '仅主人可用；按主人账号执行。未带「确认」时只回用法，不会调用 API。这些操作会真实改动 QQ 音乐账号数据，请确认后再发。',
  }
}

/**
 * 2.0 帮助的纯文本兜底（渲染失败时用）
 *
 * ⚠️ 只在解锁后才会被调用 —— 未解锁走的是老的那段文本，别把两段混起来。
 */
export function formatGuideText(e) {
  return formatHelpCardText(buildGuideCardData(e))
}

/** Shared help template, filtered to this task's commands. */
export function buildListeningHelpCardData(e) {
  return buildCategoryHelpCardData(e, '刷歌')
}
