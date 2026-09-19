// Miao-Yunzai 插件功能测试脚本
import { loadPluginBase } from './utils/plugin-base.js'
await loadPluginBase()

import { qqmusicChart } from './apps/chart.js'
import { qqmusicExplore } from './apps/explore.js'
import { qqmusicLogin } from './apps/login.js'
import { qqmusicResolve } from './apps/resolve.js'
import { qqmusicSong } from './apps/song.js'
import { qqmusicTogether } from './apps/together.js'
import { qqmusicAdmin } from './apps/admin.js'

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
  const { togetherAdapter, togetherGate } = await import('./utils/together.js')
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
