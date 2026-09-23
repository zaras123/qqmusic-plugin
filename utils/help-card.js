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
import { platformCanQrLogin, platformCanCookie, platformQrOf, platformCookieOf } from './platforms.js'
import { QUALITY_LABEL } from './quality.js'

/** 全部帮助条目；master: true = 仅主人渲染（与 rule 的 permission: 'master' 对应） */
const SECTIONS = [
  {
    title: '点歌播放',
    tag: '全员',
    items: [
      { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
      { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
      { name: '直接播放', desc: '搜索并立即播放第一条', example: '#qqm播放 晴天' },
      { name: '查看歌词', desc: '按歌名/mid 取歌词；点歌后 #qqm歌词1 取列表第 1 首歌词', example: '#qqm歌词 七里香' },
      { name: '热搜榜', desc: '查看 QQ 音乐热搜', example: '#qqm热搜' },
      { name: '一起听', desc: '把列表第 N 首加进群里的一起听（ICQQ / NapCat / SnowLuma）', example: '#qqm一起听 1' },
      { name: '一起听状态', desc: '查看本群一起听房间当前曲目', example: '#qqm一起听 状态' },
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
      { name: '插件更新', desc: 'git 拉取最新代码', example: '#qqm更新' },
      { name: '强制更新', desc: '丢弃本地改动同步远程', example: '#qqm强制更新' },
      { name: '更新日志', desc: '查看最近提交', example: '#qqm更新日志' },
    ],
  },
  {
    title: '智能解析',
    tag: '自动',
    items: [
      { name: '分享卡片', desc: '群内 QQ 音乐分享自动识别', example: '（发送音乐卡片）' },
      { name: '链接解析', desc: 'y.qq.com 链接自动取链播放', example: 'https://y.qq.com/…' },
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

/**
 * @param {object} [e] 消息事件；e.isMaster 为真时渲染主人相关条目
 */
export function buildHelpCardData(e) {
  const cfg = Config.getConfig('qqmusic') || {}
  const quality = (cfg.quality || 'flac').toUpperCase()
  const songOn = cfg.enableSongRequest !== false
  const resolveOn = cfg.enableResolve !== false
  const isMaster = e?.isMaster === true
  const sections = visibleSections(isMaster)

  const cmdCount = sections.reduce((n, s) => n + s.items.length, 0)

  return {
    version: displayVersion(cfg),
    logo: logoUrl,
    statCommands: `${cmdCount}+`,
    statQuality: quality,
    statMode: songOn && resolveOn ? '全开' : songOn ? '点歌' : resolveOn ? '解析' : '待机',
    apiHint: apiHintFor(),
    isMaster,
    tip: '付费曲需主人扫码登录；指令统一 #qqm 前缀；#听序号 取自己最近一次列表（同群，人多的群不会串）；分享 QQ 音乐卡片/链接可自动解析。',
    sections,
  }
}

/**
 * 2.0 帮助卡数据（**只在解锁时用**，见 apps/song.js 的 help）
 *
 * 与老卡的差别：
 *   · 第一段是**动态的多平台清单**（当前开着哪几家、各自的命令与免登录档位）
 *   · 头部统计换成"平台数 / 最高音质 / 运行模式"，让一眼看出 2.0 在跑
 *   · 其余段落直接复用老卡的分组（不重复维护两份文案）
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
    // classic 主题的 2.0 帮助卡把这一段渲染成**彩色平台条**（label + 品牌色 + 档位）
    platforms: plats.map((p) => ({ id: p.id, label: p.label, color: p.color, quality: p.quality })),
    items: plats.length
      ? [
          { name: '跨平台补歌', desc: 'QQ 结果尾部自动追加这些平台的可播曲（哪几家参与由锅巴决定）', example: '#qqm点歌 关键词' },
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
          { name: '没有开启外部平台', desc: '锅巴 → 音源平台 里打开后，这一段会列出各自的命令', example: '#qqm点歌 关键词' },
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
    items: credentialItems,
  }

  // 两段自定义段（多平台 / 平台凭据）也过一遍同一套身份过滤：以前第一段是直接塞进
  // sections 的，一旦给里面的条目标 master（扫码就是主人专属），标记会漏给成员。
  // 过完滤再丢掉空段 —— 成员看不到扫码那条时，"平台凭据"整段可能只剩粘贴一条（或彻底为空）
  const sections = [
    ...visibleSections(isMaster, [multiPlatform]),
    ...visibleSections(isMaster, [credentialSection]).filter((s) => s.items.length),
    ...visibleSections(isMaster),
  ]
  const cmdCount = sections.reduce((n, s) => n + s.items.length, 0)

  return {
    version: displayVersion(cfg),
    logo: logoUrl,
    title: '2.0 帮助',
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
    })),
    statPlatformsTotal: String(plats.length + 1), // 含 QQ 本体（老模板的 statPlatforms 仍是"外源家数"）
    platformsText: plats.length ? `${plats.length} 家` : '未启用',
    currentSource,
    /**
     * 是否展开全部条目
     *   false（默认）：每段最多 8 条 —— 51 条全铺开卡片会长到 3400px，
     *                  QQ 里会被压成一条看不清；压缩后约 1800px，手机上还能读。
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
 * 2.0 帮助的纯文本兜底（渲染失败时用）
 *
 * ⚠️ 只在解锁后才会被调用 —— 未解锁走的是老的那段文本，别把两段混起来。
 */
export function formatGuideText(e) {
  const cfg = Config.getConfig('qqmusic') || {}
  const plats = enabledPlatforms(cfg)
  const isMaster = e?.isMaster === true
  return [
    '【QQ音乐插件 2.0 帮助】',
    '— 点歌 —',
    '#qqm点歌 七里香        （QQ 曲库；列表尾部自动补其它平台的免费曲）',
    // 与卡片一致：教**最短写法**（动词可省），不再演示冗长的全称版
    ...plats.map((p) => `#qqm${p.short || p.label} 关键词`.padEnd(20) + `（只在 ${p.label} 搜，免登录 ${p.quality}）`),
    '#qqm听1 / #qqm播放 关键词 / #qqm歌词 关键词 / #qqm热搜 / #qqm平台',
    plats.length
      ? `不想每次都带平台：给自己设一个 #qqm源 ${plats[0].short || plats[0].label}（#qqm源 默认 切回 QQ${isMaster ? '；主人设的是全群默认' : ''}）`
      : '',
    '— 状态 —',
    isMaster ? '#qqm登录 / #qqm状态 / #qms / #qqm登出' : '#qqm状态 / #qms',
    ...(isMaster ? ['— 管理（主人）—', '#qqm设置 / #qqm 音质 flac / #qqm 测试'] : []),
    '— 解析 —',
    '分享 QQ 音乐卡片或 y.qq.com 链接自动解析',
  ]
    .filter(Boolean)
    .join('\n')
}
