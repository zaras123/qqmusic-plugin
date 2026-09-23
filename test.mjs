// Miao-Yunzai 插件功能测试脚本
//
// 顺序有讲究：**先做全量语法检查，再 import 业务模块**。
// 起因（2026-09-20）：card-data.js 里两条语句被粘到同一行（模板字符串后紧跟 const），
// V8 报 `Unexpected token 'const'`；而本测试并不直接 import card-data.js，
// 路由 / 纯函数 / check-scope 全部照常通过 —— 直到用户点歌时才炸。
// 静态 import 会被提前求值，语法错会直接崩掉整个测试文件、什么信息都看不到，
// 所以业务模块改成动态 import，让语法检查先跑。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

/** 递归收集插件自身的 js/mjs（跳过 node_modules / .git / temp） */
function collectJsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'temp') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collectJsFiles(p, out)
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

console.log('=== 语法检查（所有 js/mjs 能否解析）===\n')
let syntaxBad = 0
for (const f of collectJsFiles(pluginRoot)) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (err) {
    syntaxBad++
    const msg = String(err.stderr || err.message)
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 3)
      .join('\n    ')
    console.log(`❌ ${path.relative(pluginRoot, f)}\n    ${msg}`)
  }
}
if (syntaxBad) {
  console.log(`\n❌ ${syntaxBad} 个文件语法错误，后续测试无意义，直接退出`)
  process.exit(1)
}
console.log(`✅ ${collectJsFiles(pluginRoot).length} 个文件全部通过\n`)

import { loadPluginBase } from './utils/plugin-base.js'
await loadPluginBase()

const { qqmusicChart } = await import('./apps/chart.js')
const { qqmusicExplore } = await import('./apps/explore.js')
const { qqmusicLogin } = await import('./apps/login.js')
const { qqmusicResolve } = await import('./apps/resolve.js')
const { qqmusicSong } = await import('./apps/song.js')
const { qqmusicTogether } = await import('./apps/together.js')
const { qqmusicAdmin } = await import('./apps/admin.js')

console.log('=== QQ音乐插件功能测试 ===\n')

const modules = [
  { name: '排行榜/推荐/电台', class: qqmusicChart },
  { name: '歌手/专辑/歌单/评论', class: qqmusicExplore },
  { name: '扫码登录', class: qqmusicLogin },
  { name: '解析', class: qqmusicResolve },
  { name: '点歌', class: qqmusicSong },
  { name: '一起听', class: qqmusicTogether },
  { name: '管理', class: qqmusicAdmin },
]

let allPassed = true
/** 实例化后的规则总表：{ plugin, reg(RegExp), fnc, permission } */
const allRules = []

for (const mod of modules) {
  try {
    const instance = new mod.class()
    console.log(`✅ ${mod.name}: ${instance.name} (priority: ${instance.priority})`)
    for (const r of instance.rule || []) {
      allRules.push({
        plugin: mod.name,
        fnc: r.fnc,
        permission: r.permission || '',
        re: r.reg instanceof RegExp ? r.reg : new RegExp(r.reg),
      })
    }
  } catch (err) {
    console.error(`❌ ${mod.name}: ${err.message}`)
    allPassed = false
  }
}
console.log(`\n规则总数: ${allRules.length}`)

// ──────────── 命令路由测试（直接跑真实规则，不手抄正则，避免与实现漂移）────────────
console.log('\n=== 命令路由测试 ===\n')

/** [命令, 期望命中的 fnc（null=不应被任何规则匹配）] */
const cases = [
  // 点歌 / 选曲
  // 点歌 + 播放合成一条规则（onSongCmd），动词由解析决定动作
  ['#qqm点歌 晴天', 'onSongCmd'],
  ['#qqm 点歌 晴天', 'onSongCmd'],
  ['#点歌 晴天', 'pickSongDefault'], // 无前缀：锅巴开关关着时该 handler 返回 false 放行
  ['#qqm听1', 'chooseSong'],
  ['#听3', 'chooseSong'],
  ['#qqm播放 晴天', 'onSongCmd'],
  ['#qqm歌词 晴天', 'getLyric'],
  ['#qqm歌词1', 'getLyric'],
  ['#qqm网易歌词 晴天', 'getLyric'], // 2.0：歌词也吃平台前缀
  ['#qqmB站歌词 晴天', 'getLyric'],
  ['#qqm热搜', 'hotSearch'],
  ['#qqm帮助', 'help'],
  ['#qm帮助', 'help'],
  // 2.0 多平台点歌（**规则一直挂着**，闸门在 handler 里判断：未解锁时 handler 返回 false，
  // 表现与老版本一模一样；这样打开开关不用重启机器人）
  // 2.0 多平台点歌：**与 #qqm点歌 同一条规则**（可选平台前缀），所以 fnc 还是 pickSong
  ['#qqm网易云点歌 晴天', 'onSongCmd'],
  ['#qqm网易云 点歌 晴天', 'onSongCmd'],
  ['#qqm网易点歌 晴天', 'onSongCmd'],
  ['#qqm网易云音乐点歌 晴天', 'onSongCmd'],
  ['#qqmB站点歌 晴天', 'onSongCmd'],
  ['#qqm哔哩哔哩点歌 晴天', 'onSongCmd'],
  ['#qqm酷狗点歌 晴天', 'onSongCmd'],
  ['#qqm酷狗音乐点歌 晴天', 'onSongCmd'],
  ['#qqm汽水点歌 晴天', 'onSongCmd'],
  ['#qqm咪咕点歌 晴天', 'onSongCmd'],
  ['#qqmYouTube点歌 晴天', 'onSongCmd'],
  ['#qqmApple Music点歌 晴天', 'onSongCmd'],
  ['#qqmKUGOU点歌 晴天', 'onSongCmd'], // 大小写不敏感（reg 传 RegExp 对象才保得住 i 标志）
  ['#qqmNetease点歌 晴天', 'onSongCmd'],
  // 最短写法：**动词可省**（平台 + 关键词）
  ['#qqm网易 晴天', 'onSongCmd'],
  ['#qqmB站 晴天', 'onSongCmd'],
  ['#qqmyt 晴天', 'onSongCmd'],
  ['#qqmam 晴天', 'onSongCmd'],
  // 播放：同样吃平台前缀
  ['#qqm网易云播放 晴天', 'onSongCmd'],
  ['#qqmB站播放 晴天', 'onSongCmd'],
  ['#qqmYouTube播放 晴天', 'onSongCmd'],
  ['#qqm平台', 'platformList'],
  ['#qqm平台状态', 'platformsStatusCard'],
  ['#qqm网易状态', 'platformStatusCard'],
  ['#qqm酷狗登录状态', 'platformStatusCard'],
  ['#qqmB站音源状态', 'platformStatusCard'],
  ['#qqm音源状态', 'platformsStatusCard'],
  ['#qqm源', 'sourceCmd'],
  ['#qqm源 网易', 'sourceCmd'],
  ['#qqm源 默认', 'sourceCmd'],
  // 一起听（全员两条 + 主人探测一条；全员必须排在 master 之前，见 apps/together.js 注释）
  ['#qqm一起听 1', 'togetherPick'],
  ['#qqm一起听5', 'togetherPick'],
  ['#qqm一起听 状态', 'togetherState'],
  ['#qqm一起听 探测', 'togetherProbe'],
  ['#qqm一起听 探测 写入', 'togetherProbe'], // 主动开房探测
  // 发现
  ['#qqm排行 飙升', 'chart'],
  ['#qqm推荐', 'recommend'],
  ['#qqm推荐听2', 'recommendListen'],
  ['#qqm来首歌', 'randomSong'],
  ['#qqm电台', 'radio'],
  ['#qqm日推', 'daily'],
  ['#qqm收藏', 'favorites'],
  ['#qqm新歌', 'newSongs'],
  ['#qqm新歌 3', 'newSongs'],
  ['#qqmMV', 'mv'],
  ['#qqmMV 播放 1', 'mv'],
  ['#qqm歌手 周杰伦', 'artist'],
  ['#qqm专辑 叶惠美', 'album'],
  ['#qqm歌单 华语', 'playlist'],
  ['#qqm评论 晴天', 'getComment'],
  // 登录 / 账号
  ['#qqm登录', 'startWebQrLogin'],
  ['#QQ音乐登录', 'startWebQrLogin'],
  // 2026-09-16：微信改走 QQ音乐 App 扫码（原来走网页微信码）。
  // 原因是浏览器换码通道拿不到「播放票据」(psrf_*) 与 wid，播放链恒 104003。
  // 这两条断言以前期望 startWebQrLogin —— 是**旧行为**，随入口一起改。
  ['#qqm登录微信', 'startQrLogin'],
  ['#qqm登录wx', 'startQrLogin'],
  // 2.0：外部平台扫码登录（规则挂在 login.js，限主人）
  ['#qqm网易登录', 'platformQrLogin'],
  ['#qqm网易云登录', 'platformQrLogin'],
  ['#qqm酷狗登录', 'platformQrLogin'],
  ['#qqm汽水登录', 'platformQrLogin'],
  ['#qqmB站登录', 'platformQrLogin'], // 能匹配到规则（handler 会说明"这家没有扫码通道"）
  ['#qqm登录qq', 'startQrLogin'],
  ['#qqm登录app', 'startQrLogin'],
  ['#qqm状态', 'loginStatus'],
  ['#qms', 'loginStatus'],
  ['#qqm登出', 'logout'],
  ['#qqm同步', 'syncFromApi'],
  ['#qqm刷新', 'refreshKey'],
  ['#qqm绑定 qqmusic://x', 'bindManual'],
  ['qqmusic://x', 'importDeepLink'],
  // 管理
  ['#qqm设置', 'showConfig'],
  ['#qqm api http://127.0.0.1:3300', 'setApi'],
  ['#qqm 音质 flac', 'setQuality'],
  ['#qqm 开启点歌', 'toggle'],
  ['#qqm 关闭解析', 'toggle'],
  ['#qqm 默认点歌 开', 'toggleExtra'],
  ['#qqm 补充曲 关', 'toggleExtra'],
  ['#qqm补充曲开', 'toggleExtra'],
  ['#qqm 测试', 'ping'],
  // 界面（主题）
  ['#qqm界面', 'themeCmd'],
  ['#qqm界面 apple', 'themeCmd'],
  ['#qqm主题 深色', 'themeCmd'],
  ['#qqmui', 'themeCmd'],
  ['#qqm更新', 'update'],
  ['#qqm强制更新', 'forceUpdate'],
  ['#qqm更新日志', 'updateLog'],
  ['#qqm账号', 'listAccounts'],
]

/** 负例：这些不应被任何规则匹配（否则会误触发回复） */
const negative = [
  // `#qqm点歌`（不带关键词）现在会命中 onSongCmd 回一句用法提示，见下面的解析用例
  '#qqm听0',
  '#qqm',
  '#qqm不存在',
  '#qqm一起听',
  '#qqm一起听0',
  '#qqm一起听 全部',
  // 注意：`#qqm网易云` / `#qqm网易云点歌` 这类"给了平台但没给关键词"的写法
  // **会**命中 onSongCmd，由它回一句用法提示（比沉默友好）——所以不放在负例里。
  // 负例只放"任何规则都不该接管"的：
  '#qqm网易云歌词',
  '#qqm歌词',
  '#qqm听',
  '#qqmqq',
]

let routeOk = 0
let routeBad = 0
for (const [input, expectFnc] of cases) {
  const hits = allRules.filter((r) => r.re.test(input))
  const ok = expectFnc ? hits.some((h) => h.fnc === expectFnc) : hits.length === 0
  if (ok) {
    routeOk++
    console.log(`✅ ${input} → ${hits.map((h) => h.fnc).join('/') || '(无)'}`)
  } else {
    routeBad++
    allPassed = false
    console.log(
      `❌ ${input} → 期望 ${expectFnc}，实际 ${hits.map((h) => h.plugin + '.' + h.fnc).join('/') || '(无)'}`
    )
  }
}

console.log('')
for (const input of negative) {
  const hits = allRules.filter((r) => r.re.test(input))
  if (hits.length === 0) {
    routeOk++
    console.log(`✅ ${input} → 正确跳过`)
  } else {
    routeBad++
    allPassed = false
    console.log(`❌ ${input} → 不该匹配，却命中 ${hits.map((h) => h.fnc).join('/')}`)
  }
}

// ──────────── 权限抽查：master 命令是否都标注了 permission ────────────
// ──────────── 规则冲突体检（多平台加进来后最容易出的问题）────────────
//
// 症状：**一条消息命中两条以上规则** → 两个 handler 都回话，或按数组顺序被前一条吞掉
// （用户体感："命令冲突 / 回两次 / 时好时坏"）。
// 起因：2.0 第一版把 `#qqm点歌` 与 `#qqm<平台>点歌` 写成**两条规则**，
//       而平台前缀那截完全可以被同一条规则的可选捕获组吃掉 —— 现在就是这么做的。
console.log('\n=== 规则冲突体检 ===\n')
{
  // ① 先看一条硬约束：**每个 apps/*.js 只能导出一个函数**（插件类）
  //   加载器是用 `Object.keys(mod).find(k => typeof mod[k] === 'function')` 找类的；
  //   apps 里多导出一个辅助函数 → 它被当成插件类 → 该模块的规则**全部消失**（实测踩过）
  {
    const badApps = []
    for (const f of fs.readdirSync(path.join(pluginRoot, 'apps')).filter((x) => x.endsWith('.js'))) {
      const mod = await import(`./apps/${f}`)
      const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function')
      if (fns.length !== 1) badApps.push(`${f}: ${fns.join(',') || '(无)'}`)
    }
    if (!badApps.length) {
      routeOk++
      console.log('✅ apps 契约：每个模块只导出一个函数（插件类），辅助函数都在 utils/')
    } else {
      routeBad++
      allPassed = false
      for (const b of badApps) console.log(`❌ apps 导出异常 ${b}`)
    }
  }

  const { platformAliasPattern, PLATFORMS: ALLP } = await import('./utils/platforms.js')
  const aliasList = ALLP.filter((p) => !p.own).flatMap((p) => p.aliases.slice(0, 2))
  const corpus = [
    '#qqm点歌 晴天', '#qqm 点歌 晴天', '#点歌 晴天',
    '#qqm播放 晴天', '#qqm歌词 晴天', '#qqm听1', '#听3', '#qqm热搜', '#qqm帮助', '#qm帮助', '#qqm平台',
    '#qqm歌手 周杰伦', '#qqm专辑 叶惠美', '#qqm歌单 华语', '#qqm评论 晴天', '#qqm排行 飙升',
    '#qqm推荐', '#qqm推荐听2', '#qqm来首歌', '#qqm电台', '#qqm日推', '#qqm收藏', '#qqm新歌', '#qqm新歌 3',
    '#qqmMV', '#qqmMV 播放 1', '#qqm登录', '#qqm登录微信', '#qqm状态', '#qms', '#qqm设置',
    '#qqm 音质 flac', '#qqm 开启点歌', '#qqm一起听 1', '#qqm一起听 状态', '#qqm更新', '#qqm测试',
    ...aliasList.flatMap((a) => [`#qqm${a}点歌 晴天`, `#qqm${a}播放 晴天`]),
    '#qqm点歌 网易云的歌', '#qqm播放 网易云', '#qqm歌单 网易云',
    '#qqm网易 晴天', '#qqmB站 晴天', '#qqmyt 晴天', '#qqmam 晴天', '#qqm源', '#qqm源 网易',
    'https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV',
  ]
  const hitsOf = (msg, list = allRules) => list.filter((r) => r.re.test(msg))

  // 检测器自检：注入一条"改之前"的旧式平台规则，必须能看到双命中，否则 0 冲突不可信
  const oldStyle = {
    plugin: 'selftest',
    fnc: 'OLD_pickSongPlatform',
    re: new RegExp(`^#?(?:qq|QQ)m\\s*(${platformAliasPattern()})\\s*点歌\\s*(.+)$`, 'i'),
  }
  const probeHits = hitsOf('#qqm网易云点歌 晴天', [...allRules, oldStyle])
  if (probeHits.length > 1) {
    routeOk++
    console.log(`✅ 冲突检测器自检：注入旧式平台规则后命中 ${probeHits.length} 条（${probeHits.map((h) => h.fnc).join(' + ')}）`)
  } else {
    routeBad++
    allPassed = false
    console.log('❌ 冲突检测器自检失败：注入旧规则也没发现双命中，下面的结论不可信')
  }

  const doubles = corpus.filter((m) => hitsOf(m).length > 1)
  if (!doubles.length) {
    routeOk++
    console.log(`✅ 规则无冲突：${corpus.length} 条真实命令各只命中 1 条规则（规则共 ${allRules.length} 条）`)
  } else {
    routeBad++
    allPassed = false
    for (const m of doubles) console.log(`❌ 双命中 ${m} → ${hitsOf(m).map((h) => `${h.plugin}.${h.fnc}`).join(' + ')}`)
  }
}

console.log('\n=== 权限抽查 ===\n')
const masterFnc = [
  'startQrLogin',
  'startWebQrLogin',
  'logout',
  'syncFromApi',
  'refreshKey',
  'bindManual',
  'importDeepLink',
  'showConfig',
  'setApi',
  'setQuality',
  'toggle',
  'toggleExtra',
  'themeCmd', // 换界面是全局设置，限主人
  'ping',
  'update',
  'forceUpdate',
  'updateLog',
  'listAccounts',
  'togetherProbe', // 探测会回显群成员 uin 与房间内部 id，必须限主人
]
for (const fnc of masterFnc) {
  const rules = allRules.filter((r) => r.fnc === fnc)
  const allMaster = rules.length > 0 && rules.every((r) => r.permission === 'master')
  if (allMaster) {
    console.log(`✅ ${fnc} → master`)
  } else {
    allPassed = false
    console.log(`❌ ${fnc} → 权限标注异常: ${rules.map((r) => r.permission || '(未标注)').join(',')}`)
  }
}

// 处理函数变量作用域检查（见 scripts/check-scope.mjs）
// 起因：改文案时把变量 codes 误用到 startQrLogin，用户扫码后才报 codes is not defined；
// 路由测试只看正则，抓不到这类问题
console.log('\n=== 变量作用域检查 ===\n')
try {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  // 用相对本文件的路径（测试可能从框架根目录运行，cwd 不是插件目录）
  const script = fileURLToPath(new URL('./scripts/check-scope.mjs', import.meta.url))
  execFileSync(process.execPath, [script], { stdio: 'inherit' })
} catch {
  allPassed = false
  console.log('❌ 变量作用域检查未通过（见上表）')
}

// ──────────── 纯函数抽查（链接解析 / 文件名 / 命令识别）────────────
// 起因：这三类 bug 路由测试都抓不到 ——
//  ① /n/ryqq/albumDetail/<mid>（PC 端标准专辑链接）解析为空 → 专辑链接识别整条静默失效
//  ② #qms 不在 isPluginCommandMsg 里 → 解析守卫认不出自家命令
//  ③ 文件名里那句非法字符替换是死分支（cleanTrackText 已先把它们换成空格）
console.log('\n=== 纯函数抽查 ===\n')
let pureOk = 0
let pureBad = 0
try {
  const { parseQQMusicExtendedIds, buildPlayFailMessage, loginRenewHint } = await import('./utils/api.js')
  const { buildMusicFileName, formatSize } = await import('./utils/send.js')
  const { isPluginCommandMsg } = await import('./utils/common.js')
  // 一起听：插件侧只剩「协议端识别 + 开关」。
  // 协议字段、编排、限流、文案全在 API 侧（qqmusic-api-enhanced/scripts/test-together.js 有 48 项单测），
  // 插件这边如果还残留可复刻的协议实现，就是这套架构白改了。
  const { togetherAdapter, togetherGate, autoSyncTogether } = await import('./utils/together.js')
  // 自定义背景：来源识别、图片 API 的 JSON 解析、缓存过期判定
  const { classifyBgInput, pickImageUrl, shouldRefresh } = await import('./utils/background.js')
  // 主题（多套 UI）：语法糖是「丢个目录就能加主题」，所以这里测的是解析与回落规则
  const {
    listThemeIds,
    resolveTheme,
    templateFile,
    normalizeManifest,
    pageBgOf,
    viewportWidthOf,
    fileChanged,
    timePeriodOf,
    darkPrefOf,
  } = await import('./utils/theme.js')
  const themeIds = listThemeIds()
  const classicTheme = resolveTheme({ uiTheme: 'classic' })
  const fallbackTheme = resolveTheme({ uiTheme: '__不存在的主题__' })
  const classicDark = resolveTheme({ uiTheme: 'classic', uiDark: true })
  /** 把时间钉死在某个整点，避免测试依赖「跑测试时是几点」 */
  const atHour = (h) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    return d
  }

  // 热更新：mtime 变了才要重新编译模板。用临时文件验，不碰仓库里的真模板
  const scratch = new URL('./temp/_theme-mtime-test.html', import.meta.url)
  const { writeFileSync, unlinkSync, utimesSync } = await import('node:fs')
  writeFileSync(scratch, 'a')
  const firstSeen = fileChanged(scratch) // 首次必然 true（反正也要编译）
  const secondSeen = fileChanged(scratch) // 没动过 → false
  const past = new Date(Date.now() - 5000)
  utimesSync(scratch, past, past) // 改动 mtime（模拟编辑了模板）
  const afterTouch = fileChanged(scratch)
  unlinkSync(scratch)
  const mkEvent = (name, { withSendApi = true, group = '100' } = {}) => ({
    group_id: group,
    bot: Object.assign(
      { adapter: { id: 'QQ', name } },
      withSendApi ? { sendApi: async () => '' } : {}
    ),
  })
  const icqqEv = mkEvent('icqq', { withSendApi: false })
  const napcatEv = mkEvent('napcat')
  const snowlumaEv = mkEvent('SnowLuma')
  const qqbotEv = mkEvent('qqbot', { withSendApi: false })
  const privateEv = mkEvent('icqq', { withSendApi: false, group: null })

  const pure = [
    // 专辑链接三种分享形态都要认得（少一种 = 那类链接用户发了没反应）
    [
      '专辑 /albumDetail/ 链接解析',
      parseQQMusicExtendedIds('https://y.qq.com/n/ryqq/albumDetail/002fRO0N4FftzY').albummid,
      '002fRO0N4FftzY',
    ],
    [
      '专辑 /album/ 链接解析',
      parseQQMusicExtendedIds('https://y.qq.com/n/ryqq/album/002fRO0N4FftzY').albummid,
      '002fRO0N4FftzY',
    ],
    [
      '专辑 ?albummid= 链接解析',
      parseQQMusicExtendedIds(
        'https://i.y.qq.com/n2/m/share/details/album.html?albummid=002fRO0N4FftzY'
      ).albummid,
      '002fRO0N4FftzY',
    ],
    [
      '歌单链接解析',
      parseQQMusicExtendedIds('https://y.qq.com/n/ryqq/playlist/7286029431').disstid,
      '7286029431',
    ],
    [
      '歌手链接解析',
      parseQQMusicExtendedIds('https://y.qq.com/n/ryqq/singer/001fNHEf1SFEFN').singermid,
      '001fNHEf1SFEFN',
    ],
    // 文件名：非法路径字符要换下划线（原来这里是死分支，会留空格）
    [
      '文件名非法字符换下划线',
      buildMusicFileName({ singer: 'a/b', title: 'c:d', ext: '.flac' }),
      'a_b-c_d.flac',
    ],
    [
      '文件名扩展名非法兜底 .mp3',
      buildMusicFileName({ singer: 'x', title: 'y', ext: '../x' }).endsWith('.mp3'),
      true,
    ],
    ['文件名空标题兜底', buildMusicFileName({ singer: 'x', title: '', ext: '.flac' }), 'x-未知歌曲.flac'],
    ['formatSize 0 → 空', formatSize(0), ''],
    ['formatSize 1KB 边界', formatSize(1024), '1.0 KB'],
    // 自家命令识别：漏一个就会拿去当普通消息抽链接
    ['识别 #qms', isPluginCommandMsg('#qms'), true],
    ['识别 #QMS', isPluginCommandMsg('#QMS'), true],
    ['识别 #QQ状态', isPluginCommandMsg('#QQ状态'), true],
    ['识别 #qqm点歌', isPluginCommandMsg('#qqm点歌 晴天'), true],
    // 一起听指令若不被识别为自家命令，resolve 守卫会把它当普通消息去抽链接
    ['识别 #qqm一起听', isPluginCommandMsg('#qqm一起听 1'), true],
    ['识别 #qqm一起听 探测', isPluginCommandMsg('#qqm一起听 探测'), true],
    ['普通聊天不算命令', isPluginCommandMsg('今天天气不错'), false],
    // DRM 曲目：服务端只说「仅提供加密文件」，此时再追加「需会员播放，请 #qqm登录」是自相矛盾
    [
      'DRM 曲不追加「需会员播放」（登录/会员都解决不了）',
      /需会员播放/.test(
        buildPlayFailMessage({ drm: true, errMsg: '该曲仅提供加密文件 DRM' }, { pay_play: 1 }, ['flac:no-url'])
      ),
      false,
    ],
    [
      'DRM 判定也认文案里的「加密文件」（不依赖 drm 字段）',
      /需会员播放/.test(buildPlayFailMessage({ errMsg: '仅提供加密文件' }, { pay_play: 1 }, [])),
      false,
    ],
    [
      '普通会员曲仍保留「需会员播放」提示',
      /需会员播放/.test(buildPlayFailMessage({ errMsg: '无链' }, { pay_play: 1 }, [])),
      true,
    ],
    // 续期提示：以登录时**实测**结果为准 —— 微信 PC 流程有 refresh_key 也续不了（实测全形状 1000），
    // 光看「有没有材料」会写出假承诺
    [
      '实测续期被拒：不谎称「可自动续期」',
      /不支持自动续期/.test(
        loginRenewHint({ login: true, hasRefresh: true, refreshChecked: true, refreshable: false, keyExpiresIn: 259200 })
      ),
      true,
    ],
    [
      '实测续期被拒：带上实际有效期（259200 秒 → 3 天）',
      /3 天/.test(
        loginRenewHint({ login: true, hasRefresh: true, refreshChecked: true, refreshable: false, keyExpiresIn: 259200 })
      ),
      true,
    ],
    [
      '实测可续期：才说「可自动续期」',
      /可自动续期/.test(
        loginRenewHint({ login: true, hasRefresh: true, refreshChecked: true, refreshable: true, keyExpiresIn: 259200 })
      ),
      true,
    ],
    [
      '没实测过时退回看材料：无 refresh 才提示需重扫',
      /无 refresh/.test(loginRenewHint({ login: true, hasRefresh: false })),
      true,
    ],
    ['未登录时不输出续期提示', loginRenewHint({ login: false, hasRefresh: true }), ''],
    // 一起听：插件侧只剩协议端识别 + 开关。协议字段/编排/限流/文案都在 API 侧
    // （那边有独立单测）；插件这边若还残留可复刻的协议实现，这套架构就白改了。
    ['协议端识别：icqq', togetherAdapter(icqqEv), 'icqq'],
    ['协议端识别：NapCat', togetherAdapter(napcatEv), 'onebot'],
    ['协议端识别：SnowLuma', togetherAdapter(snowlumaEv), 'onebot'],
    ['协议端识别：QQBot 官方（无原始发包）', togetherAdapter(qqbotEv), ''],
    ['开关关着不放行', togetherGate(icqqEv, {}).ok, false],
    ['  未启用文案', /未启用/.test(togetherGate(icqqEv, {}).reason), true],
    ['私聊不放行', /仅支持群聊/.test(togetherGate(privateEv, { togetherEnable: true }).reason), true],
    ['协议端不支持时不放行', /协议端/.test(togetherGate(qqbotEv, { togetherEnable: true }).reason), true],
    ['能力齐全才放行', togetherGate(icqqEv, { togetherEnable: true }).ok, true],
    // 自动同步必须**同时**满足两个开关。只看 togetherAuto 会让
    // 「总开关关着、单独开了自动同步」的配置照样把歌发进房间。
    // （只在返回 null 的路径上断言，避免单测触网）
    [
      '自动同步：总开关关着 → 不动作',
      await autoSyncTogether(icqqEv, { songmid: 'm' }, { togetherEnable: false, togetherAuto: true }),
      null,
    ],
    [
      '自动同步：自动同步开关关着 → 不动作',
      await autoSyncTogether(icqqEv, { songmid: 'm' }, { togetherEnable: true, togetherAuto: false }),
      null,
    ],
    // 界面（多套 UI）：主题解析与回落规则 —— 「丢个目录就能加主题」全靠这些规则兜住
    ['主题：内置 classic 在列', themeIds.includes('classic'), true],
    ['主题：不填就是 classic', resolveTheme({}).id, 'classic'],
    ['主题：名字不存在时回落 classic', fallbackTheme.id, 'classic'],
    ['主题：回落要标记出来（设置页会显示 ⚠️）', fallbackTheme.fallback, true],
    ['主题：classic 不支持深色（uiDark 对它不生效）', classicDark.dark, false],
    ['主题：classic 底色保持原样（回归）', pageBgOf(classicTheme), '#e6f6ee'],
    [
      '主题：视口宽度保持旧行为（status 580 / list 640）',
      [viewportWidthOf(classicTheme, 'qqmusic-status'), viewportWidthOf(classicTheme, 'qqmusic-list')],
      [580, 640],
    ],
    ['主题：模板解析到主题目录', templateFile(classicTheme, 'qqmusic-list').from, 'classic'],
    [
      '主题：卡片不存在时返回 null（让调用方报错，而不是渲染空卡）',
      templateFile(classicTheme, '__不存在的卡__').file,
      null,
    ],
    ['主题：manifest 缺字段有安全默认', normalizeManifest('x', {}).viewportWidth, 640],
    // 热更新：模板 mtime 变了才重新编译（art-template 默认按文件名永久缓存）
    ['热更新：首次判为需编译', firstSeen, true],
    ['热更新：没改动就不重复编译', secondSeen, false],
    ['热更新：mtime 变了要重新编译', afterTouch, true],
    // 底色跟随时段：边界要准，否则一天里会有一段时间是错的配色
    ['时段：5 点 = 清晨', timePeriodOf(atHour(5)), 'dawn'],
    ['时段：7 点 = 清晨', timePeriodOf(atHour(7)), 'dawn'],
    ['时段：8 点 = 白天（边界）', timePeriodOf(atHour(8)), 'day'],
    ['时段：16 点 = 白天', timePeriodOf(atHour(16)), 'day'],
    ['时段：17 点 = 黄昏（边界）', timePeriodOf(atHour(17)), 'dusk'],
    ['时段：19 点 = 黄昏', timePeriodOf(atHour(19)), 'dusk'],
    ['时段：20 点 = 夜晚（边界）', timePeriodOf(atHour(20)), 'night'],
    ['时段：凌晨 4 点 = 夜晚', timePeriodOf(atHour(4)), 'night'],
    // 深浅色偏好归一
    ['深浅：true = dark', darkPrefOf(true), 'dark'],
    ['深浅：false = light', darkPrefOf(false), 'light'],
    ['深浅：auto = 跟随时间', darkPrefOf('auto'), 'auto'],
    ['深浅：中文「自动」也认', darkPrefOf('自动'), 'auto'],
    [
      '跟随时间：夜里是深色',
      resolveTheme({ uiTheme: 'apple', uiDark: 'auto' }, { now: atHour(22) }).dark,
      true,
    ],
    [
      '跟随时间：白天是浅色',
      resolveTheme({ uiTheme: 'apple', uiDark: 'auto' }, { now: atHour(12) }).dark,
      false,
    ],
    ['显式浅色：夜里也保持浅色', resolveTheme({ uiTheme: 'apple', uiDark: 'light' }, { now: atHour(22) }).dark, false],
    ['classic 不支持深色：跟随时间也不变深', resolveTheme({ uiTheme: 'classic', uiDark: 'auto' }, { now: atHour(22) }).dark, false],
    ['关掉时段配色 → 固定白天', resolveTheme({ uiTheme: 'apple', uiTimeColor: false }, { now: atHour(22) }).period, 'day'],
    ['开着时段配色 → 用真实时段', resolveTheme({ uiTheme: 'apple' }, { now: atHour(22) }).period, 'night'],
    // 自定义背景：来源自动识别（Win/Linux 路径 vs 链接）
    ['背景来源：https 直链 → remote', classifyBgInput('https://example.com/a.jpg'), 'remote'],
    ['背景来源：http 直链 → remote', classifyBgInput('http://example.com/a.jpg'), 'remote'],
    ['背景来源：Windows 路径 → file', classifyBgInput('D:\\图片\\a.jpg'), 'file'],
    ['背景来源：Linux 路径 → file', classifyBgInput('/root/pics/a.jpg'), 'file'],
    ['背景来源：空 → 不启用', classifyBgInput('   '), ''],
    // 图片 API 的 JSON 形状很多，这几种是最常见的
    ['背景 API：{url}', pickImageUrl({ url: 'https://a/1.jpg' }), 'https://a/1.jpg'],
    ['背景 API：{data:{url}}', pickImageUrl({ data: { url: 'https://a/2.jpg' } }), 'https://a/2.jpg'],
    ['背景 API：{data:[{url}]}', pickImageUrl({ data: [{ url: 'https://a/3.jpg' }] }), 'https://a/3.jpg'],
    ['背景 API：{imgurl}', pickImageUrl({ imgurl: 'https://a/4.jpg' }), 'https://a/4.jpg'],
    ['背景 API：裸 URL 字符串', pickImageUrl('https://a/5.jpg'), 'https://a/5.jpg'],
    ['背景 API：没有图片地址 → 空', pickImageUrl({ ok: true, msg: 'no image' }), ''],
    // 缓存：同一批卡片共用一张图，过了窗口才重取
    ['背景缓存：没记录过 → 要取', shouldRefresh(null, 10, 1000), true],
    ['背景缓存：窗口内 → 不重取', shouldRefresh({ at: 0 }, 10, 60_000), false],
    ['背景缓存：过窗口 → 重取', shouldRefresh({ at: 0 }, 10, 11 * 60_000), true],
    ['背景缓存：ttl=0 → 每次都取', shouldRefresh({ at: 0 }, 0, 1), true],
    // 只有声明了 bg 能力的主题才接管背景配置
    ['主题能力：apple 支持自定义背景', resolveTheme({ uiTheme: 'apple' }).manifest.bg, true],
    ['主题能力：classic 不支持', resolveTheme({ uiTheme: 'classic' }).manifest.bg, false],
  ]

  for (const [name, got, want] of pure) {
    if (JSON.stringify(got) === JSON.stringify(want)) {
      pureOk++
      console.log(`✅ ${name}`)
    } else {
      pureBad++
      allPassed = false
      console.log(`❌ ${name} → 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`)
    }
  }
} catch (err) {
  allPassed = false
  pureBad++
  console.log(`❌ 纯函数抽查异常: ${err.message}`)
}

// ──────────── 2.0：多平台 + 神秘开关（？？？）────────────
//
// 命令解析先单独验：**歧义**都堵在这一个纯函数里（点歌/播放/平台前缀/动词可省），
// 它错了后面全错，所以这里的用例最密。
console.log('\n=== 命令解析（点歌/播放/平台前缀）===\n')
{
  const { parseSongCmd } = await import('./utils/command.js')
  const cases = [
    // [输入, 期望平台, 期望动词, 期望关键词]
    ['#qqm点歌 七里香', '', '点歌', '七里香'],
    ['#qqm 点歌 七里香', '', '点歌', '七里香'],
    ['#qqm播放 七里香', '', '播放', '七里香'],
    ['#qqm网易 七里香', '网易', '', '七里香'], // 省动词
    ['#qqm网易云点歌 七里香', '网易云', '点歌', '七里香'],
    ['#qqm网易云播放 七里香', '网易云', '播放', '七里香'],
    ['#qqm网易云音乐点歌 七里香', '网易云音乐', '点歌', '七里香'], // 长别名优先
    ['#qqmB站 晴天', 'B站', '', '晴天'],
    ['#qqmyt 晴天', 'yt', '', '晴天'],
    ['#qqmam 晴天', 'am', '', '晴天'],
    ['#qqmKUGOU点歌 晴天', 'KUGOU', '点歌', '晴天'], // 大小写不敏感
    // 关键词里带平台名/动词：不能被误切
    ['#qqm点歌 网易云的歌', '', '点歌', '网易云的歌'],
    ['#qqm播放 网易云', '', '播放', '网易云'],
    ['#qqm点歌 播放列表', '', '点歌', '播放列表'], // QQ 写法动词必写 → 关键词可以动词开头
    // 不该被点歌吞掉的（留给专门规则/其它插件）
    ['#qqm歌词 晴天', '', '', ''],
    ['#qqm网易歌词 晴天', '', '', ''], // 省动词分支排除动词开头的关键词
    ['#qqm歌手 周杰伦', '', '', ''],
    ['#qqm平台', '', '', ''],
    ['#qqm源 网易', '', '', ''],
    // 给了平台/动词但没关键词：**匹配到**（好回一句用法提示），关键词为空
    ['#qqm网易', '网易', '', ''],
    ['#qqm网易云点歌', '网易云', '点歌', ''],
    ['#qqm网易云播放', '网易云', '播放', ''],
    ['#qqm点歌', '', '点歌', ''],
    // 省动词写法**必须带空格**：不带就跟"平台+动词"打架（会切成"网易"+"云点歌"）
    ['#qqm网易七里香', '', '', ''],
  ]
  let ok = 0
  let bad = 0
  for (const [input, plat, verb, kw] of cases) {
    const got = parseSongCmd(input)
    const want = { plat, verb, keyword: kw }
    if (JSON.stringify(got) === JSON.stringify(want)) {
      ok++
    } else {
      bad++
      allPassed = false
      console.log(`❌ 解析 ${input} → ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`)
    }
  }
  if (!bad) console.log(`✅ 命令解析 ${ok}/${cases.length} 全部符合预期（含"不该被吞"的负例）`)
  routeOk += ok
  routeBad += bad

  // 歌词命令的解析（也吃平台前缀；数字序号与关键词都算 key）
  const { parseLyricCmd } = await import('./utils/command.js')
  const lyricCases = [
    ['#qqm歌词 晴天', '', '晴天'],
    ['#qqm歌词1', '', '1'],
    ['#qqm歌词 1', '', '1'],
    ['#qqm网易歌词 晴天', '网易', '晴天'],
    ['#qqm网易云音乐歌词 晴天', '网易云音乐', '晴天'],
    ['#qqmyt歌词 hello', 'yt', 'hello'],
    ['#qqm网易歌词', '', ''], // 半截命令不该命中
    ['#qqm点歌 晴天', '', ''],
  ]
  let lok = 0
  let lbad = 0
  for (const [input, plat, key] of lyricCases) {
    const got = parseLyricCmd(input)
    if (got.plat === plat && got.key === key) lok++
    else {
      lbad++
      allPassed = false
      console.log(`❌ 歌词解析 ${input} → ${JSON.stringify(got)}，期望 ${JSON.stringify({ plat, key })}`)
    }
  }
  if (!lbad) console.log(`✅ 歌词解析 ${lok}/${lyricCases.length} 符合预期`)
  routeOk += lok
  routeBad += lbad
}

//
// 这一段钉的是"**默认什么都不变**"这条硬约束：
//   · 开关关着 → 多平台命令不响应、帮助还是老卡、锅巴里看不到平台分组
//   · 开关打开 → 平台命令/帮助/锅巴分组一起出现，且**不用重启机器人**
// 顺带验配置读写：嵌套字段（platforms.<平台>.enabled）必须落成嵌套对象。
console.log('\n=== 2.0 平台与神秘开关 ===\n')
let v2Ok = 0
let v2Bad = 0
function v2Check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    v2Ok++
    console.log(`✅ ${name}`)
  } else {
    v2Bad++
    allPassed = false
    console.log(`❌ ${name} → 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`)
  }
}

{
  // 配置是真会写盘的 —— 先备份用户配置，跑完原样恢复（与 data/tokens 的处理同思路）
  const cfgFile = path.join(pluginRoot, 'config', 'config', 'qqmusic.yaml')
  const cfgBackup = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf8') : null
  /**
   * ⚠️ 这是一段会改**真实用户配置**的测试，还原必须成对且可验证。
   * 2026-09-23 出过事：某次没还原干净，之后每次"备份"都带着 unlockV2: true，
   * 于是测试开关被留在用户配置里（而且是"越滚越多"）。
   * 现在：开跑前若发现备份里有测试键就报警，跑完比对是否逐字节还原。
   *
   * ⚠️⚠️ 还有一个坑：**别和 temp/e2e-v2.mjs 之类的脚本并行跑** ——
   * 两边都会"备份→改→还原"同一份 config/config/qqmusic.yaml，交错执行会把
   * 对方的备份/写入互相覆盖（2026-09-23 实测：并行跑完留下 38 键的脏配置）。
   * 真要一起跑就串行。
   */
  const TEST_KEYS = ['unlockV2', 'platforms', 'qqEnabled', 'uiThemeV2']
  const dirty = TEST_KEYS.filter((k) => new RegExp(`^${k}:`, 'm').test(cfgBackup || ''))
  if (dirty.length) {
    console.log(
      `⚠️ 用户配置里已有测试键 [${dirty.join(', ')}] —— 上次可能没还原干净。\n` +
        '   本次会按备份还原；想顺手清掉：node temp/clean-config.mjs\n'
    )
  }
  const restoreCfg = () => {
    try {
      if (cfgBackup !== null) {
        fs.writeFileSync(cfgFile, cfgBackup, 'utf8')
        if (fs.readFileSync(cfgFile, 'utf8') !== cfgBackup) {
          console.log('❌ 配置还原后与备份不一致（请检查 config/config/qqmusic.yaml）')
          allPassed = false
        }
      }
      else if (fs.existsSync(cfgFile)) fs.unlinkSync(cfgFile)
    } catch (e) {
      console.log(`⚠️ 配置恢复失败（请检查 config/config/qqmusic.yaml）：${e.message}`)
    }
  }

  try {
    const P = await import('./utils/platforms.js')
    const V = await import('./utils/v2.js')
    const HC = await import('./utils/help-card.js')
    const R = await import('./utils/render.js')
    const { buildSchemas, setConfigData, getConfigData } = await import('./guoba/schemas.js')
    const { default: Config2 } = await import('./components/Config.js')
    const setCfg = (patch) => Config2.setConfig('qqmusic', { ...Config2.getConfig('qqmusic'), ...patch })
    const cfgNow = () => Config2.getConfig('qqmusic')

    // ── 平台注册表 ──
    v2Check('注册表：每家都有 id/label/别名/音质', P.PLATFORMS.every((p) => p.id && p.label && p.quality && Array.isArray(p.aliases)), true)
    v2Check('注册表：id 不重复', new Set(P.PLATFORMS.map((p) => p.id)).size === P.PLATFORMS.length, true)
    v2Check('别名：中文认得出', [P.platformIdOf('网易云'), P.platformIdOf('B站'), P.platformIdOf('哔哩哔哩')].join(','), 'netease,bilibili,bilibili')
    v2Check('别名：大小写不敏感', [P.platformIdOf('KUGOU'), P.platformIdOf('YouTube')].join(','), 'kugou,youtube')
    v2Check('别名：认不出回空（不瞎猜）', P.platformIdOf('不存在的平台'), '')
    v2Check(
      '长别名优先（「网易云」不会被切成「网易」+ 关键词"云点歌"）',
      (() => {
        const re = new RegExp(`^(${P.platformAliasPattern()})\\s*点歌\\s*(.+)$`)
        const m = '网易云点歌 晴天'.match(re)
        return m ? `${m[1]}|${m[2]}` : ''
      })(),
      '网易云|晴天'
    )
    v2Check('QQ 本体不在平台别名里（走老的 #qqm点歌）', new RegExp(`^(?:${P.platformAliasPattern()})$`).test('qq'), false)
    v2Check('外部平台 = 注册表去掉 QQ 本体', P.SEARCH_PLATFORMS.length === P.PLATFORMS.length - 1 && P.SEARCH_PLATFORMS.every((p) => !p.own), true)
    v2Check('未登记的来源也不空白（原样返回）', [P.platformLabel('xxx'), P.platformIcon('xxx'), P.platformColor('xxx')].join('|'), 'xxx||#8a8a8e')

    // ── 闸门：关着 = 与 1.x 一致 ──
    setCfg({ unlockV2: false, platforms: {} })
    v2Check('闸门：默认关', V.isV2Unlocked(), false)
    v2Check('闸门：关着时可用平台为空', V.enabledPlatforms(cfgNow()).length, 0)
    const songApp = new qqmusicSong()
    const silent = { msg: '#qqm网易云点歌 晴天', reply: async () => {} }
    v2Check('闸门：关着时多平台点歌不响应（return false，不提示）', await songApp.pickSongPlatform(silent), false)
    v2Check('闸门：关着时 #qqm平台 不响应', await songApp.platformList(silent), false)
    v2Check('闸门：关着时帮助仍是老卡（没有"多平台音源"段）', HC.buildHelpCardData({}).sections.every((s) => s.title !== '多平台音源'), true)
    const lockedSchemas = buildSchemas()
    const lockedGroups = lockedSchemas.filter((s) => s.component === 'SOFT_GROUP_BEGIN').map((s) => s.label)
    v2Check('锅巴：关着时看不到平台分组', !lockedSchemas.some((s) => /音源平台（2\.0）/.test(s.label || '')), true)
    v2Check('锅巴：关着时也没有 platforms.* 字段', !lockedSchemas.some((s) => String(s.field || '').startsWith('platforms.')), true)
    v2Check('锅巴：？？？开关一直在（关着时才需要它）', lockedSchemas.some((s) => s.field === 'unlockV2' && s.label === '？？？'), true)
    v2Check('锅巴：给 ??？ 的默认值是布尔（不然开关显示不对）', getConfigData().unlockV2, false)
    // 分组粒度：用户反馈"太细了" —— 锁定时必须只有 4 组（基础设置/界面与外观/发送与下载/？？？）
    v2Check('锅巴：分组收敛到 4 组（不再按功能拆 7 组）', lockedGroups.join(' | '), '① 基础设置 | ② 界面与外观 | ③ 发送与下载 | ？？？')
    v2Check(
      '锅巴：接口/开关/音质/点歌/一起听 都合并进「① 基础设置」',
      ['apiBase', 'enableSongRequest', 'quality', 'defaultPickSong', 'togetherEnable'].every((f) =>
        lockedSchemas.slice(0, lockedSchemas.findIndex((s) => s.label === '② 界面与外观')).some((s) => s.field === f)
      ),
      true
    )

    // ── 闸门：打开 = 2.0 ──
    setCfg({ unlockV2: true, platforms: {} })
    v2Check('闸门：打开后立即生效（不用重启）', V.isV2Unlocked(), true)
    v2Check('闸门：打开后可用平台 = 可见外部平台', V.enabledPlatforms(cfgNow()).length, P.VISIBLE_PLATFORMS.length - 1)
    const unlockedSchemas = buildSchemas()
    const unlockedGroups = unlockedSchemas.filter((s) => s.component === 'SOFT_GROUP_BEGIN').map((s) => s.label)
    // 2.0 的平台是**每家一个页签**（与 R 插件的 B站/抖音/油管/网易云 页签同款）
    const platformTabs = P.VISIBLE_PLATFORMS.filter((p) => !p.own).map((p) => p.label)
    v2Check(
      '锅巴：打开后每家平台一个页签（基础 4 个 + 平台 8 个）',
      unlockedGroups.join(' | '),
      [...lockedGroups, ...platformTabs].join(' | ')
    )
    v2Check(
      '锅巴：每个平台页签里有「启用 + 条数」两项（自己的设置只在自己页签里）',
      (() => {
        const ids = P.VISIBLE_PLATFORMS.filter((p) => !p.own).map((p) => p.id)
        const fields = unlockedSchemas.map((s) => s.field).filter(Boolean)
        return ids.every((id) => fields.includes(`platforms.${id}.enabled`) && fields.includes(`platforms.${id}.maxList`))
      })(),
      true
    )
    v2Check(
      '锅巴：页签顺序 = 注册表顺序（QQ 本体不占页签）',
      unlockedGroups.slice(lockedGroups.length).join(','),
      P.VISIBLE_PLATFORMS.filter((p) => !p.own)
        .map((p) => p.label)
        .join(',')
    )
    v2Check(
      '锅巴：每个平台页签都带用法提示（**最短写法**在最前：`#qqm<短名> 关键词`）',
      P.VISIBLE_PLATFORMS.filter((p) => !p.own).every((p) =>
        unlockedSchemas.some(
          (s) => s.component === 'Divider' && String(s.label || '').includes(`用法：#qqm${p.short || p.label} 关键词`)
        )
      ),
      true
    )
    v2Check(
      '锅巴：需要凭据的平台在页签里标了 ⚠️（酷狗/汽水/YouTube/Apple）',
      P.VISIBLE_PLATFORMS.filter((p) => !p.own && p.needsCredential).every((p) =>
        unlockedSchemas.some((s) => s.component === 'Divider' && String(s.label || '').includes(p.label) && /需要 API 侧先配好凭据/.test(s.label))
      ),
      true
    )
    v2Check(
      '锅巴：不再有"多选一栏装所有平台"那种字段（那是上一版，用户要按平台分）',
      unlockedSchemas.some((s) => s.field === 'enabledPlatforms'),
      false
    )
    // ── 每个平台页签里要有"这一家自己的功能"（不只是启用/条数）──
    v2Check(
      '锅巴：每家页签都有"参与跨平台补歌"开关（不想被某家占位就关掉）',
      P.VISIBLE_PLATFORMS.filter((p) => !p.own).every((p) => unlockedSchemas.some((s) => s.field === `platforms.${p.id}.fill`)),
      true
    )
    v2Check(
      '锅巴：只有**真有多档**的平台才显示"音质档位"（不给假开关）',
      (() => {
        const withQuality = P.VISIBLE_PLATFORMS.filter((p) => !p.own && P.platformHasQualityChoice(p.id)).map((p) => p.id).sort()
        const schemaHas = unlockedSchemas
          .map((s) => String(s.field || ''))
          .filter((f) => /^platforms\..+\.quality$/.test(f))
          .map((f) => f.split('.')[1])
          .sort()
        return JSON.stringify(withQuality) === JSON.stringify(schemaHas)
      })(),
      true
    )
    v2Check(
      '锅巴：档位里标清"要账号/会员"（点之前就知道）',
      /要账号|要会员/.test(JSON.stringify(P.platformQualities('netease'))) && /要账号|要会员/.test(JSON.stringify(P.platformQualities('kugou'))),
      true
    )
    v2Check('锅巴：单档平台只给"自动"（酷我/咪咕只有 PQ 之类）', [P.platformHasQualityChoice('kuwo'), P.platformHasQualityChoice('bilibili')].join(','), 'false,false')
    // ── 前缀识别（外源曲不能被当成 QQ 曲）──
    v2Check(
      '前缀认平台：把所有外源前缀都覆盖到（别只认 ne_/kw_/bi_）',
      ['ne_', 'kw_', 'bi_', 'qs_', 'ku_', 'mg_', 'yt_', 'ap_', 'js_']
        .map((pf) => P.platformOfMid(`${pf}123`)?.id || '?')
        .join(','),
      'netease,kuwo,bilibili,qishui,kugou,migu,youtube,apple,jiosaavn'
    )
    v2Check('QQ 曲的 mid 不算外源（认不出来）', P.isExternalMid('0039MnYb0qxYhV'), false)
    v2Check('注册表前缀与 API provider 一致（ne_/kw_/bi_/qs_/ku_/mg_/yt_/ap_/js_）', P.PLATFORMS.filter((p) => !p.own).every((p) => /^[a-z]{2}_$/.test(p.prefix)), true)
    // ── 档位偏好 / 补歌开关的取值逻辑 ──
    v2Check('档位偏好：没配 = auto', V.platformQualityPref({}, 'kugou'), 'auto')
    v2Check('档位偏好：配了合法值就用它', V.platformQualityPref({ platforms: { kugou: { quality: 'flac' } } }, 'kugou'), 'flac')
    v2Check('档位偏好：非法值回 auto（不把脏值带去 API）', V.platformQualityPref({ platforms: { kugou: { quality: 'atmos_master' } } }, 'kugou'), 'auto')
    v2Check('档位偏好：大小写不敏感且归一成注册表写法', V.platformQualityPref({ platforms: { kugou: { quality: 'FLAC' } } }, 'kugou'), 'flac')
    // 注意：隐藏平台（JioSaavn）**也**参与补歌（它只是不在帮助/锅巴里露脸），所以用 SEARCH_PLATFORMS
    v2Check('补歌：默认全部参与', V.fillSourceIds({}).length, P.SEARCH_PLATFORMS.length)
    v2Check(
      '补歌：关掉某家的"参与"后它不在补歌来源里（但平台仍可用）',
      (() => {
        const cfg = { platforms: { kuwo: { fill: false } } }
        return !V.fillSourceIds(cfg).includes('kuwo') && V.platformEnabled(cfg, 'kuwo')
      })(),
      true
    )
    v2Check(
      '补歌：整家关掉时更不应该参与补歌',
      V.fillSourceIds({ platforms: { bilibili: { enabled: false } } }).includes('bilibili'),
      false
    )
    // ── "QQ 不是唯一主干"：QQ 音源可关，关掉后 #qqm点歌 走其它平台 ──
    v2Check('QQ 音源：默认是开的（老行为不变）', V.qqSourceEnabled({}), true)
    v2Check('QQ 音源：显式关掉才关', V.qqSourceEnabled({ qqEnabled: false }), false)
    v2Check(
      'QQ 音源：可单独点歌的平台 = 开着的那几家（未解锁时为空，跟 v2 闸门一致）',
      [V.standaloneSourceIds({ platforms: {} }).length, V.standaloneSourceIds({ unlockV2: true, platforms: {} }).length].join(','),
      `0,${P.VISIBLE_PLATFORMS.length - 1}`
    )
    v2Check(
      '锅巴：基础设置里有「启用 QQ 音乐音源」且说明"关掉就只用其它平台"',
      (() => {
        const f = unlockedSchemas.find((s) => s.field === 'qqEnabled')
        return Boolean(f) && /只用其它平台/.test(f.bottomHelpMessage || '')
      })(),
      true
    )
    // qqEnabled 是 **2.0 的开关**（"QQ 不是主营"是 2.0 才有的设定）：
    // 关着？？？时必须**看不见、也不生效**，否则"没开？？？ = 和 2.0 之前一样"就不成立
    v2Check(
      '锅巴：关着？？？时看不到「启用 QQ 音乐音源」（2.0 专属字段）',
      lockedSchemas.some((s) => s.field === 'qqEnabled'),
      false
    )
    v2Check(
      '行为：QQ 音源开关受闸门管（未解锁一律当"开着"，与 2.0 之前逐字一致）',
      (() => {
        const src = fs.readFileSync(path.join(pluginRoot, 'apps', 'song.js'), 'utf8')
        // 关键就是这一个判断：`isV2Unlocked(cfg) && !qqSourceEnabled(cfg)`
        // —— 少了前半句，老用户 yaml 里留着的 qqEnabled:false 会让点歌突然只搜外源
        const gated = /isV2Unlocked\(cfg\) && !qqSourceEnabled\(cfg\)/.test(src)
        const fallbacksUsePlatforms = (src.match(/standaloneSourceIds\(cfg\)\.length/g) || []).length >= 2
        return gated && fallbacksUsePlatforms && /pickAcrossPlatforms/.test(src)
      })(),
      true
    )
    v2Check(
      '跨平台兜底的门槛是"有没有可用平台"（未解锁 = 平台清单为空，1.x 行为不变）',
      V.standaloneSourceIds({ qqEnabled: false }).length === 0 &&
        V.standaloneSourceIds({ unlockV2: true, qqEnabled: false, platforms: {} }).length > 0,
      true
    )
    // ── 版本号也是 2.0 专属：解锁显示 2.0.x，未解锁与 2.0 之前逐字一致 ──
    {
      const U = await import('./utils/update.js')
      setCfg({ unlockV2: false })
      v2Check('版本：关着？？？显示老的包版本（v1.9.x，与 2.0 之前一样）', U.displayVersion(cfgNow()), `v${U.getLocalVersion()}`)
      v2Check('版本：关着时帮助卡上的版本号也是老的', HC.buildHelpCardData({}).version, `v${U.getLocalVersion()}`)
      v2Check('版本：关着时不会露出 2.0 的号', /^v1\./.test(U.displayVersion(cfgNow())), true)
      setCfg({ unlockV2: true })
      v2Check('版本：打开？？？显示 2.0 专属版本', U.displayVersion(cfgNow()), 'v2.0.0')
      v2Check('版本：2.0 帮助卡用的是展示版本', HC.buildGuideCardData({}).version, 'v2.0.0')
      v2Check(
        '版本：package.json 没被改成 2.0（更新器要比对包版本，改了就报"倒退"）',
        JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version,
        U.getLocalVersion()
      )
      setCfg({ unlockV2: true, platforms: {} })
    }
    // ── 2.0 是一套**新 UI**（多平台主题），且不能污染 1.9 ──
    {
      const T = await import('./utils/theme.js')
      v2Check('主题：1.9（未解锁）仍用 uiTheme', T.resolveTheme({ uiTheme: 'classic' }).id, 'classic')
      v2Check('主题：1.9 选了 apple 也照旧', T.resolveTheme({ uiTheme: 'apple' }).id, 'apple')
      v2Check('主题：2.0（解锁）默认用「星云」', T.resolveTheme({ uiTheme: 'classic', unlockV2: true }).id, 'nebula')
      v2Check('主题：2.0 里想用老皮肤可以显式选', T.resolveTheme({ unlockV2: true, uiThemeV2: 'apple' }).id, 'apple')
      v2Check('主题：2.0 主题名写错时回落 classic（不炸）', T.resolveTheme({ unlockV2: true, uiThemeV2: 'nosuch' }).id, 'classic')
      v2Check('主题：multi 已登记在主题清单里', T.listThemeIds().includes('multi'), true)
      const multiDir = path.join(pluginRoot, 'resources', 'themes', 'multi')
      // 内置主题（跟插件一起分发的这几套）**必须**把全部卡片都实现：缺一张就会在渲染时
      // 回落 classic —— 内容是这个主题的，皮肤却是经典绿，等于两套 UI 拼一起。
      // 2026-09-23 实测踩过：apple 缺 qqmusic-platform/platforms 两张 2.0 卡，
      // 于是 2.0 下切到苹果皮肤时，平台卡整套变成经典绿（断言当时只查了 multi，没拦住）。
      // 用户自己丢进来的主题**不在**这个断言里：按契约，第三方主题可以只实现部分卡片。
      const BUILTIN_THEMES = ['classic', 'apple', 'nebula', 'multi']
      v2Check(
        '主题：内置主题把全部卡片都实现了（缺一张就会回落 classic，看着像两套 UI 拼的）',
        BUILTIN_THEMES.every((id) =>
          T.CARDS.every((c) => fs.existsSync(path.join(pluginRoot, 'resources', 'themes', id, `${c}.html`)))
        ),
        true
      )
      v2Check(
        '主题：内置四套都在主题清单里（带 theme.json）',
        BUILTIN_THEMES.every((id) => T.listThemeIds().includes(id)),
        true
      )
      const dts = T.describeThemes()
      v2Check(
        '主题：每套主题都报出卡片总数（文案里的分母别写死 8 —— 卡片已从 8 涨到 11）',
        dts.length > 0 && dts.every((t) => t.cardsTotal === T.CARDS.length && t.cards <= t.cardsTotal),
        true
      )
      v2Check(
        '主题：支持自定义背景的不止 apple（2.0 的星云/多平台也支持）',
        dts.filter((t) => t.bg).map((t) => t.id).sort().join(','),
        'apple,multi,nebula'
      )
      // #qqm界面 的提示以前写死"仅 apple 支持背景"，切到 2.0 主题后就成了假话 —— 现在按主题能力算
      const adminSrc = fs.readFileSync(path.join(pluginRoot, 'apps', 'admin.js'), 'utf8')
      v2Check(
        '界面命令：背景提示按主题能力算（不写死 apple）',
        /const bgIds =/.test(adminSrc) && !/仅 apple 主题支持/.test(adminSrc),
        true
      )
      v2Check('主题：multi 有 theme.json（名称/深色/底色）', fs.existsSync(path.join(multiDir, 'theme.json')), true)
      // 复制模板最容易犯的错：模板里的 <link> 还指向**别的主题**的 _base.css
      // （实测踩过：multi 复制 apple 的 5 张卡，结果那 5 张套着苹果皮肤渲，等于两套 UI 拼一起）
      v2Check(
        '主题：每个模板只引用**自己**主题的 _base.css',
        (() => {
          for (const id of T.listThemeIds()) {
            const dir = path.join(pluginRoot, 'resources', 'themes', id)
            if (!fs.existsSync(dir)) continue
            for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
              const src = fs.readFileSync(path.join(dir, f), 'utf8')
              for (const m of src.matchAll(/resources\/themes\/([a-z0-9_-]+)\/_base\.css/g)) {
                if (m[1] !== id) return false
              }
            }
          }
          return true
        })(),
        true
      )

      // 预览夹具（scripts/preview-samples.mjs）与模板会**各自漂移**：模板里新写了
      // {{data.payInfo}}，夹具里没有这个键，art-template 就把空值原样画出去 ——
      // 星云详情卡那颗"空胶囊"就是这么来的（真机数据由 card-data.js 构建、字段齐全，
      // 所以只有预览在骗人，肉眼评审时还以为是主题画错了）。
      // 这里把漂移变成构建期报错：模板读的每个 data.X 都必须是该卡夹具的顶层键。
      const { samples: fixtures } = await import('./scripts/preview-samples.mjs')
      v2Check(
        '预览夹具：每张卡片都有夹具（没有就会从预览里整张消失）',
        T.CARDS.every((c) => fixtures[c] && typeof fixtures[c] === 'object'),
        true
      )
      v2Check(
        '预览夹具：模板读的每个 data 字段夹具里都有（缺了就是"预览画空、真机正常"）',
        (() => {
          for (const id of T.listThemeIds()) {
            const dir = path.join(pluginRoot, 'resources', 'themes', id)
            if (!fs.existsSync(dir)) continue
            for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
              const fix = fixtures[f.replace(/\.html$/, '')]
              if (!fix) continue
              const src = fs.readFileSync(path.join(dir, f), 'utf8')
              const used = new Set()
              for (const m of src.matchAll(/\bdata\s*\.\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1])
              for (const m of src.matchAll(/\bdata\s*\[\s*['"]([^'"]+)['"]\s*\]/g)) used.add(m[1])
              // 区分大小写：data.sourceShort 与 data.sourceshort 在 art-template 里是两个键
              for (const k of used) if (!(k in fix)) return false
            }
          }
          return true
        })(),
        true
      )

      // 详情卡的「付费/免费」徽章必须跟着 payplay 走。apple 以前写成
      // `{{if data.showPay || data.payplay}}付费曲{{/if}}` 而输出是**固定文案**，
      // 于是每一首（包括免登录就能播的外源曲）都被标成"付费曲" —— showPay 的语义是
      // "要不要显示这枚徽章"（MV 卡传 false），不是"这歌要付费"。
      // 这里不查模板源码，而是把模板真的渲出来看结果：预览与真机走的就是这条路径。
      const R = await import('./utils/render.js')
      const freeSong = fixtures['qqmusic-detail']
      const paidSong = { ...freeSong, payplay: true, payInfo: '会员' }
      const rendered = (data, id) =>
        fs.readFileSync(
          R.renderHtmlFile(data, 'qqmusic-detail', T.resolveTheme({ unlockV2: true, uiThemeV2: id })).outFile,
          'utf8'
          // 模板里的注释也带"付费/会员"这些字（说明文案），查正文前先剥掉
        ).replace(/<!--[\s\S]*?-->/g, '')
      v2Check(
        '详情卡：徽章跟着 payplay 走（免费曲不能被标成"付费"，会员曲也不能不标）',
        T.listThemeIds()
          .filter((id) => fs.existsSync(path.join(pluginRoot, 'resources', 'themes', id, 'qqmusic-detail.html')))
          .every((id) => {
            const free = rendered(freeSong, id)
            const paid = rendered(paidSong, id)
            return !/付费|会员/.test(free) && /付费|会员/.test(paid)
          }),
        true
      )
    }
    // ── 新 UI 依赖的数据（来源色标）必须由 builder 提供，否则模板只能画灰的 ──
    {
      const CD = await import('./utils/card-data.js')
      const mix = [
        { songmid: 'qq1', songName: '晴天', singerName: '周杰伦', payplay: true },
        { source: 'netease', songmid: 'ne_1', songName: '晴天(深情版)', singerName: 'Lucky小爱', quality: '128k', external: true },
        { source: 'bilibili', songmid: 'bi_1', songName: '【Hi-Res】晴天', singerName: 'VV', quality: '192k', external: true },
      ]
      const list = CD.buildListCardData('晴天', mix)
      v2Check('列表卡：每首歌带来源色/短名（模板据此上色）', [list.songs[0].sourceColor, list.songs[1].sourceColor, list.songs[1].sourceShort].join('|'), '#31c27c|#c62f2f|网易')
      v2Check('列表卡：按来源统计条数（头部彩色 chip）', list.sourceCounts.map((c) => `${c.label}${c.n}`).join(','), 'QQ1,网易云1,B站1')
      v2Check('列表卡：有外源时标记 hasExternal（页脚会多一句说明）', list.hasExternal, true)
      const detail = CD.buildDetailCardData(mix[1], { qualityLabel: '网易云 128k', source: '网易云 128k', hasUrl: true })
      v2Check('详情卡：来源色/是否外源也带上', [detail.sourceColor, detail.sourceShort, detail.sourceIsExternal].join('|'), '#c62f2f|网易|true')
      const guide = HC.buildGuideCardData({}, { currentSource: '当前音源：网易云' })
      v2Check('帮助卡：音源清单带 short/color/需凭据标记', (() => {
        const p = guide.sources.find((x) => x.id === 'netease')
        return p && p.short === '网易' && p.color === '#c62f2f' && p.needsCredential === false
      })(), true)
      v2Check('帮助卡：需要凭据的平台被标出来（酷狗/汽水/YouTube/Apple）', P.VISIBLE_PLATFORMS.filter((x) => x.needsCredential).every((x) => guide.sources.find((s) => s.id === x.id)?.needsCredential === true), true)
      v2Check('帮助卡：统计口径含 QQ（8 家外源 → 9 个可用音源）', guide.statPlatformsTotal, String(P.VISIBLE_PLATFORMS.length))
      v2Check('帮助卡：音质显示人话（不再出现 AUTO）', guide.statQuality, '自动')
    v2Check('帮助卡：默认每段最多 8 条（太长 QQ 里看不清），full 可展开', [HC.buildGuideCardData({ isMaster: true }).full, HC.buildGuideCardData({ isMaster: true }, { full: true }).full].join(','), 'false,true')
    }
    // ── 单平台状态卡（#qqm网易状态 / #qqm酷狗状态 …）──
    {
      const CD2 = await import('./utils/card-data.js')
      const fake = { list: [
        { name: 'netease', label: '网易云', kind: 'credential', canQr: true, loggedIn: true, source: 'user', sourceText: '自己那份', quality: '128k', owners: ['a'] },
        { name: 'qq', label: 'QQ音乐', kind: 'account', canQr: true, loggedIn: true, detail: { uin: '1152****' } },
        { name: 'bilibili', label: 'B站', kind: 'anonymous', quality: '192k' },
      ] }
      const one = CD2.buildPlatformCardData(fake, '网易云')
      v2Check('单平台卡：认中文别名（网易云 → netease 行）', [one.row.name, one.row.label, one.row.stateText].join('|'), 'netease|网易云|已登录')
      v2Check('单平台卡：命令清单齐（点歌/播放/歌词/设为当前音源/扫码登录/看全部平台）', one.commands.map((c) => c.name).join(','), '点歌,播放,歌词,设为当前音源,扫码登录,看全部平台')
      v2Check('单平台卡：最短写法在示例里（#qqm网易 关键词）', one.commands[0].example, '#qqm网易 关键词')
      v2Check('单平台卡：QQ 用 QQ 的命令写法', CD2.buildPlatformCardData(fake, 'qq').commands[0].example, '#qqm点歌 关键词')
      v2Check('单平台卡：匿名平台不给扫码命令', CD2.buildPlatformCardData(fake, 'bilibili').commands.every((c) => c.example !== '#qqmB站登录'), true)
      v2Check('单平台卡：认不出的平台回 null（不炸）', CD2.buildPlatformCardData(fake, 'nosuch'), null)
    }

    // ── 3 处一致性修复的回归（2026-09-23）──
    {
      const src = fs.readFileSync(path.join(pluginRoot, 'apps', 'song.js'), 'utf8')
      // ① 播放也要认「当前音源」：以前只有点歌认，用户设完音源去播放还是搜 QQ
      v2Check(
        '播放认当前音源（与点歌同口径）',
        /async playDirect\(e\)[\s\S]{0,2200}?currentSourceOf\(e, cfg\)/.test(src) && /playDirectOnPlatform\(e, cur\.p\.id, keyword, \{ viaSource: true \}\)/.test(src),
        true
      )
      // ② 歌词也吃平台前缀/当前音源
      v2Check('歌词认平台前缀与当前音源', /lyricPlat/.test(src) && /searchPlatformSongs\(key, lyricPlat\.id/.test(src), true)
      // ③ 当前音源按身份分作用域：主人写群键、成员写自己那份
      v2Check(
        '当前音源：主人设全群、成员只设自己（不会互相覆盖）',
        /function ownPrefScopeOf/.test(src) && /isMaster === true \|\| !uid \? group : `\$\{group\}:u:\$\{uid\}`/.test(src) && /prefScopesToRead/.test(src),
        true
      )
    }
    // 文本兜底（渲染失败时才看到）也要跟卡片一致：最短写法 + 提 #qqm源
    {
      const txt = HC.formatGuideText({ isMaster: true })
      v2Check('文本兜底：教最短写法（#qqm网易 关键词）而不是长写法', /#qqm网易 关键词/.test(txt) && !/#qqm网易云点歌/.test(txt), true)
      v2Check('文本兜底：提到当前音源 #qqm源', /#qqm源 网易/.test(txt), true)
      v2Check('文本兜底：不再写"QQ 音乐本体"（多平台后不是唯一主干）', !/QQ 音乐本体/.test(txt), true)
    }
    v2Check(
      '锅巴：段内不再有平台字段（都被分到各自页签了）',
      (() => {
        const basic = unlockedSchemas.slice(0, unlockedSchemas.findIndex((s) => s.component === 'SOFT_GROUP_BEGIN' && /界面与外观/.test(s.label || '')))
        return basic.some((s) => String(s.field || '').startsWith('platforms.'))
      })(),
      false
    )
    v2Check(
      '锅巴：老字段一个没少（重构只分组、不动字段）',
      ['apiBase', 'apiToken', 'quality', 'uiTheme', 'maxList', 'sendVocal', 'togetherEnable', 'extraSources', 'defaultPickSong'].every((f) =>
        unlockedSchemas.some((s) => s.field === f)
      ),
      true
    )
    v2Check(
      '锅巴：平台页签标题带上"免登录档位"（选哪家时心里有数）',
      P.VISIBLE_PLATFORMS.filter((p) => !p.own).every((p) => unlockedSchemas.some((s) => s.component === 'Divider' && String(s.label || '').includes(`${p.label} · 免登录 ${p.quality}`))),
      true
    )
    v2Check(
      '锅巴：分组用 R 插件同款写法（label + SOFT_GROUP_BEGIN）',
      unlockedSchemas.filter((s) => s.component === 'SOFT_GROUP_BEGIN').every((s) => typeof s.label === 'string' && s.label),
      true
    )

    // ── 单平台开关 ──
    setCfg({ unlockV2: true, platforms: { kuwo: { enabled: false } } })
    v2Check('平台开关：关掉酷我后它不在可用清单', V.enabledPlatforms(cfgNow()).some((p) => p.id === 'kuwo'), false)
    const quoted = []
    const offHandled = await new qqmusicSong().pickSongPlatform({
      msg: '#qqm酷我点歌 晴天',
      reply: async (t) => quoted.push(t),
    })
    v2Check('平台开关：关掉的平台点歌会明说（不是静默失败）', offHandled === true && /已被关闭/.test(quoted.join('')), true)
    v2Check('平台开关：maxList 留空时回落全局', V.platformMaxList({ maxList: 7 }, 'netease'), 7)
    v2Check('平台开关：maxList 有值时用它（上限 20）', V.platformMaxList({ maxList: 7, platforms: { netease: { maxList: 50 } } }, 'netease'), 20)

    // ── 2.0 帮助 ──
    setCfg({ unlockV2: true, platforms: {} })
    const guide = HC.buildGuideCardData({})
    v2Check('2.0 帮助：第一段是"多平台音源"且带彩条数据', guide.sections[0].title === '多平台音源' && Array.isArray(guide.sections[0].platforms), true)
    v2Check('2.0 帮助：统计里的平台数与实际一致', guide.statPlatforms, String(V.enabledPlatforms(cfgNow()).length))
    // 文本兜底跟着卡片改成了**最短写法**（`#qqm网易 关键词`），断言同步
    v2Check('2.0 帮助：文本兜底含平台命令（最短写法）', /#qqm网易 关键词/.test(HC.formatGuideText({})), true)
    v2Check('2.0 帮助：非主人看不到主人段', guide.sections.every((s) => s.title !== '主人管理'), true)
    v2Check('2.0 帮助：主人能看到主人段', HC.buildGuideCardData({ isMaster: true }).sections.some((s) => s.title === '主人管理'), true)
    const k1 = R.guideCacheKey(guide, 'classic')
    v2Check('帮助缓存：同输入稳定命中', k1 === R.guideCacheKey(HC.buildGuideCardData({}), 'classic'), true)
    v2Check('帮助缓存：换主题就换键（别发过期图）', k1 !== R.guideCacheKey(guide, 'apple'), true)
    setCfg({ uiTheme: 'apple' })
    v2Check('帮助缓存：改配置就换键', k1 !== R.guideCacheKey(guide, 'classic'), true)
    v2Check('模板就位：两个主题都有 2.0 帮助模板', ['classic', 'apple'].every((t) => fs.existsSync(path.join(pluginRoot, 'resources', 'themes', t, 'qqmusic-guide.html'))), true)
    v2Check('模板已登记（theme.js 的 CARDS）', (await import('./utils/theme.js')).CARDS.includes('qqmusic-guide'), true)

    // ── 配置读写：嵌套字段 ──
    setCfg({ unlockV2: true, platforms: {} })
    await setConfigData({ 'platforms.netease.enabled': false, 'platforms.kuwo.maxList': 5, unlockV2: true }, {})
    const saved = cfgNow()
    v2Check('保存：嵌套开关落成对象', saved.platforms?.netease?.enabled, false)
    v2Check('保存：条数按数字存', Number(saved.platforms?.kuwo?.maxList), 5)
    v2Check('保存：不产生 "platforms.x.y" 这种字面量键（开关会"弹回去"的元凶）', Object.keys(saved).some((k) => k.includes('.')), false)
    await setConfigData({ 'platforms.kuwo.maxList': '' }, {})
    v2Check('保存：条数留空 → 删键（跟随全局）', cfgNow().platforms?.kuwo?.maxList, undefined)
    // 页签里的开关/条数：与老配置同一个存储路径（platforms.<平台>.enabled / maxList）
    setCfg({ unlockV2: true, platforms: {} })
    await setConfigData({ 'platforms.netease.enabled': true, 'platforms.kuwo.enabled': false, 'platforms.bilibili.maxList': 6 }, {})
    v2Check('保存：页签里的开关落成 platforms.<平台>.enabled', [cfgNow().platforms?.netease?.enabled, cfgNow().platforms?.kuwo?.enabled].join(','), 'true,false')
    v2Check('保存：关掉的那家从可用清单里消失', V.enabledPlatforms(cfgNow()).some((p) => p.id === 'kuwo'), false)
    v2Check('保存：页签里的条数生效', V.platformMaxList(cfgNow(), 'bilibili'), 6)
    await setConfigData({ evil: 1, 'evil.key': 1 }, {})
    v2Check('保存：非白名单字段不落盘', cfgNow().evil, undefined)
  } catch (err) {
    allPassed = false
    v2Bad++
    console.log(`❌ 2.0 抽查异常: ${err.message}`)
  } finally {
    restoreCfg()
  }
}

console.log(
    `\n=== 测试结果: ${allPassed ? '全部通过 ✅' : '有失败 ❌'} ===` +
    `\n命令路由 ${routeOk} 通过 / ${routeBad} 失败` +
    `\n纯函数 ${pureOk} 通过 / ${pureBad} 失败` +
    `\n2.0（平台 + ？？？）${v2Ok} 通过 / ${v2Bad} 失败`
)
process.exit(allPassed ? 0 : 1)
