/**
 * 听歌统计单测：`node --test scripts/test-stats.mjs`
 *
 * 全是纯函数 + 内存态断言，不需要 Yunzai / 不需要 API（统计这块本来就是本地的）。
 * ⚠️ 必须在 **import utils/stats.js 之前**设好 QQMUSIC_STATS_FILE —— 那个模块在顶层
 *    就把落盘路径定下来了，import 之后再改等于没改（会写到真实的 data/ 里去）。
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqm-stats-'))
process.env.QQMUSIC_STATS_FILE = path.join(tmpDir, 'stats.json')

const S = await import('../utils/stats.js')
const C = await import('../utils/command.js')

/** 测试里一律用固定时间，别让"今天"跟着机器时间漂 */
const at = (iso) => Date.parse(iso)
const DAY = '2026-10-17T04:00:00Z' // 东八区 2026-10-17 12:00

test('切天按东八区，不跟机器时区走', () => {
  // UTC 16:30 已经是东八区的次日 00:30
  assert.equal(S.dayKeyOf(at('2026-10-16T16:30:00Z')), '2026-10-17')
  // UTC 15:59 还是东八区的当天 23:59
  assert.equal(S.dayKeyOf(at('2026-10-16T15:59:59Z')), '2026-10-16')
})

test('天序号与日期字符串可以往返，差值就是天数', () => {
  assert.equal(S.dayKeyFromIndex(S.dayIndexOf('2026-10-17')), '2026-10-17')
  assert.equal(S.dayIndexOf('2026-10-17') - S.dayIndexOf('2026-10-16'), 1)
  // 跨月/跨年也要对
  assert.equal(S.dayIndexOf('2026-01-01') - S.dayIndexOf('2025-12-31'), 1)
  assert.equal(S.dayKeyFromIndex(S.dayIndexOf('2026-10-17') - 6), '2026-10-11')
})

test('单曲时长：interval 优先，兜底到 durationSec / mm:ss / h:mm:ss', () => {
  assert.equal(S.durationSecOf({ interval: 215 }), 215)
  assert.equal(S.durationSecOf({ durationSec: 180 }), 180)
  assert.equal(S.durationSecOf({ duration: '03:20' }), 200)
  assert.equal(S.durationSecOf({ duration: '1:03:20' }), 3600) // h:mm:ss 也认，但照样 1 小时封顶
  // 电台那种整轨按 1 小时封顶，脏数据不至于把总时长顶飞
  assert.equal(S.durationSecOf({ interval: 999999 }), 3600)
  // 拿不到就不编：计 0 秒（播放次数照记）
  assert.equal(S.durationSecOf({}), 0)
  assert.equal(S.durationSecOf({ interval: 'abc', duration: '哈哈' }), 0)
  assert.equal(S.durationSecOf(null), 0)
})

test('平台：QQ 本体没有 source 字段，记成 qq', () => {
  assert.equal(S.platformOf({}), 'qq')
  assert.equal(S.platformOf({ source: 'Netease' }), 'netease')
  assert.equal(S.platformOf({ source: ' kugou ' }), 'kugou')
})

test('账本 scope：群聊记群，私聊记人，两类不混', () => {
  assert.equal(S.scopeOf({ group_id: 123, user_id: 456 }), 'g123')
  assert.equal(S.scopeOf({ user_id: 456 }), 'p456')
  assert.equal(S.scopeOf({}), '')
})

test('配置归一：默认全开、60 天、100 人', () => {
  assert.deepEqual(S.statsConfig({}), { enable: true, keepDays: 60, maxUsersPerGroup: 100 })
  assert.equal(S.statsConfig({ statsEnable: false }).enable, false)
  assert.equal(S.statsConfig({ statsKeepDays: 0 }).keepDays, 1) // 0 是非法值，夹到下限
  assert.equal(S.statsConfig({ statsKeepDays: 'x' }).keepDays, 60)
  assert.equal(S.statsConfig({ statsMaxUsersPerGroup: 99999 }).maxUsersPerGroup, 5000)
})

test('记一笔就有账：今日 / 近 7 天 / 累计 / 常听歌手都对', () => {
  S.resetStats()
  const song = { interval: 240, singerName: '周杰伦', source: '' }
  S.recordPlay({ groupId: 'g1', userId: 'u1', name: '小明', song, at: at(DAY) })
  S.recordPlay({ groupId: 'g1', userId: 'u1', name: '小明', song: { interval: 120, singerName: '周杰伦', source: 'netease' }, at: at('2026-10-15T04:00:00Z') })

  const s = S.statsOf('g1', 'u1', { now: at(DAY) })
  assert.equal(s.name, '小明')
  assert.equal(s.sec, 360)
  assert.equal(s.plays, 2)
  assert.equal(s.todaySec, 240)
  assert.equal(s.todayPlays, 1)
  assert.equal(s.weekSec, 360) // 10-15 与 10-17 都在近 7 天里
  assert.equal(s.weekPlays, 2)
  assert.equal(s.activeDays, 2)
  assert.deepEqual(s.topSingers, [{ name: '周杰伦', value: 2 }])
  // 平台按时长分：QQ 240s、网易云 120s
  assert.deepEqual(s.platforms, [
    { name: 'qq', value: 240 },
    { name: 'netease', value: 120 },
  ])
  // 没记过的人返回 null（命令据此提示"先点一首"）
  assert.equal(S.statsOf('g1', 'u404', { now: at(DAY) }), null)
  assert.equal(S.statsOf('g404', 'u1', { now: at(DAY) }), null)
})

test('连续天数：今天还没听不算断', () => {
  S.resetStats()
  const song = { interval: 60, singerName: 'A' }
  for (const iso of ['2026-10-15T04:00:00Z', '2026-10-16T04:00:00Z', '2026-10-17T04:00:00Z']) {
    S.recordPlay({ groupId: 'g2', userId: 'u1', song, at: at(iso) })
  }
  // 当天：连 3 天
  assert.equal(S.statsOf('g2', 'u1', { now: at(DAY) }).streak, 3)
  // 次日还没听：仍然是 3（从昨天往回数），不能一夜归零
  assert.equal(S.statsOf('g2', 'u1', { now: at('2026-10-18T04:00:00Z') }).streak, 3)
  // 后天还没听：断了
  assert.equal(S.statsOf('g2', 'u1', { now: at('2026-10-19T04:00:00Z') }).streak, 0)
})

test('群榜三个口径：今日只算今天，本周算近 7 天，总榜算累计', () => {
  S.resetStats()
  const song = (sec) => ({ interval: sec, singerName: 'X' })
  S.recordPlay({ groupId: 'gb', userId: 'a', name: '甲', song: song(600), at: at('2026-10-17T04:00:00Z') })
  S.recordPlay({ groupId: 'gb', userId: 'b', name: '乙', song: song(300), at: at('2026-10-17T05:00:00Z') })
  // 10-01 的老记录：今天/本周都该看不见，但总榜要算
  S.recordPlay({ groupId: 'gb', userId: 'c', name: '丙', song: song(900), at: at('2026-10-01T04:00:00Z') })

  const now = { now: at('2026-10-17T06:00:00Z') }
  assert.deepEqual(
    S.groupBoard('gb', 'today', now).map((r) => r.userId),
    ['a', 'b']
  )
  // 本周（近 7 天）把 10-01 排除在外，只剩甲乙
  assert.deepEqual(
    S.groupBoard('gb', 'week', now).map((r) => r.userId),
    ['a', 'b']
  )
  // 总榜按累计时长排：丙 900 > 甲 600 > 乙 300
  assert.deepEqual(
    S.groupBoard('gb', 'total', { ...now, limit: 10 }).map((r) => r.userId),
    ['c', 'a', 'b']
  )
  assert.equal(S.groupBoard('gb', 'total', { ...now, limit: 1 }).length, 1)
  assert.deepEqual(S.groupBoard('g-empty', 'total', now), [])
})

test('落盘 + 重载：重启后账还在', () => {
  S.resetStats()
  S.recordPlay({ groupId: 'gp', userId: 'u1', name: '小明', song: { interval: 300, singerName: 'A' }, at: at(DAY) })
  // 平时是合并写（5s），测试里立刻落盘再丢内存态 = 模拟重启
  S.flushStats()
  assert.ok(fs.existsSync(S.statsFilePath()))
  S.reloadStats()
  const s = S.statsOf('gp', 'u1', { now: at(DAY) })
  assert.equal(s.sec, 300)
  assert.equal(s.plays, 1)
  assert.equal(s.name, '小明')
})

test('保留天数：只裁剪日粒度，累计时长不受影响', () => {
  S.resetStats()
  const song = { interval: 60, singerName: 'A' }
  const opt = { keepDays: 30 }
  // 100 天前的记录 + 今天的记录，保留 30 天
  S.recordPlay({ groupId: 'gk', userId: 'u1', song, at: at('2026-07-09T04:00:00Z') }, opt)
  S.recordPlay({ groupId: 'gk', userId: 'u1', song, at: at(DAY) }, opt)

  const s = S.statsOf('gk', 'u1', { now: at(DAY) })
  assert.equal(s.sec, 120) // 累计照旧
  assert.equal(s.weekSec, 60) // 老的那天已经不在日粒度里了
  assert.equal(s.activeDays, 1)
  assert.equal(s.streak, 1)
})

test('人数上限：先丢最久没点歌的那个人', () => {
  S.resetStats()
  const song = { interval: 60, singerName: 'A' }
  // ⚠️ maxUsersPerGroup 是**第二个参数**（配置），不是 payload 里的字段
  const opt = { maxUsersPerGroup: 2 }
  S.recordPlay({ groupId: 'gu', userId: 'u1', song, at: at('2026-10-10T04:00:00Z') }, opt)
  S.recordPlay({ groupId: 'gu', userId: 'u2', song, at: at('2026-10-15T04:00:00Z') }, opt)
  S.recordPlay({ groupId: 'gu', userId: 'u3', song, at: at('2026-10-17T04:00:00Z') }, opt)

  assert.equal(S.statsOf('gu', 'u1', { now: at(DAY) }), null) // 最久没出现的被顶掉
  assert.ok(S.statsOf('gu', 'u2', { now: at(DAY) }))
  assert.ok(S.statsOf('gu', 'u3', { now: at(DAY) }))
})

test('记一笔永远不抛：脏输入只返回 false', () => {
  S.resetStats()
  assert.equal(S.recordPlay(), false)
  assert.equal(S.recordPlay(null), false)
  assert.equal(S.recordPlay({ groupId: '', userId: 'u1' }), false)
  assert.equal(S.recordPlay({ groupId: 'g1', userId: '' }), false)
  // 时长拿不到也照样记（0 秒），只是不编数字
  assert.equal(S.recordPlay({ groupId: 'g1', userId: 'u1', song: null, at: at(DAY) }), true)
  assert.equal(S.statsOf('g1', 'u1', { now: at(DAY) }).todayPlays, 1)
  assert.equal(S.statsOf('g1', 'u1', { now: at(DAY) }).todaySec, 0)
})

test('时长的写法分档：秒 / 分秒 / 小时分', () => {
  assert.equal(S.formatDuration(0), '0 秒')
  assert.equal(S.formatDuration(45), '45 秒')
  assert.equal(S.formatDuration(200), '3 分 20 秒')
  assert.equal(S.formatDuration(180), '3 分')
  assert.equal(S.formatDuration(3600), '1 小时')
  assert.equal(S.formatDuration(3600 + 7 * 60), '1 小时 7 分')
})

test('个人统计文案：数字、常听歌手、平台分布都在', () => {
  const text = S.formatPersonalStats({
    sec: 3900,
    weekSec: 600,
    todaySec: 120,
    plays: 8,
    todayPlays: 2,
    weekPlays: 4,
    streak: 3,
    activeDays: 5,
    topSingers: [{ name: '周杰伦', value: 5 }],
    platforms: [
      { name: 'qq', value: 3600 },
      { name: 'netease', value: 300 },
    ],
  })
  assert.match(text, /累计 1 小时 5 分 · 近 7 天 10 分 · 今天 2 分/)
  assert.match(text, /点播：8 首（今天 2 首 · 近 7 天 4 首）/)
  assert.match(text, /连续：3 天 · 有记录 5 天/)
  assert.match(text, /常听：周杰伦 ×5/)
  // QQ 本体没有 source 字段 → 展示名不能是光秃秃的 "qq"
  assert.match(text, /平台：QQ音乐 1 小时 · 网易云 5 分/)
  // 空对象也不能炸（读不到某个字段就按 0 走）
  assert.match(S.formatPersonalStats({}), /累计 0 秒/)
})

test('群榜文案：序号、时长、首数；没名字用 QQ 号后四位兜底', () => {
  const text = S.formatBoardText([{ userId: '10086', name: '小明', sec: 3600, plays: 12 }], '本周')
  assert.match(text, /【本群听歌榜 · 本周】/)
  assert.match(text, /1\. 小明 1 小时（12 首）/)
  assert.match(S.formatBoardText([{ userId: '10086', name: '', sec: 60, plays: 1 }]), /QQ0086/)
})

test('听歌统计命令：形状对，且不吃「#qqm听N」那句点歌', () => {
  const my = (s) => C.RE_MY_STATS.test(s)
  const bd = (s) => C.RE_STATS_BOARD.test(s)

  assert.ok(my('#qqm听歌'))
  assert.ok(my('QQm听歌统计'))
  assert.ok(my('#qqm 听歌 我的'))
  assert.ok(!my('#qqm听1'))
  assert.ok(!my('#qqm听歌榜')) // 可选的"统计/我的"匹配不上"榜"，别把榜单命令吃掉
  assert.ok(!my('#qqm听歌 榜'))

  assert.ok(bd('#qqm听歌榜'))
  assert.ok(bd('#qqm听歌榜 本周'))
  assert.ok(bd('#qqm听歌 榜 今日'))
  assert.ok(bd('#qqm听歌排行本周'))
  assert.ok(!bd('#qqm听歌'))
  assert.ok(!bd('#qqm听1'))
  // handler 读 m[1] 取口径 —— 规则与解析必须同源，这里把形状钉住
  assert.equal('#qqm听歌榜 本周'.match(C.RE_STATS_BOARD)[1], '本周')
  assert.equal('#qqm听歌榜'.match(C.RE_STATS_BOARD)[1], undefined)
})

test('这两条命令不会被点歌规则当成"搜关键词"抢走', () => {
  assert.deepEqual(C.parseSongCmd('#qqm听歌'), { plat: '', verb: '', keyword: '' })
  assert.deepEqual(C.parseSongCmd('#qqm听歌榜 本周'), { plat: '', verb: '', keyword: '' })
})

test('apps/stats.js 只导出一个插件类（多导出会让加载器认错插件）', () => {
  const src = fs.readFileSync(new URL('../apps/stats.js', import.meta.url), 'utf8')
  const names = [
    ...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:class|const|let|function)\s+([A-Za-z0-9_$]+)?/gm),
  ].map((m) => m[1] || 'default')
  assert.deepEqual(names, ['qqmusicStats'])
})

after(() => {
  S.resetStats()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})
