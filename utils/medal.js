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
    const text = f.unit === 'sec' ? formatDuration(Number(data[hit]) || 0) : String(data[hit])
    lines.push(`${f.label}：${text}`)
  }

  // 只把"没被上面认领的"顶层字段摆出来，别重复
  const rest = flattenScalars(data).filter((r) => !used.has(String(r.key).split('.')[0]))
  if (!lines.length && !rest.length) return ['平台没有返回进度字段（可能这个账号还没有听歌记录）']
  if (rest.length) lines.push(`其它字段：${dumpText(rest)}`)
  return lines
}

/** 单条任务的人话写法 */
export function taskLineOf(task = {}, index = 0) {
  const t = task && typeof task === 'object' ? task : {}
  const name = String(t.taskName || t.name || t.title || t.desc || t.description || `任务 ${index + 1}`).slice(0, 40)
  const cur = t.progress ?? t.current ?? t.curValue ?? t.finishCount ?? t.progressValue ?? t.doneNum
  const total = t.target ?? t.total ?? t.targetValue ?? t.maxValue ?? t.needCount ?? t.totalNum
  let amount = ''
  if (cur != null && total != null) amount = ` ${cur}/${total}`
  else if (cur != null) amount = ` ${cur}`
  else if (total != null) amount = ` /${total}`

  const st = t.status ?? t.state ?? t.finish ?? t.finished ?? t.completed
  const done = st === 1 || st === true || st === '1' || st === 'done' || st === 'finished' || st === 'complete'
  return `${index + 1}. ${name}${amount}${done ? ' ✅' : ''}`
}

/** 勋章任务那一段（返回多行文本数组） */
export function formatTaskSection(payload = {}) {
  const hint = describeMedalCode(payload?.code, payload?.data?.retMsg || payload?.retMsg)
  if (hint) return [hint]

  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const list = Array.isArray(data.taskList) ? data.taskList : Array.isArray(data.tasks) ? data.tasks : []
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

export default {
  medalConfig,
  cgiPayload,
  describeMedalCode,
  fetchListeningDetail,
  fetchMedalTasks,
  fetchPlayPageTaskDetail,
  flattenScalars,
  formatListeningSection,
  formatTaskSection,
  taskLineOf,
  formatMedalReport,
  hasTaskData,
}
