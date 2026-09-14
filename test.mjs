// Miao-Yunzai 插件功能测试脚本
import { loadPluginBase } from './utils/plugin-base.js'
await loadPluginBase()

import { qqmusicChart } from './apps/chart.js'
import { qqmusicExplore } from './apps/explore.js'
import { qqmusicLogin } from './apps/login.js'
import { qqmusicResolve } from './apps/resolve.js'
import { qqmusicSong } from './apps/song.js'
import { qqmusicAdmin } from './apps/admin.js'

console.log('=== QQ音乐插件功能测试 ===\n')

const modules = [
  { name: '排行榜/推荐/电台', class: qqmusicChart },
  { name: '歌手/专辑/歌单/评论', class: qqmusicExplore },
  { name: '扫码登录', class: qqmusicLogin },
  { name: '解析', class: qqmusicResolve },
  { name: '点歌', class: qqmusicSong },
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
  ['#qqm登录微信', 'startQrLogin'], // 微信走 App 扫码通道
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
const negative = ['#qqm点歌', '#qqm听0', '#qqm', '#qqm不存在']

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

console.log(
  `\n=== 测试结果: ${allPassed ? '全部通过 ✅' : '有失败 ❌'} ===` +
    `\n命令路由 ${routeOk} 通过 / ${routeBad} 失败`
)
process.exit(allPassed ? 0 : 1)
