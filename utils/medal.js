/**
 * QQ 音乐「勋章 / 任务进度」——**只读**查询
 *
 * 这里只做两件事：调 API 的 `/cgi` 透传两个**只读**方法，再把结果排成人话。
 * 没有任何写操作：不签到、不领奖、不上报、不发心跳。想拿平台侧的时长/勋章，
 * 只有「平台官方客户端 + 官方活动」这一条路，插件只负责把平台的真实进度读回来。
 *
 * 三个方法都是匿名探测出来的**真实存在**的模块/方法（musicu.fcg）：
 *   · music.listening.ListeningSvr        / QueryListeningDetail —— 听歌时长明细
 *   · music.activeCenter.ActTaskNewSvr    / GetTaskList          —— 活动任务列表（要 actID）
 *   · music.activeCenter.PlaypagetaskSvr  / GetTaskDetail        —— 播放页任务（兜底）
 * 都需要登录（匿名调用回 code=1000）。所以没登录时本模块只回一句「需要登录」，绝不编数字。
 *
 * ⚠️ 上游返回的字段名**没有在插件侧固化**（登录态下抓不到样本）。所以解析走
 *    「已知候选名优先 + 其余标量原样列出」：真换了字段名，命令也不会变成空白，
 *    而是把平台返回的东西照实摆出来，方便下一轮把名字钉死。
 */
import { request } from './api.js'
// 时长的人话写法只此一份（在 utils/stats.js）；那边顶层只有常量与函数定义，
// 唯一的副作用是注册一个 exit 钩子，且没有脏数据时立即返回，import 它是安全的。
import { formatDuration } from './stats.js'

export const MEDAL_MODULE_LISTENING = 'music.listening.ListeningSvr'
export const MEDAL_METHOD_LISTENING = 'QueryListeningDetail'
export const MEDAL_MODULE_TASKS = 'music.activeCenter.ActTaskNewSvr'
export const MEDAL_METHOD_TASKS = 'GetTaskList'
// 播放页任务：**候选兜底源**。匿名探测过 GetTaskDetail 存在（回 code=1000），
// 但登录态下返回什么形状没抓过样本 —— 所以只在「没配活动 ID」时拿它顶一下，
// 真拿到数据才展示；配了活动 ID 就以 ActTaskNewSvr 为准，不掺这一路。
export const MEDAL_MODULE_PLAYPAGE = 'music.activeCenter.PlaypagetaskSvr'
export const MEDAL_METHOD_PLAYPAGE = 'GetTaskDetail'

export const DEFAULT_MEDAL_TIMEOUT_MS = 15000
/** 一次最多摆多少个「没认出来的字段」——够定位，又不至于刷屏 */
const MAX_DUMP_FIELDS = 14
/** 一次最多列多少条任务 */
const MAX_TASKS = 12

// ──────────── 配置 ────────────

/** 把插件配置归一成勋章模块认识的形状（默认开；活动 ID 缺省为空） */
export function medalConfig(cfg = {}) {
  return {
    enable: cfg?.medalEnable !== false,
    actID: String(cfg?.medalActID ?? '').trim(),
    timeout: DEFAULT_MEDAL_TIMEOUT_MS,
  }
}

// ──────────── 上游 ────────────

/**
 * `/cgi` 代理把上游的 `req_0` 放在 `body.data`（见 API 的 module/cgi.js）。
 * 拿不到就当空对象，交给下面的文案层去说「平台没返回字段」。
 */
export function cgiPayload(body) {
  const d = body?.data
  return d && typeof d === 'object' ? d : {}
}

/** 上游业务码 → 人话；认不出就给通用文案，绝不把裸 code 当成功 */
export function describeMedalCode(code, retMsg = '') {
  const n = Number(code)
  if (!Number.isFinite(n) || n === 0) return ''
  if (n === 1000) return '需要登录：先在机器人里 #qqm登录 一个 QQ 音乐账号，平台才给看时长/任务'
  if (n === 100032) return '缺活动 ID：勋章任务要按平台**当期活动**查（配置键 medalActID，留空就查不到任务）'
  if (n === 100002 || n === 10006) return '活动 ID 无效或活动已结束（medalActID 要填平台当前在跑的那个）'
  // 2026-10-18 实测：登录态下 QueryListeningDetail 会回 10007（不是 1000，所以不是"没登录"）。
  // 含义没在官方文档里，只把事实说清楚，别编一个像模像样的解释。
  if (n === 10007) return '平台返回 code=10007：这次时长查询被上游拒绝（不是"需要登录"）。这一路暂时拿不到数据，请稍后重试或查看官方客户端。'
  if (n === 500003) return '上游不认这个方法了（QQ 音乐接口可能已改版）'
  if (n === 40000) return '上游不认这个模块（QQ 音乐接口可能已改版）'
  const msg = String(retMsg || '').trim()
  return msg ? `平台返回 code=${n}：${msg}` : `平台返回 code=${n}`
}

/** 取听歌时长明细（只读） */
export async function fetchListeningDetail(userKey = '', { timeout = DEFAULT_MEDAL_TIMEOUT_MS } = {}) {
  const body = await request(
    '/cgi',
    {
      module: MEDAL_MODULE_LISTENING,
      method: MEDAL_METHOD_LISTENING,
      // param 必须是**字符串**：GET 请求里 axios 会把对象序列化成 param[foo]=bar，
      // 上游就不认了（与 utils/api.js 里 recommendFeed 同一条坑）
      param: JSON.stringify({}),
    },
    'get',
    userKey,
    // 勋章进度是「请求者本人」的数据：即使插件开了「一律走主人账号」，也不能拿主人账号顶掉。
    { timeout, asUser: true }
  )
  return cgiPayload(body)
}

/** 取勋章活动任务列表（只读）；没配活动 ID 时不打上游，直接给"缺 ID" */
export async function fetchMedalTasks(actID, userKey = '', { timeout = DEFAULT_MEDAL_TIMEOUT_MS } = {}) {
  const id = String(actID ?? '').trim()
  if (!id) return { code: 100032, data: { retCode: 100032, retMsg: '活动ID不能为空喔~' } }
  const body = await request(
    '/cgi',
    {
      module: MEDAL_MODULE_TASKS,
      method: MEDAL_METHOD_TASKS,
      param: JSON.stringify({ actID: id }),
    },
    'get',
    userKey,
    // 同上：任务进度也按请求者本人的 QQ 音乐账号读取。
    { timeout, asUser: true }
  )
  return cgiPayload(body)
}

/**
 * 取播放页任务明细（只读，兜底）
 *
 * 没配活动 ID 时的替代源：不需要 actID，直接问平台「当前播放页有哪些任务」。
 * 仍然是**只读** GET —— 不签到、不领奖、不上报。登录态下形状未知，所以调用方
 * 只在真拿到 data 时才展示（见 formatMedalReport / hasTaskData）。
 */
export async function fetchPlayPageTaskDetail(userKey = '', { timeout = DEFAULT_MEDAL_TIMEOUT_MS } = {}) {
  const body = await request(
    '/cgi',
    {
      module: MEDAL_MODULE_PLAYPAGE,
      method: MEDAL_METHOD_PLAYPAGE,
      param: JSON.stringify({}),
    },
    'get',
    userKey,
    // 按请求者本人读取（同听歌时长/活动任务，不能被「一律走主人账号」顶掉）。
    { timeout, asUser: true }
  )
  return cgiPayload(body)
}

// ──────────── 解析 ────────────

/**
 * 候选字段名 → 展示标签（`sec` = 按秒转人话，`num` = 原样）
 *
 * 名字是**猜测**：平台侧字段没抓过样本，所以这只是一组"先试试"的候选；
 * 都没命中时下面的 flattenScalars 会把真实字段照实列出来。
 */
const LISTEN_FIELDS = [
  { keys: ['totalListenTime', 'totalTime', 'listenTotalTime', 'totalDuration', 'totalListenSec'], label: '累计听歌时长', unit: 'sec' },
  { keys: ['todayListenTime', 'dayListenTime', 'todayTime', 'todayListenSec'], label: '今日听歌时长', unit: 'sec' },
  { keys: ['weekListenTime', 'weekTime', 'weekListenSec'], label: '本周听歌时长', unit: 'sec' },
  { keys: ['listenDays', 'totalListenDays', 'activeDays', 'days'], label: '累计听歌天数', unit: 'num' },
  { keys: ['listenSongs', 'listenSongCount', 'totalListenSongs', 'songCount', 'songNum'], label: '累计听歌首数', unit: 'num' },
  { keys: ['listenSingers', 'listenSingerCount', 'singerCount'], label: '累计听歌歌手', unit: 'num' },
  { keys: ['level', 'growLevel', 'userLevel', 'grade'], label: '听歌等级', unit: 'num' },
  { keys: ['score', 'growScore', 'growthValue', 'exp', 'experience'], label: '成长值', unit: 'num' },
]

function isScalar(v) {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
}

/**
 * 把响应里**没认出来的标量**铺平列出（对象往下走一层，数组只报长度）
 *
 * 这是"字段名未知"阶段的兜底：与其什么都不显示，不如把平台真返回的字段摆出来。
 */
export function flattenScalars(value, { maxDepth = 3, max = MAX_DUMP_FIELDS } = {}) {
  const out = []
  const walk = (node, prefix, depth) => {
    if (out.length >= max || depth > maxDepth) return
    if (Array.isArray(node)) {
      if (node.length) out.push({ key: `${prefix || 'list'}[]`, value: `${node.length} 项` })
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (out.length >= max) return
        const key = prefix ? `${prefix}.${k}` : k
        if (isScalar(v)) out.push({ key, value: v })
        else walk(v, key, depth + 1)
      }
      return
    }
  }
  walk(value, '', 0)
  return out
}

function dumpText(rows = []) {
  return rows.map((r) => `${r.key}=${r.value}`).join(' · ')
}

/** 任务列表的候选键：数组直接用，单个对象也算一条任务（播放页 GetTaskDetail 就是单对象） */
const TASK_LIST_KEYS = ['taskList', 'tasks', 'actTaskInfo', 'taskInfo', 'taskInfos']

/**
 * 从响应里找出任务数组
 *
 * 播放页 `GetTaskDetail` 的真实形状（2026-10-18 实测）是 `data.actTaskInfo` **单对象**，
 * 字段还大写开头（Name/Progress/TargetNum/State/Desc/Detail）—— 只认 taskList/tasks
 * 数组就会把它当成"没有任务列表"，白白丢掉平台已经给回来的那条任务。
 */
export function collectTaskList(data = {}) {
  const d = data && typeof data === 'object' ? data : {}
  for (const k of TASK_LIST_KEYS) {
    const v = d[k]
    if (Array.isArray(v)) {
      if (v.length) return v
      continue
    }
    if (v && typeof v === 'object' && Object.keys(v).length) return [v]
  }
  return []
}

/** 听歌时长那一段（返回多行文本数组） */
export function formatListeningSection(payload = {}) {
  const hint = describeMedalCode(payload?.code, payload?.data?.retMsg || payload?.retMsg)
  if (hint) return [hint]

  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const lines = []
  const used = new Set()
  for (const f of LISTEN_FIELDS) {
    const hit = f.keys.find((k) => data[k] != null && data[k] !== '')
    if (!hit) continue
    used.add(hit)
    const seconds = Number(data[hit])
    const text = f.unit === 'sec'
      ? (Number.isFinite(seconds) && seconds >= 0
          ? formatDuration(seconds)
          : `${String(data[hit])}（无法解析时长）`)
      : String(data[hit])
    lines.push(`${f.label}：${text}`)
  }

  // 只把"没被上面认领的"顶层字段摆出来，别重复
  const rest = flattenScalars(data).filter((r) => !used.has(String(r.key).split('.')[0]))
  if (!lines.length && !rest.length) return ['平台没有返回进度字段（可能这个账号还没有听歌记录）']
  if (rest.length) lines.push(`其它字段：${dumpText(rest)}`)
  return lines
}

/** 取第一个"有值"的候选：0 / false 都算有值，只跳过 null / undefined / 空串 */
function firstDefined(...vals) {
  return vals.find((v) => v != null && v !== '')
}

/**
 * 单条任务的结构化数据
 *
 * 文本卡与图片卡共用这一份解析：字段名仍然同时认小写 camelCase 和播放页真实的大写字段，
 * 这样以后平台再换一组名字，只需要补这里，不会出现「文本正常、卡片空白」。
 */
export function taskItemOf(task = {}, index = 0) {
  const t = task && typeof task === 'object' ? task : {}
  const name = String(
    t.taskName || t.name || t.Name || t.title || t.Title || t.desc || t.description || `任务 ${index + 1}`
  ).slice(0, 40)
  const cur = firstDefined(t.progress, t.current, t.curValue, t.finishCount, t.progressValue, t.doneNum, t.Progress)
  const total = firstDefined(t.target, t.total, t.targetValue, t.maxValue, t.needCount, t.totalNum, t.TargetNum)
  let progressText = ''
  if (cur != null && total != null) progressText = `${cur} / ${total}`
  else if (cur != null) progressText = String(cur)
  else if (total != null) progressText = `/${total}`

  const st = firstDefined(t.status, t.state, t.finish, t.finished, t.completed, t.State)
  const done = st === 1 || st === true || st === '1' || st === 'done' || st === 'finished' || st === 'complete'
  // 平台自己的按钮文案（实测 Desc="立即领取"）与奖励（实测 Detail="+280金币"）。
  // ⚠️ 只是**照抄展示**，插件不会去点这个按钮 —— 领取要用户自己在官方客户端做。
  const button = String(t.Desc || t.buttonText || t.TaskButton || '').trim()
  const reward = String(t.Detail || t.reward || t.Reward || '').trim()
  const curNum = Number(cur)
  const totalNum = Number(total)
  const percent =
    Number.isFinite(curNum) && Number.isFinite(totalNum) && totalNum > 0
      ? Math.max(0, Math.min(100, Math.round((curNum / totalNum) * 100)))
      : done
        ? 100
        : 0
  return {
    index: index + 1,
    name,
    progressText,
    done,
    buttonText: button,
    rewardText: reward,
    percent,
  }
}

/** 单条任务的人话写法（小写 camelCase 与平台真实的大写字段都认） */
export function taskLineOf(task = {}, index = 0) {
  const item = taskItemOf(task, index)
  const amount = item.progressText ? ` ${item.progressText.replace(/\s*\/\s*/, '/')}` : ''
  const extra = [item.buttonText, item.rewardText].filter(Boolean)
  return `${item.index}. ${item.name}${amount}${item.done ? ' ✅' : ''}${extra.length ? `（${extra.join(' · ')}）` : ''}`
}

/** 勋章任务那一段（返回多行文本数组） */
export function formatTaskSection(payload = {}) {
  const hint = describeMedalCode(payload?.code, payload?.data?.retMsg || payload?.retMsg)
  if (hint) return [hint]

  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const list = collectTaskList(data)
  if (!list.length) {
    const rest = flattenScalars(data)
    if (!rest.length) return ['平台没有返回任务列表（这个活动可能没有可做任务）']
    return [`平台没有返回任务列表。其它字段：${dumpText(rest)}`]
  }
  return list.slice(0, MAX_TASKS).map((t, i) => taskLineOf(t, i))
}

/**
 * 整条回执
 * @param {{listening?:object, tasks?:object, playpage?:object, actID?:string, note?:string}} input
 */
export function formatMedalReport({ listening = {}, tasks = {}, playpage = {}, actID = '', note = '' } = {}) {
  const lines = ['【QQ音乐 · 勋章进度】', '— 听歌时长 —', ...formatListeningSection(listening), '— 勋章任务 —']
  if (!String(actID || '').trim()) {
    lines.push('未配置活动 ID（medalActID）：勋章任务按平台当期活动查，留空时只读听歌时长。')
    // 没配活动 ID 时才用播放页任务兜底；**真拿到 data 才展示**，否则会和上面的提示重复
    if (hasTaskData(playpage)) {
      lines.push('— 播放页任务（补充，只读）—', ...formatTaskSection(playpage))
    }
  } else {
    lines.push(...formatTaskSection(tasks))
  }
  const tail = String(note || '').trim()
  if (tail) lines.push(tail)
  return lines.join('\n')
}

/** 上游有没有**真返回任务数据**（有非空 data 对象）；只有错误码不算 */
export function hasTaskData(payload = {}) {
  const d = payload?.data
  return Boolean(d && typeof d === 'object' && Object.keys(d).length)
}

/** 卡片里不渲染 Markdown 强调标记，歌名/文案里的 `**` 要拿掉 */
function plainCardText(value) {
  return String(value || '').replace(/\*\*/g, '').trim()
}

function listenStatusOf(payload = {}) {
  const n = Number(payload?.code)
  if (n === 10007) return { statusText: '登录态正常 · 上游拒绝', tone: 'warn' }
  if (n === 1000) return { statusText: '需要登录', tone: 'warn' }
  if (Number.isFinite(n) && n !== 0) return { statusText: '查询未通过', tone: 'warn' }
  if (payload?.data && typeof payload.data === 'object' && Object.keys(payload.data).length) {
    return { statusText: '已查询', tone: 'ok' }
  }
  return { statusText: '暂无数据', tone: 'muted' }
}

function listenLinesOf(payload = {}) {
  // 2026-10-18 线上真实结果：API 登录本身正常，10007 只代表本次时长查询被上游拒绝。
  // 图片卡必须把这一点说清楚，不能把它降级成一句模糊的"查询失败"。
  if (Number(payload?.code) === 10007) {
    return ['平台返回 code=10007', '上游拒绝本次时长查询，不是未登录']
  }
  return formatListeningSection(payload).map(plainCardText).filter(Boolean)
}

function taskItemsOf(payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  return collectTaskList(data).slice(0, MAX_TASKS).map((task, index) => taskItemOf(task, index))
}

/**
 * 图片卡数据
 *
 * 与 formatMedalReport 共用同一组解析函数，保证文本回退与图片卡看到的是同一批事实。
 * 只暴露展示需要的字段，模板不直接接触上游响应，避免把不稳定字段名带进四套主题。
 */
export function buildMedalCardData({ listening = {}, tasks = {}, playpage = {}, actID = '', note = '' } = {}) {
  const id = String(actID || '').trim()
  const configured = Boolean(id)
  const activityItems = configured ? taskItemsOf(tasks) : []
  const playItems = !configured && hasTaskData(playpage) ? taskItemsOf(playpage) : []
  const status = listenStatusOf(listening)
  const taskHint = configured
    ? activityItems.length
      ? ''
      : plainCardText(formatTaskSection(tasks)[0] || '平台没有返回任务列表')
    : '未配置活动 ID（medalActID）'

  return {
    title: 'QQ音乐 · 勋章进度',
    subtitle: '只读查询 · 按请求者本人账号',
    readOnlyText: '只读',
    listen: {
      ...status,
      lines: listenLinesOf(listening),
    },
    tasks: {
      configured,
      title: '勋章任务',
      hint: taskHint,
      note: configured ? `活动 ID ${id}` : '可配置活动 ID 查询当期勋章活动',
      items: activityItems,
    },
    playpage: {
      show: playItems.length > 0,
      title: '播放页任务',
      note: '按平台当前播放页只读读取',
      items: playItems,
    },
    note: plainCardText(note),
    footer: '只读展示，领取请在官方客户端操作',
  }
}

export default {
  medalConfig,
  cgiPayload,
  describeMedalCode,
  fetchListeningDetail,
  fetchMedalTasks,
  fetchPlayPageTaskDetail,
  flattenScalars,
  collectTaskList,
  formatListeningSection,
  formatTaskSection,
  taskItemOf,
  taskLineOf,
  formatMedalReport,
  hasTaskData,
  buildMedalCardData,
}
