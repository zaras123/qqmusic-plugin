/**
 * 勋章进度单测：`node --test scripts/test-medal.mjs`
 *
 * 全是纯函数断言：解析、错误码映射、文案。**不打网络、不需要 Karin / API** ——
 * 上游那两个方法要登录才有数据，这里就把「各形状的响应」直接喂给文案层。
 *
 * ⚠️ utils/medal.js 会 import utils/stats.js（共用 formatDuration），后者在顶层就把
 *    落盘路径定下来了。所以必须先设 QQMUSIC_STATS_FILE 再 import，别写到真实 data/。
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqm-medal-'))
process.env.QQMUSIC_STATS_FILE = path.join(tmpDir, 'stats.json')

const M = await import('../utils/medal.js')
const C = await import('../utils/command.js')

test('配置归一：默认开、活动 ID 缺省空、去首尾空白', () => {
  assert.deepEqual(M.medalConfig({}), { enable: true, actID: '', timeout: 15000 })
  assert.equal(M.medalConfig({ medalEnable: false }).enable, false)
  assert.equal(M.medalConfig({ medalActID: '  2025 ' }).actID, '2025')
  assert.equal(M.medalConfig({ medalActID: null }).actID, '')
})

test('cgi 代理的响应形状：req_0 在 body.data，拿不到就给空对象', () => {
  assert.deepEqual(M.cgiPayload({ result: 100, data: { code: 0, data: { a: 1 } } }), { code: 0, data: { a: 1 } })
  assert.deepEqual(M.cgiPayload({ result: 100 }), {})
  assert.deepEqual(M.cgiPayload(null), {})
  assert.deepEqual(M.cgiPayload({ data: 'x' }), {})
})

test('上游码 → 人话：匿名探测校准出来的那几个都认', () => {
  assert.equal(M.describeMedalCode(0), '')
  assert.equal(M.describeMedalCode(undefined), '')
  assert.match(M.describeMedalCode(1000), /需要登录/)
  assert.match(M.describeMedalCode(100032), /缺活动 ID/)
  assert.match(M.describeMedalCode(100002), /活动 ID 无效/)
  assert.match(M.describeMedalCode(10006), /活动 ID 无效/)
  assert.match(M.describeMedalCode(500003), /不认这个方法/)
  assert.match(M.describeMedalCode(40000), /不认这个模块/)
  // 2026-10-18 线上实测：登录态下时长查询回 10007，不能再说成"需要登录"
  assert.match(M.describeMedalCode(10007), /code=10007/)
  assert.doesNotMatch(M.describeMedalCode(10007), /需要登录：先/)
  // 认不出的码要把平台原话带上，别把裸 code 当成功
  assert.match(M.describeMedalCode(12345, '系统繁忙'), /code=12345.*系统繁忙/)
  assert.match(M.describeMedalCode(12345), /code=12345/)
})

test('没配活动 ID 时任务查询不打上游，直接给"缺 ID"', async () => {
  // 没有网络也会立刻返回：函数在请求之前就短路了
  const r = await M.fetchMedalTasks('')
  assert.equal(Number(r.code), 100032)
  assert.match(String(r.data.retMsg), /活动ID不能为空/)
  const r2 = await M.fetchMedalTasks('   ')
  assert.equal(Number(r2.code), 100032)
})

test('铺平标量：对象往下走，数组只报长度，深度与条数封顶', () => {
  assert.deepEqual(M.flattenScalars({ a: 1, b: 'x' }), [
    { key: 'a', value: 1 },
    { key: 'b', value: 'x' },
  ])
  assert.deepEqual(M.flattenScalars({ n: { m: 2 } }), [{ key: 'n.m', value: 2 }])
  assert.deepEqual(M.flattenScalars({ list: [1, 2, 3] }), [{ key: 'list[]', value: '3 项' }])
  // 空数组不占位
  assert.deepEqual(M.flattenScalars({ list: [] }), [])
  // 超过 max 就截断
  assert.equal(M.flattenScalars({ a: 1, b: 2, c: 3 }, { max: 2 }).length, 2)
  assert.deepEqual(M.flattenScalars(null), [])
  assert.deepEqual(M.flattenScalars({}), [])
})

test('听歌时长段：未登录只回一句"需要登录"，不编数字', () => {
  const lines = M.formatListeningSection({ code: 1000, data: {} })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /需要登录/)
  assert.doesNotMatch(lines.join('\n'), /\d+\s*(秒|分|小时)/)
})

test('听歌时长段：认得出的字段按人话排（秒转时长）', () => {
  const lines = M.formatListeningSection({
    code: 0,
    data: { totalListenTime: 3900, todayListenTime: 120, listenDays: 12, listenSongs: 88, level: 7 },
  })
  const text = lines.join('\n')
  assert.match(text, /累计听歌时长：1 小时 5 分/)
  assert.match(text, /今日听歌时长：2 分/)
  assert.match(text, /累计听歌天数：12/)
  assert.match(text, /累计听歌首数：88/)
  assert.match(text, /听歌等级：7/)
})

test('听歌时长段：字段名全不认识时把平台返回的照实列出来，别留空白', () => {
  const lines = M.formatListeningSection({ code: 0, data: { unknownSec: 300, someFlag: true } })
  const text = lines.join('\n')
  assert.match(text, /其它字段：/)
  assert.match(text, /unknownSec=300/)
  assert.match(text, /someFlag=true/)
})

test('听歌时长段：平台返回空数据时明说"没有进度字段"', () => {
  assert.match(M.formatListeningSection({ code: 0, data: {} }).join('\n'), /没有返回进度字段/)
  assert.match(M.formatListeningSection({}).join('\n'), /没有返回进度字段/)
})

test('任务行：进度/目标/完成标记，字段名多套写法都认', () => {
  assert.equal(M.taskLineOf({ taskName: '听歌 30 分钟', progress: 12, target: 30 }, 0), '1. 听歌 30 分钟 12/30')
  assert.equal(M.taskLineOf({ name: '签到', current: 1, total: 1, status: 1 }, 1), '2. 签到 1/1 ✅')
  assert.equal(M.taskLineOf({ title: '分享', doneNum: 3, needCount: 5 }, 2), '3. 分享 3/5')
  // 什么都没有也不能炸，给个占位名
  assert.equal(M.taskLineOf({}, 3), '4. 任务 4')
  assert.equal(M.taskLineOf(null, 0), '1. 任务 1')
})

test('任务段：缺活动 ID / 空列表 / 有任务三种形状', () => {
  assert.match(M.formatTaskSection({ code: 100032, data: { retMsg: '活动ID不能为空喔~' } }).join('\n'), /缺活动 ID/)
  assert.match(M.formatTaskSection({ code: 0, data: {} }).join('\n'), /没有返回任务列表/)
  const lines = M.formatTaskSection({
    code: 0,
    data: { taskList: [{ taskName: '听歌 1 小时', progress: 20, target: 60 }, { name: '分享歌曲', status: 1, current: 1, total: 1 }] },
  })
  assert.equal(lines.length, 2)
  assert.match(lines[0], /听歌 1 小时 20\/60/)
  assert.match(lines[1], /分享歌曲 1\/1 ✅/)
})

test('任务列表收集：数组、单个对象、空对象都按真实形状处理', () => {
  const arr = [{ Name: 'A' }]
  assert.deepEqual(M.collectTaskList({ taskList: arr }), arr)
  assert.deepEqual(M.collectTaskList({ tasks: arr }), arr)
  assert.deepEqual(M.collectTaskList({ actTaskInfo: arr[0] }), [arr[0]])
  assert.deepEqual(M.collectTaskList({ taskInfo: { Name: 'B' } }), [{ Name: 'B' }])
  assert.deepEqual(M.collectTaskList({ actTaskInfo: {} }), [])
  assert.deepEqual(M.collectTaskList({}), [])
  assert.deepEqual(M.collectTaskList(null), [])
})

test('播放页真实形状：data.actTaskInfo 是单对象，字段大写开头也要显示', () => {
  const lines = M.formatTaskSection({
    code: 0,
    data: {
      status: 1,
      actTaskInfo: {
        ID: '16T7PC',
        Type: 1,
        Name: '30分钟',
        TargetNum: 1800,
        TaskCycle: 1,
        TaskMaxTimes: 1,
        TaskFinishTime: 0,
        Progress: 1800,
        State: 2,
        Desc: '立即领取',
        Detail: '+280金币',
      },
    },
  })
  const text = lines.join('\n')
  assert.doesNotMatch(text, /没有返回任务列表/)
  assert.equal(lines[0], '1. 30分钟 1800/1800（立即领取 · +280金币）')
})

test('整条回执：两段都在；没配活动 ID 时任务段给提示而不是空白', () => {
  const withId = M.formatMedalReport({
    listening: { code: 0, data: { totalListenTime: 600 } },
    tasks: { code: 0, data: { taskList: [{ taskName: '听歌', progress: 1, target: 3 }] } },
    actID: '2025',
  })
  assert.match(withId, /【QQ音乐 · 勋章进度】/)
  assert.match(withId, /— 听歌时长 —/)
  assert.match(withId, /— 勋章任务 —/)
  assert.match(withId, /1\. 听歌 1\/3/)

  const noId = M.formatMedalReport({ listening: { code: 1000, data: {} }, actID: '' })
  assert.match(noId, /需要登录/)
  assert.match(noId, /未配置活动 ID/)

  // 查询抛错时把原因挂到最后，别把整条回执吞掉
  const withNote = M.formatMedalReport({ listening: { code: 0, data: {} }, note: '听歌时长查询失败：ECONNREFUSED' })
  assert.match(withNote, /ECONNREFUSED/)
})

test('播放页任务兜底：有 data 才展示，纯错误码不占位', () => {
  // 有真数据 → 补一段
  assert.equal(M.hasTaskData({ code: 0, data: { taskList: [] } }), true)
  const withData = M.formatMedalReport({
    listening: { code: 0, data: { totalListenTime: 60 } },
    playpage: { code: 0, data: { taskList: [{ taskName: '听歌 10 分钟', progress: 3, target: 10 }] } },
    actID: '',
  })
  assert.match(withData, /未配置活动 ID/)
  assert.match(withData, /— 播放页任务（补充，只读）—/)
  assert.match(withData, /1\. 听歌 10 分钟 3\/10/)

  // 只有错误码 / 空 data → 不展示，别和上面的提示重复
  assert.equal(M.hasTaskData({ code: 1000, data: {} }), false)
  assert.equal(M.hasTaskData({ code: 1000 }), false)
  assert.equal(M.hasTaskData({}), false)
  assert.equal(M.hasTaskData(null), false)
  const noData = M.formatMedalReport({
    listening: { code: 1000, data: {} },
    playpage: { code: 1000, data: {} },
    actID: '',
  })
  assert.doesNotMatch(noData, /播放页任务/)

  // 配了活动 ID 时，播放页那路即使有数据也不掺进来（以 ActTaskNewSvr 为准）
  const withId = M.formatMedalReport({
    tasks: { code: 0, data: { taskList: [{ taskName: '活动任务', progress: 1, target: 2 }] } },
    playpage: { code: 0, data: { taskList: [{ taskName: '播放页任务', progress: 9, target: 9 }] } },
    actID: '2025',
  })
  assert.match(withId, /活动任务 1\/2/)
  assert.doesNotMatch(withId, /播放页任务/)
})

test('播放页兜底方法：常量对得上，且是个函数（真调用要登录，不在这儿打网络）', () => {
  assert.equal(M.MEDAL_MODULE_PLAYPAGE, 'music.activeCenter.PlaypagetaskSvr')
  assert.equal(M.MEDAL_METHOD_PLAYPAGE, 'GetTaskDetail')
  assert.equal(typeof M.fetchPlayPageTaskDetail, 'function')
})

test('图片卡数据：10007 说清楚是"上游拒绝"，不是"需要登录"', () => {
  const d = M.buildMedalCardData({
    listening: { code: 10007, data: {} },
    playpage: {
      code: 0,
      data: { actTaskInfo: { Name: '30分钟', TargetNum: 1800, Progress: 1800, Desc: '立即领取', Detail: '+280金币' } },
    },
    actID: '',
  })
  assert.equal(d.listen.tone, 'warn')
  assert.equal(d.listen.statusText, '登录态正常 · 上游拒绝')
  const listenText = d.listen.lines.join('\n')
  assert.match(listenText, /10007/)
  // 关键：不能把 10007 说成登录问题（"不是未登录"这句是否定，允许）
  assert.match(listenText, /不是未登录/)
  assert.doesNotMatch(listenText, /需要登录/)
})

test('图片卡数据：播放页任务照抄平台按钮与奖励（只读，不点）', () => {
  const d = M.buildMedalCardData({
    listening: { code: 10007, data: {} },
    playpage: {
      code: 0,
      data: { actTaskInfo: { Name: '30分钟', TargetNum: 1800, Progress: 1800, Desc: '立即领取', Detail: '+280金币' } },
    },
    actID: '',
  })
  assert.equal(d.tasks.configured, false)
  assert.equal(d.playpage.show, true)
  assert.equal(d.playpage.items.length, 1)
  const item = d.playpage.items[0]
  assert.equal(item.name, '30分钟')
  assert.equal(item.progressText, '1800 / 1800')
  assert.equal(item.buttonText, '立即领取')
  assert.equal(item.rewardText, '+280金币')
  assert.equal(item.percent, 100)
  // 模板问"每个 data.X 都有夹具"，这里顺手确认卡片数据是纯 JSON（能直接喂模板/夹具）
  const json = JSON.stringify(d)
  for (const s of ['10007', '30分钟', '1800 / 1800', '立即领取', '+280金币']) assert.ok(json.includes(s), s)
})

test('图片卡数据：配了活动 ID 时用活动任务，播放页不掺进来', () => {
  const d = M.buildMedalCardData({
    tasks: { code: 0, data: { taskList: [{ taskName: '听歌 1 小时', progress: 20, target: 60 }] } },
    playpage: { code: 0, data: { taskList: [{ taskName: '播放页任务', progress: 9, target: 9 }] } },
    actID: '2025',
  })
  assert.equal(d.tasks.configured, true)
  assert.equal(d.tasks.items.length, 1)
  assert.equal(d.tasks.note, '活动 ID 2025')
  assert.equal(d.playpage.show, false)
})

test('勋章命令：形状对，且不吃点歌/听歌统计那几条', () => {
  const re = (s) => C.RE_MEDAL.test(s)
  assert.ok(re('#qqm勋章'))
  assert.ok(re('QQm勋章'))
  assert.ok(re('#qqm勋章任务'))
  assert.ok(re('#qqm勋章进度'))
  assert.ok(re('#qqm 成就'))
  assert.ok(re('#qqm成就任务'))
  assert.ok(re('#qqm勋章 任务')) // 中间的空格无所谓
  // 别抢别人
  assert.ok(!re('#qqm听歌'))
  assert.ok(!re('#qqm听歌榜'))
  assert.ok(!re('#qqm点歌 勋章'))
  assert.ok(!re('#qqm勋章榜'))
  assert.ok(!re('#qqm勋章 进度 额外'))
})

test('勋章命令不会被点歌规则当成"搜关键词"抢走', () => {
  assert.deepEqual(C.parseSongCmd('#qqm勋章'), { plat: '', verb: '', keyword: '' })
  assert.deepEqual(C.parseSongCmd('#qqm勋章任务'), { plat: '', verb: '', keyword: '' })
})

test('apps/medal.js 只导出一个插件类（多导出会让加载器认错插件）', () => {
  const src = fs.readFileSync(new URL('../apps/medal.js', import.meta.url), 'utf8')
  const names = [
    ...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:class|const|let|function)\s+([A-Za-z0-9_$]+)?/gm),
  ].map((m) => m[1] || 'default')
  assert.deepEqual(names, ['qqmusicMedal'])
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})
