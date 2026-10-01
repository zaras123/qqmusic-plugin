/**
 * 定时调度器（定时点歌触发 + 歌手新歌订阅扫描）
 *
 * 为什么**不用**框架的 plugin.task：那套 task 是「插件类里写死的静态 cron」，
 * 而这里是**用户在群里随时加、随时删**的任务（时间存在 data/ 的 JSON 里）。
 * 框架 task 只能当"每分钟滴答器"用，due 判断、去重、落盘一样都少不了 ——
 * 与其多套一层框架方言（Miao / TRSS 的 task 形状还不同），不如自己开一个
 * 30s 的 ticker，所有框架通用，due 判断还是可测的纯函数（utils/extras.js 的
 * dueSchedules）。
 *
 * 重入保护：发送链路是长任务（搜歌 + 下载 + 发语音可以到几十秒），ticker 30s
 * 一跳必须防叠 —— `running` 锁住了就跳过这一跳，下一跳自然会补上。
 */
import { logInfo, logWarn, logError } from './log.js'
import { invoke, replySafe } from './async.js'
import { loadStore, saveStore } from './store.js'
import { getCfg } from './common.js'
import { groupEventOf } from './bridge.js'
import { dueSchedules, dayKey, diffNewSongs } from './extras.js'

let started = false
let running = false

/** 启动滴答器（幂等；index.js 在应用加载完后调一次） */
export function startScheduler() {
  if (started) return
  started = true
  const timer = setInterval(() => {
    invoke(tick).catch((err) => logError(`[qqmusic] 调度器异常: ${err?.message || err}`, err))
  }, 30_000)
  timer.unref?.()
  logInfo('[qqmusic] 定时调度器已启动（定时点歌 / 歌手新歌订阅）')
}

async function tick() {
  if (running) return
  running = true
  try {
    await runDueSchedules()
    await runSubScan()
  } finally {
    running = false
  }
}

// ──────────── 定时点歌 ────────────

async function runDueSchedules() {
  const store = loadStore()
  const due = dueSchedules(store.schedules, new Date())
  if (!due.length) return

  /**
   * 先落 lastDate 再发：发送是长链路，中途重启的话「先发后记」会把同一首
   * 定时歌放两遍 —— 重复打扰全群比漏发一天更糟。离线漏发的代价由 grace
   * 窗口（晚到 10 分钟内照样补发）兜一层，剩下的算当天放弃。
   */
  for (const job of due) job.lastDate = dayKey()
  saveStore(store)

  for (const job of due) {
    try {
      const r = await fireSchedule(job)
      if (!r.ok && r.reason === 'offline') {
        logWarn(`[qqmusic] 定时点歌 ${job.time}（群 ${job.groupId}）：找不到在线的 bot / 不在群里，今天先不发`)
      }
    } catch (err) {
      logError(`[qqmusic] 定时点歌执行失败（${job.groupId} ${job.time}）: ${err?.message || err}`, err)
    }
  }
}

/** 播放链解析（与 apps/song.js 的 resolvePlay 同口径；scheduler 不能 import apps） */
async function resolvePlayFor(song, cfg, userKey) {
  const { songUrlBest } = await import('./api.js')
  const { platformQualityPref } = await import('./v2.js')
  const quality =
    song.source && song.source !== 'qq' ? platformQualityPref(cfg, song.source) : cfg.quality || 'flac'
  try {
    // songUrlBest 的返回就是 deliverSong 吃的完整形状（含 file/ekey/vkey/mediaId）
    return await songUrlBest(song.songmid, {
      quality,
      mediaId: song.media_mid || song.songmid,
      fallback: cfg.qualityFallback !== false,
      userKey,
    })
  } catch (e) {
    return { url: '', quality, error: e?.message || '获取播放链接失败' }
  }
}

async function fireSchedule(job) {
  const e = groupEventOf({ groupId: job.groupId, preferUin: job.botUin, userId: job.createdBy })
  if (!e) return { ok: false, reason: 'offline' }

  const cfg = getCfg()
  const userKey = String(e.user_id || '')
  const { searchSongs } = await import('./api.js')
  const list = await searchSongs(job.keyword, { pageSize: 1, userKey })
  if (!list.length) {
    await replySafe(e, `⏰ 定时点歌（${job.time}）：没搜到「${job.keyword}」，今天先放不了`, { tag: '定时点歌' })
    return { ok: false, reason: 'empty' }
  }
  const song = list[0]
  const play = await resolvePlayFor(song, cfg, userKey)
  if (!play.url) {
    await replySafe(
      e,
      `⏰ 定时点歌（${job.time}）：${song.songName} 取播放链失败（${play.error || '未登录或无版权'}）`,
      { tag: '定时点歌' }
    )
    return { ok: false, reason: 'no_url' }
  }
  await replySafe(e, `⏰ 定时点歌（${job.time}）：${song.songName} - ${song.singerName}`, { tag: '定时点歌' })
  const { deliverSong } = await import('./send.js')
  // 文本信息由上面那句承担，deliverSong 里那套「识别：QQ音乐」的文案不重复发
  await deliverSong(e, song, play, { skipTextInfo: true })
  return { ok: true }
}

// ──────────── 歌手新歌订阅 ────────────

async function runSubScan() {
  const cfg = getCfg()
  const hours = Number(cfg.subScanHours)
  if (!(hours > 0)) return // 0 / 未配置数字 = 关闭扫描

  const store = loadStore()
  const last = Number(store.lastSubScanAt) || 0
  if (Date.now() - last < hours * 3600_000) return

  // 先记"扫过了"再慢慢扫：扫描中途崩了/重启了，也别在下一跳接着连扫
  store.lastSubScanAt = Date.now()
  saveStore(store)

  const { pickPlayUserKey, singerSongs } = await import('./api.js')
  const userKey = pickPlayUserKey('')
  let scanned = 0
  for (const sub of store.subs) {
    if (sub?.enabled === false) continue
    scanned++
    try {
      // order=1 与「#qqm歌手」同一口径（歌手热门歌曲列表）：新歌爬进列表就会被发现
      const res = await singerSongs(sub.singermid, { pageSize: 30, order: 1, userKey })
      const current = res?.list || []
      if (!current.length) continue
      const news = diffNewSongs(current, sub.songs || [])
      sub.songs = mergeSongs(sub.songs, current, 60)
      sub.lastCheckAt = Date.now()
      if (news.length) {
        const ok = await pushNewSongs(sub, news.slice(0, 3))
        if (!ok) {
          sub.enabled = false
          sub.disabledReason = '推送失败（bot 不在群/发不出去），已自动停扫'
          logWarn(`[qqmusic] 订阅「${sub.singerName}」推送失败，已停用（群 ${sub.groupId}）`)
        }
      }
    } catch (err) {
      logWarn(`[qqmusic] 订阅扫描失败（${sub.singerName || sub.singermid}）: ${err?.message || err}`)
    }
  }
  if (scanned > 0) logInfo(`[qqmusic] 订阅扫描完成：${scanned} 个订阅`)
  saveStore(store)
}

/** 已知集合并入本轮结果（按 songmid 去重、封顶 cap，防历史累积撑爆文件） */
function mergeSongs(known = [], current = [], cap = 60) {
  const out = []
  const seen = new Set()
  for (const s of [...(Array.isArray(current) ? current : []), ...(Array.isArray(known) ? known : [])]) {
    const id = String(s?.songmid || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      songmid: id,
      songName: s.songName || '',
      singerName: s.singerName || '',
      albumName: s.albumName || '',
      cover: s.cover || '',
      interval: Number(s.interval) || 0,
    })
    if (out.length >= cap) break
  }
  return out
}

async function pushNewSongs(sub, news) {
  const e = groupEventOf({ groupId: sub.groupId, preferUin: sub.botUin, userId: sub.createdBy })
  if (!e) return false

  // 新歌列表写进本群会话：#qqm听1 就能直接播推送里的第一首
  try {
    const { setSession } = await import('./session.js')
    await setSession(sub.groupId, {
      type: 'subNew',
      keyword: sub.singerName,
      data: news,
      user_id: sub.createdBy,
    })
  } catch {
    /* 会话写失败只影响 #qqm听N 快捷播放，推送照发 */
  }

  const lines = news.map(
    (s, i) => `${i + 1}. ${s.songName} - ${s.singerName}${s.albumName ? `（${s.albumName}）` : ''}`
  )
  const text = [
    `【歌手新歌】${sub.singerName} 更新了 ${news.length} 首`,
    ...lines,
    `发送 #qqm听1 播放（#qqm订阅列表 管理）`,
  ].join('\n')

  try {
    // 列表卡优先（与点歌同一套「图失败→文本」出口；合成事件下渲染不依赖消息事件）
    const { replyListCardOrText } = await import('./common.js')
    return await replyListCardOrText(e, {
      title: `${sub.singerName} 更新了 ${news.length} 首`,
      list: news,
      options: { title: '歌手新歌', tip: '发送 #qqm听1 播放（#qqm订阅列表 管理）' },
      formatText: () => text,
      tag: '订阅推送',
    })
  } catch (err) {
    logWarn(`[qqmusic] 订阅推送渲染失败，回退纯文本: ${err?.message || err}`)
    return replySafe(e, text, { tag: '订阅推送' })
  }
}
