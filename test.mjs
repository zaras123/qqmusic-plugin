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

// 测试每个模块的类是否正确加载
const modules = [
  { name: '排行榜/推荐/电台', class: qqmusicChart },
  { name: '歌手/专辑/歌单/评论', class: qqmusicExplore },
  { name: '扫码登录', class: qqmusicLogin },
  { name: '解析', class: qqmusicResolve },
  { name: '点歌', class: qqmusicSong },
  { name: '管理', class: qqmusicAdmin },
]

let allPassed = true

for (const mod of modules) {
  try {
    const instance = new mod.class()
    console.log(`✅ ${mod.name}: ${instance.name} (priority: ${instance.priority})`)
  } catch (err) {
    console.error(`❌ ${mod.name}: ${err.message}`)
    allPassed = false
  }
}

console.log('\n=== 规则测试 ===\n')

// 测试正则匹配
const testCases = [
  { reg: /^#?(qq|QQ)m\s*排行\s*(.*)$/, input: '#qqm排行 飙升榜', expected: true },
  { reg: /^#?(qq|QQ)m\s*推荐$/, input: '#qqm推荐', expected: true },
  { reg: /^#?(qq|QQ)m\s*(来首歌|随机|放一首|来一首)$/, input: '#qqm来首歌', expected: true },
  { reg: /^#?(qq|QQ)m\s*电台$/, input: '#qqm电台', expected: true },
  { reg: /^#?(qq|QQ)m\s*(日推|每日推荐)$/, input: '#qqm日推', expected: true },
  { reg: /^#?(qq|QQ)m\s*收藏$/, input: '#qqm收藏', expected: true },
  { reg: /^#?(qq|QQ)m\s*歌手\s+(.+)$/, input: '#qqm歌手 周杰伦', expected: true },
  { reg: /^#?(qq|QQ)m\s*专辑\s+(.+)$/, input: '#qqm专辑 叶惠美', expected: true },
  { reg: /^#?(qq|QQ)m\s*歌单\s+(.+)$/, input: '#qqm歌单 华语流行', expected: true },
  { reg: /^#?(qq|QQ)m\s*评论\s+(.+)$/, input: '#qqm评论 晴天', expected: true },
  { reg: /^#?(?:qq|QQ)m\s*点歌\s*(.+)$/, input: '#qqm点歌 晴天', expected: true },
  { reg: /^#?(?:qq|QQ)m\s*听\s*([1-9][0-9]?)$|^#听\s*([1-9][0-9]?)$/, input: '#qqm听1', expected: true },
  { reg: /^#?(?:qq|QQ)m\s*播放\s*(.+)$/, input: '#qqm播放 晴天', expected: true },
]

for (const tc of testCases) {
  const match = tc.input.match(tc.reg)
  const passed = tc.expected ? match : !match
  console.log(`${passed ? '✅' : '❌'} ${tc.input} -> ${match ? '匹配' : '不匹配'}`)
  if (!passed) allPassed = false
}

console.log(`\n=== 测试结果: ${allPassed ? '全部通过 ✅' : '有失败 ❌'} ===`)
