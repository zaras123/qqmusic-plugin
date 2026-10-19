/**
 * 新增功能的**纯函数**工具（试听 / 海报 / 订阅 / 定时点歌共用）
 *
 * ⚠️ 与 utils/command.js 同一条仓库纪律：apps 里只许导出插件类（index.js 把
 *    「第一个函数导出」当类），所以能测的逻辑一律放 utils —— 本文件不 import
 *    任何业务模块（连 log.js 都不碰），保证 test.mjs 在无框架环境里能直接跑。
 */

/**
 * 解析定时点歌的时间写法 → 归一成 `HH:MM`
 *
 * 认这些写法（中国用户最顺手的几种）：
 *   08:30 / 8:30 / 8：30（全角冒号）/ 8点30 / 8点30分 / 8点半 / 8点
 * 返回 null = 认不出（调用方回用法提示，别猜）。
 * @returns {{h:number, m:number, text:string}|null} text 是归一后的 `HH:MM`
 */
export function parseScheduleTime(raw = '') {
  const s = String(raw || '').trim().replace(/：/g, ':')
  let m1 = s.match(/^(\d{1,2})\s*[:.时点]\s*(\d{1,2})\s*分?$/)
  let h, m
  if (m1) {
    h = Number(m1[1])
    m = Number(m1[2])
  } else if ((m1 = s.match(/^(\d{1,2})\s*[点时]\s*半$/))) {
    h = Number(m1[1])
    m = 30
  } else if ((m1 = s.match(/^(\d{1,2})\s*[点时]$/))) {
    h = Number(m1[1])
    m = 0
  } else {
    return null
  }
  if (!(h >= 0 && h <= 23) || !(m >= 0 && m <= 59)) return null
  return { h, m, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}

/** 当天的本地日期键 `YYYY-MM-DD`（定时任务用它记「今天发过了没」） */
export function dayKey(d = new Date()) {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

/** `HH:MM` → 当天的分钟数（0-1439）；格式不对返回 -1 */
export function minuteOfDay(hm = '') {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return -1
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * 哪些定时任务**现在该响**
 *
 * 规则：`enabled !== false`、今天还没发过（lastDate !== 今天）、当前时间落在
 * `[time, time+grace]` 窗口里。留 grace 窗口的原因：ticker 是 30s 一跳、重启也可能
 * 错过整点 —— 只要还在「晚到 10 分钟」以内就照样补发，而不是干等明天。
 *
 * 纯函数：now 显式传入，test.mjs 喂假时间直接断言。
 * @param {Array<{time:string, enabled?:boolean, lastDate?:string}>} jobs
 * @param {Date} now
 * @param {{graceMin?:number}} [opts]
 */
export function dueSchedules(jobs, now = new Date(), { graceMin = 10 } = {}) {
  const today = dayKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return (Array.isArray(jobs) ? jobs : []).filter((j) => {
    if (!j || j.enabled === false) return false
    if (j.lastDate === today) return false
    const t = minuteOfDay(j.time)
    if (t < 0) return false
    // 跨零点：23:55 + 10 分钟窗口的一部分落在第二天 → nowMin+1440 参与比较
    const late = nowMin < t ? nowMin + 1440 : nowMin
    return t <= late && late <= t + graceMin
  })
}

/**
 * 副歌试听该截哪一段
 *
 * 没有音频分析，用「流行歌副歌大多在 40% 进度之后」的土启发式：
 *   · interval（秒）已知 → start = 40%，片段超出歌长就往回收
 *   · interval 未知     → 固定从 60s 起（大多数歌这时已经进主歌/副歌了）
 * 纯函数，test.mjs 钉边界（短歌 / 长歌 / 未知时长）。
 * @returns {{start:number, dur:number}} 秒
 */
export function chorusSegment(intervalSec, { sec = 30, from = 0.4, unknownStart = 60 } = {}) {
  const want = Math.max(5, Math.min(120, Number(sec) || 30))
  const itv = Number(intervalSec)
  if (!(itv > 0)) return { start: Math.max(0, Number(unknownStart) || 60), dur: want }
  let start = Math.round(itv * from)
  if (start + want > itv) start = Math.max(0, itv - want)
  // 歌比片段还短：从头开始放整首（dur 封顶到歌长）
  const dur = Math.min(want, itv - start)
  return { start: Math.max(0, start), dur: Math.max(1, dur) }
}

/**
 * LRC 文本 → {t(秒)|null, text}[]
 *
 * 处理三类真实脏数据：
 *   · 行首时间戳可能不止一个（`[00:12.0][01:45.0]副歌句`）→ 拆成两行
 *   · QRC 的字级标签（`词<00:12.30>字<…>`）→ 内联 `<...>` 全剥
 *   · 元数据行（作词/作曲…）保留 —— 要不要过滤是**调用方**的事
 */
export function parseLrcLines(text = '') {
  const out = []
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    const body = rawLine.replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '').trim()
    if (!body) continue
    if (stamps.length) {
      for (const s of stamps) {
        const t = Number(s[1]) * 60 + Number(s[2]) + (s[3] ? Number(`0.${s[3]}`) : 0)
        out.push({ t, text: body })
      }
    } else {
      out.push({ t: null, text: body })
    }
  }
  return out
}

/** 歌词海报里该被滤掉的元数据行（词曲作者信息不是海报要的那句） */
const LRC_META_RE = /^(作词|作曲|填词|谱曲|编曲|监制|制作人|混音|母带|lyrics?|composer|lyricist|arranger)\s*[:：]/i

/**
 * 从歌词里挑出海报要的那几句（**副歌窗口**）
 *
 * 口径与 chorusSegment 一致：时长已知 → 取 40% 进度往后第一段连续非空句；
 * 时长未知（拿不到 interval）→ 按行数取中段。挑不出（纯音乐/歌词太短）回空数组，
 * 调用方回落「整段歌词头几行」或报"没有合适的词"。
 * @param {string} lrcText 原始 LRC
 * @param {number} intervalSec 歌曲时长（秒，可 0 = 未知）
 * @param {{max?:number, from?:number}} [opts]
 */
export function pickLyricLines(lrcText, intervalSec, { max = 6, from = 0.4 } = {}) {
  const want = Math.max(2, Math.min(12, Number(max) || 6))
  const lines = parseLrcLines(lrcText).filter((l) => l.text && !LRC_META_RE.test(l.text))
  if (!lines.length) return []

  const itv = Number(intervalSec)
  if (itv > 0) {
    const target = itv * from
    const idx = lines.findIndex((l) => l.t != null && l.t >= target)
    if (idx >= 0) return lines.slice(idx, idx + want).map((l) => l.text)
    // 歌词没有打穿 40%（多是纯音乐收尾/时间轴缺失）→ 从后往前找最后一段
    const tail = lines.slice(Math.max(0, lines.length - want))
    if (tail.length >= 2) return tail.map((l) => l.text)
  }
  // 未知时长：按行数取中段
  const start = Math.min(Math.max(0, Math.round(lines.length * 0.45)), Math.max(0, lines.length - want))
  return lines.slice(start, start + want).map((l) => l.text)
}

/**
 * 订阅扫描：这轮真的有新歌吗（按 songmid 对比已知集合）
 * @param {Array<{songmid:string}>} current 这次拉到的列表
 * @param {Array<{songmid:string}>} known 上次存的
 * @returns {Array} 出现在 current、不在 known 里的（保持 current 的顺序）
 */
export function diffNewSongs(current = [], known = []) {
  const seen = new Set((Array.isArray(known) ? known : []).map((s) => String(s?.songmid || '')))
  return (Array.isArray(current) ? current : []).filter(
    (s) => s?.songmid && !seen.has(String(s.songmid))
  )
}
