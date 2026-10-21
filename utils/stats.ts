/**
 * 听歌时长统计（本地记账）
 *
 * 记的是**本机器人真正发出去的歌**（#qqm听N / #qqm播放 / 卡片解析 / 定时点歌 /
 * 随机推荐等所有走 deliverSong 的路径）—— 也就是说这串数字代表"这群人真的点播了
 * 多少歌"。它**不碰任何平台账号**，不向任何平台上报什么，纯粹是插件自己的账本。
 *
 * 为什么单独一个文件 + 单独一份落盘：
 *   · 这份数据是「按群 × 按人」的高频累加，每次成功发歌都要写一次；而
 *     utils/store.js 里存的是订阅/定时那种「设一次管很久」的群级资产。
 *     混在一份文件里 = 每发一首歌都要把整份订阅列表读出来再写回去。
 *   · 落盘位置同样在 data/（.gitignore 里，且 #qqm强制更新 的 git clean 豁免清单
 *     里有 `-e data`）—— 重启、强制更新都不丢。
 *
 * 两个刻意的取舍：
 *   · 按**东八区**切天（TZ_OFFSET_MS）：机器人跑在什么时区的机器上，"今天/近 7 天"
 *     都不该跟着漂。
 *   · 落盘**合并写**（SAVE_DELAY_MS）：群里连点几首不会触发几次全量序列化。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolvePluginStateFile } from './path.js'
import { logWarn } from './log.js'
import { SOURCE_LABEL } from './platforms.js'

/** 统计文件；测试用 QQMUSIC_STATS_FILE 指到临时目录，别去动真实数据 */
const FILE = process.env.QQMUSIC_STATS_FILE
  ? path.resolve(String(process.env.QQMUSIC_STATS_FILE))
  : resolvePluginStateFile('data', 'qqmusic-stats.json')

const VERSION = 1
const DAY_MS = 86_400_000
/** 切「天」按东八区 */
const TZ_OFFSET_MS = 8 * 3_600_000

/** 一个人的「常听歌手」最多留几条（只留 Top，免得几百个翻唱歌手把文件撑大） */
const MAX_SINGERS = 30
/** 一个人的「平台分布」最多留几家 */
const MAX_PLATFORMS = 12
/** 单曲计时上限：电台那种整轨（>1h）按 1h 计，脏数据不至于把总时长顶飞 */
const MAX_SINGLE_PLAY_SEC = 3_600
/** 落盘延迟：把同一批发歌合并成一次写 */
const SAVE_DELAY_MS = 5_000

export const DEFAULT_KEEP_DAYS = 60
export const DEFAULT_MAX_USERS = 100

export function statsFilePath() {
  return FILE
}

// ──────────── 日期：一律走"天序号"，别在字符串上做减法 ────────────

/** 时间戳 → 东八区的 YYYY-MM-DD */
export function dayKeyOf(ts = Date.now()) {
  return new Date(Number(ts) + TZ_OFFSET_MS).toISOString().slice(0, 10)
}

/** YYYY-MM-DD → 天序号（差值就是天数，闰年自动正确） */
export function dayIndexOf(key) {
  const t = Date.parse(`${String(key)}T00:00:00.000Z`)
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : Number.NaN
}

/** 天序号 → YYYY-MM-DD */
export function dayKeyFromIndex(index) {
  return new Date(Number(index) * DAY_MS).toISOString().slice(0, 10)
}

// ──────────── 形状兜底：手改坏 / 旧版本文件都不该把命令打挂 ────────────

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function pruneCounts(map, limit) {
  const keys = Object.keys(map)
  if (keys.length <= limit) return map
  const out = {}
  for (const k of keys.sort((a, b) => map[b] - map[a]).slice(0, limit)) out[k] = map[k]
  return out
}

/** 只收「键非空、值 > 0」的计数表（顺带丢掉脏值） */
function countsOf(raw, limit) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const [k, v] of Object.entries(d)) {
    const n = Number(v)
    if (!k || !Number.isFinite(n) || n <= 0) continue
    out[k] = Math.round(n)
  }
  return pruneCounts(out, limit)
}

function normalizeUser(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const days = {}
  const rawDays = d.days && typeof d.days === 'object' ? d.days : {}
  for (const [k, v] of Object.entries(rawDays)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue
    const sec = Math.max(0, Math.round(Number(v?.sec) || 0))
    const plays = Math.max(0, Math.round(Number(v?.plays) || 0))
    if (sec > 0 || plays > 0) days[k] = { sec, plays }
  }
  return {
    name: String(d.name || '').slice(0, 40),
    sec: Math.max(0, Math.round(Number(d.sec) || 0)),
    plays: Math.max(0, Math.round(Number(d.plays) || 0)),
    days,
    singers: countsOf(d.singers, MAX_SINGERS),
    platforms: countsOf(d.platforms, MAX_PLATFORMS),
    firstAt: Number(d.firstAt) || 0,
    lastAt: Number(d.lastAt) || 0,
  }
}

function emptyStore() {
  return { version: VERSION, updatedAt: 0, groups: {} }
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const groups = {}
  const rawGroups = d.groups && typeof d.groups === 'object' ? d.groups : {}
  for (const [gid, g] of Object.entries(rawGroups)) {
    if (!gid) continue
    const users = {}
    const rawUsers = g && typeof g === 'object' && g.users && typeof g.users === 'object' ? g.users : {}
    for (const [uid, u] of Object.entries(rawUsers)) {
      if (uid) users[uid] = normalizeUser(u)
    }
    groups[gid] = { users }
  }
  return { version: VERSION, updatedAt: Number(d.updatedAt) || 0, groups }
}

// ──────────── 内存态 + 合并落盘 ────────────

let cache = null
let dirty = false
let timer = null

function state() {
  if (!cache) {
    try {
      cache = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')))
    } catch {
      cache = emptyStore()
    }
  }
  return cache
}

/** 原子落盘：先写临时文件再 rename，半路断电不会留半个 JSON */
function writeNow() {
  if (!cache || !dirty) return
  dirty = false
  const data = { ...cache, updatedAt: Date.now() }
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    const tmp = `${FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
    fs.renameSync(tmp, FILE)
  } catch (err) {
    logWarn(`听歌统计写不进去（${err.message}）—— 这次重启内还能看，重启会丢`)
  }
}

function scheduleSave() {
  dirty = true
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    writeNow()
  }, SAVE_DELAY_MS)
  // 别为了等这 5 秒把进程吊住；真退出时由 exit 钩子兜底
  timer.unref?.()
}

/** 立即落盘（测试与"关机前"用；平时走 scheduleSave） */
export function flushStats() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  writeNow()
}

process.once('exit', () => {
  try {
    flushStats()
  } catch {
    /* 进程都要走了，别再抛 */
  }
})

// ──────────── 配置 ────────────

/** 把插件配置里的三个键归一成统计模块认识的形状（默认全开、60 天、每群 100 人） */
export function statsConfig(cfg = {}) {
  return {
    enable: cfg?.statsEnable !== false,
    keepDays: clampInt(cfg?.statsKeepDays, 1, 3650, DEFAULT_KEEP_DAYS),
    maxUsersPerGroup: clampInt(cfg?.statsMaxUsersPerGroup, 1, 5000, DEFAULT_MAX_USERS),
  }
}

/**
 * 这条消息该记到哪个账本
 *
 * 群聊记到群账本（`g<群号>`），私聊记到个人账本（`p<QQ号>`）—— 两类分开，
 * 免得私聊点歌冒进群榜里。前缀只为让两种 scope 在同一个 groups 表里不打架。
 */
export function scopeOf(e) {
  const gid = String(e?.group_id || '').trim()
  if (gid) return `g${gid}`
  const uid = String(e?.user_id || '').trim()
  return uid ? `p${uid}` : ''
}

// ──────────── 归一：时长 / 平台 ────────────

/**
 * 这一首按多少秒计
 *
 * `interval`（秒）是本插件各条搜索/详情路径都在用的规范字段，优先它；
 * 拿不到再试 durationSec、最后才解析 `duration`（"mm:ss" / "h:mm:ss"）。
 * 全都拿不到就计 0 秒 —— 播放**次数**照记，不编一个假时长出来。
 */
export function durationSecOf(song = {}) {
  const interval = Number(song?.interval)
  if (Number.isFinite(interval) && interval > 0) {
    return Math.min(Math.round(interval), MAX_SINGLE_PLAY_SEC)
  }
  const sec = Number(song?.durationSec)
  if (Number.isFinite(sec) && sec > 0) return Math.min(Math.round(sec), MAX_SINGLE_PLAY_SEC)

  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(String(song?.duration || '').trim())
  if (m) {
    const total = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
    if (total > 0) return Math.min(total, MAX_SINGLE_PLAY_SEC)
  }
  return 0
}

/** 这首歌来自哪家（QQ 本体没有 source 字段 → 记成 qq） */
export function platformOf(song = {}) {
  return String(song?.source || '').trim().toLowerCase() || 'qq'
}

// ──────────── 写入 ────────────

/** 把一个人身上不该长期留的东西剪掉（老日期 / 超量的歌手表） */
function pruneUser(user, { keepDays, todayIndex }) {
  const oldest = todayIndex - keepDays + 1
  for (const key of Object.keys(user.days)) {
    const idx = dayIndexOf(key)
    if (!Number.isFinite(idx) || idx < oldest) delete user.days[key]
  }
  user.singers = pruneCounts(user.singers, MAX_SINGERS)
  user.platforms = pruneCounts(user.platforms, MAX_PLATFORMS)
}

/** 群里人太多时，先丢"最久没出现"的那些（活跃的不会被顶掉） */
function pruneUsers(group, max) {
  const ids = Object.keys(group.users)
  if (ids.length <= max) return
  const drop = ids
    .sort((a, b) => (group.users[a].lastAt || 0) - (group.users[b].lastAt || 0))
    .slice(0, ids.length - max)
  for (const id of drop) delete group.users[id]
}

/**
 * 记一次播放。**永不抛**：统计失败绝不该把发歌流程带崩。
 * @returns {boolean} 有没有真的记上
 */
export function recordPlay(payload = {}, options = {}) {
  try {
    // 顶层就兜住 null（调用方可能传来一个空的 song/事件对象）
    const src = payload && typeof payload === 'object' ? payload : {}
    const groupId = String(src.groupId ?? '').trim()
    const userId = String(src.userId ?? '').trim()
    if (!groupId || !userId) return false

    const now = Number(src.at) > 0 ? Number(src.at) : Date.now()
    const dayKey = dayKeyOf(now)
    const todayIndex = dayIndexOf(dayKey)
    const keepDays = clampInt(options.keepDays, 1, 3650, DEFAULT_KEEP_DAYS)
    const maxUsers = clampInt(options.maxUsersPerGroup, 1, 5000, DEFAULT_MAX_USERS)
    const sec = durationSecOf(src.song)

    const store = state()
    if (!store.groups[groupId]) store.groups[groupId] = { users: {} }
    const group = store.groups[groupId]
    if (!group.users[userId]) group.users[userId] = normalizeUser({})
    const user = group.users[userId]

    const name = String(src.name || '').slice(0, 40)
    if (name) user.name = name

    const bucket = user.days[dayKey] || (user.days[dayKey] = { sec: 0, plays: 0 })
    bucket.sec += sec
    bucket.plays += 1
    user.sec += sec
    user.plays += 1
    user.lastAt = now
    if (!user.firstAt) user.firstAt = now

    const singer = String(src.song?.singerName || '').trim().slice(0, 40)
    if (singer) user.singers[singer] = (user.singers[singer] || 0) + 1
    const plat = platformOf(src.song)
    if (sec > 0) user.platforms[plat] = (user.platforms[plat] || 0) + sec

    pruneUser(user, { keepDays, todayIndex })
    pruneUsers(group, maxUsers)
    scheduleSave()
    return true
  } catch (err) {
    logWarn(`听歌统计记账失败：${err.message}`)
    return false
  }
}

// ──────────── 读取 ────────────

function topEntries(map, count) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, count)
    .map(([name, value]) => ({ name, value }))
}

/**
 * 连续听歌天数
 *
 * 今天还没听**不算断**（从昨天往回数）—— 否则每天早上一睁眼，所有人的连续天数
 * 都归零，看着就像功能坏了。
 */
export function streakOf(days = {}, todayIndex) {
  let index = todayIndex
  if (!days[dayKeyFromIndex(index)]) index -= 1
  let n = 0
  while (days[dayKeyFromIndex(index)]) {
    n += 1
    index -= 1
    if (n > 4000) break // 兜底：文件被改坏时不至于死循环
  }
  return n
}

/** 近 N 天的合计（含今天） */
function sumRange(user, todayIndex, days) {
  let sec = 0
  let plays = 0
  for (let i = days - 1; i >= 0; i -= 1) {
    const bucket = user.days[dayKeyFromIndex(todayIndex - i)]
    if (!bucket) continue
    sec += bucket.sec
    plays += bucket.plays
  }
  return { sec, plays }
}

/** 个人统计；没有记录返回 null（调用方据此给"先点一首"的提示） */
export function statsOf(groupId, userId, { now = Date.now() } = {}) {
  const user = state().groups[String(groupId)]?.users?.[String(userId)]
  if (!user) return null

  const todayIndex = dayIndexOf(dayKeyOf(now))
  const today = user.days[dayKeyFromIndex(todayIndex)] || { sec: 0, plays: 0 }
  const week = sumRange(user, todayIndex, 7)

  return {
    groupId: String(groupId),
    userId: String(userId),
    name: user.name,
    sec: user.sec,
    plays: user.plays,
    todaySec: today.sec,
    todayPlays: today.plays,
    weekSec: week.sec,
    weekPlays: week.plays,
    activeDays: Object.keys(user.days).length,
    streak: streakOf(user.days, todayIndex),
    topSingers: topEntries(user.singers, 3),
    platforms: topEntries(user.platforms, 5),
    firstAt: user.firstAt,
    lastAt: user.lastAt,
  }
}

/**
 * 群排行
 * @param {'today'|'week'|'total'} range
 */
export function groupBoard(groupId, range = 'total', { limit = 10, now = Date.now() } = {}) {
  const group = state().groups[String(groupId)]
  if (!group) return []
  const todayIndex = dayIndexOf(dayKeyOf(now))

  const rows = []
  for (const [userId, user] of Object.entries(group.users)) {
    let sec = user.sec
    let plays = user.plays
    if (range === 'today') {
      const bucket = user.days[dayKeyFromIndex(todayIndex)] || { sec: 0, plays: 0 }
      sec = bucket.sec
      plays = bucket.plays
    } else if (range === 'week') {
      const sum = sumRange(user, todayIndex, 7)
      sec = sum.sec
      plays = sum.plays
    }
    if (sec <= 0 && plays <= 0) continue
    rows.push({ userId, name: user.name, sec, plays })
  }
  rows.sort((a, b) => b.sec - a.sec || b.plays - a.plays || String(a.userId).localeCompare(String(b.userId)))
  return rows.slice(0, Math.max(1, Number(limit) || 10))
}

/**
 * 时长的人话写法
 *
 * 分档写：小数字带秒（"3 分 20 秒"），上了小时就只到分（"12 小时 7 分"）——
 * 排行榜里一排"12 小时 7 分 33 秒"是读不下去的。
 */
export function formatDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  if (n < 60) return `${n} 秒`
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
}

// ──────────── 文案 ────────────
// ⚠️ 放在 util 而不是 apps/stats.js：那个文件多导出一个函数，插件加载器就会把
//    「第一个函数导出」当成插件类去 new，命令直接失效（见 utils/command.js 顶部）。

/** 平台 id → 展示名（QQ 本体没有 source 字段，别让它显示成光秃秃的 "qq"） */
export function platformLabelOf(id) {
  if (!id || id === 'qq') return 'QQ音乐'
  return SOURCE_LABEL[id] || id
}

function displayNameOf(name, userId) {
  const n = String(name || '').trim()
  if (n) return n
  const uid = String(userId || '')
  return uid ? `QQ${uid.slice(-4)}` : '未知'
}

/**
 * 个人统计文案（一条数字为主的短回执，不发图 —— 渲染成卡反而更慢）
 * @param {object} s statsOf() 的返回值
 */
export function formatPersonalStats(s = {}) {
  const lines = [
    '【我的听歌统计】',
    `时长：累计 ${formatDuration(s.sec)} · 近 7 天 ${formatDuration(s.weekSec)} · 今天 ${formatDuration(s.todaySec)}`,
    `点播：${Number(s.plays) || 0} 首（今天 ${Number(s.todayPlays) || 0} 首 · 近 7 天 ${Number(s.weekPlays) || 0} 首）`,
    `连续：${Number(s.streak) || 0} 天 · 有记录 ${Number(s.activeDays) || 0} 天`,
  ]
  const singers = Array.isArray(s.topSingers) ? s.topSingers : []
  if (singers.length) {
    lines.push(`常听：${singers.map((x) => `${x.name} ×${x.value}`).join(' · ')}`)
  }
  const platforms = Array.isArray(s.platforms) ? s.platforms : []
  if (platforms.length) {
    lines.push(
      `平台：${platforms.map((x) => `${platformLabelOf(x.name)} ${formatDuration(x.value)}`).join(' · ')}`
    )
  }
  return lines.join('\n')
}

/** 群榜文案 */
export function formatBoardText(rows = [], rangeLabel = '总榜') {
  return [
    `【本群听歌榜 · ${rangeLabel}】`,
    ...rows.map(
      (r, i) => `${i + 1}. ${displayNameOf(r.name, r.userId)} ${formatDuration(r.sec)}（${r.plays} 首）`
    ),
  ].join('\n')
}

/**
 * 丢掉内存态，下次读取时重新从文件加载
 *
 * 先把没落盘的改动写下去再丢 —— 否则调它等于把最近 5 秒的账悄悄抹了。
 */
export function reloadStats() {
  flushStats()
  cache = null
  dirty = false
}

/** 测试用：丢掉内存态并把文件删掉，从零开始 */
export function resetStats() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  cache = null
  dirty = false
  try {
    fs.rmSync(FILE, { force: true })
  } catch {
    /* 文件本来就不在也无所谓 */
  }
}

export default {
  statsFilePath,
  statsConfig,
  scopeOf,
  recordPlay,
  statsOf,
  groupBoard,
  streakOf,
  durationSecOf,
  platformOf,
  formatDuration,
  platformLabelOf,
  formatPersonalStats,
  formatBoardText,
  dayKeyOf,
  dayIndexOf,
  dayKeyFromIndex,
  flushStats,
  reloadStats,
  resetStats,
}
