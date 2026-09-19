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
  ['#qqm点歌 晴天', 'pickSong'],
  ['#qqm 点歌 晴天', 'pickSong'],
  ['#点歌 晴天', 'pickSongDefault'], // 无前缀：锅巴开关关着时该 handler 返回 false 放行
  ['#qqm听1', 'chooseSong'],
  ['#听3', 'chooseSong'],
  ['#qqm播放 晴天', 'playDirect'],
  ['#qqm歌词 晴天', 'getLyric'],
  ['#qqm歌词1', 'getLyric'],
  ['#qqm热搜', 'hotSearch'],
  ['#qqm帮助', 'help'],
  ['#qm帮助', 'help'],
  // 一起听（全员两条 + 主人探测一条；全员必须排在 master 之前，见 apps/together.js 注释）
  ['#qqm一起听 1', 'togetherPick'],
  ['#qqm一起听5', 'togetherPick'],
  ['#qqm一起听 状态', 'togetherState'],
  ['#qqm一起听 探测', 'togetherProbe'],
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
const negative = ['#qqm点歌', '#qqm听0', '#qqm', '#qqm不存在', '#qqm一起听', '#qqm一起听0', '#qqm一起听 全部']

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

console.log(
  `\n=== 测试结果: ${allPassed ? '全部通过 ✅' : '有失败 ❌'} ===` +
    `\n命令路由 ${routeOk} 通过 / ${routeBad} 失败` +
    `\n纯函数 ${pureOk} 通过 / ${pureBad} 失败`
)
process.exit(allPassed ? 0 : 1)
