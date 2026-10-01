/**
 * 新增的四件套：副歌试听 / 歌词海报 / 歌手新歌订阅 / 定时点歌
 *
 *   #qqm试听 关键词     搜歌后截「副歌窗口」一段发语音（不整首发，先听听好不好听）
 *   #qqm海报 关键词     副歌那几句 + 封面排成一张分享图（新卡片 qqmusic-poster）
 *   #qqm订阅 歌手名     主人。本群订阅歌手，新歌进歌手列表时推送到群
 *   #qqm定时 8:30 歌名  主人。每天到点把这首歌发进群（走与点歌同一条发送链）
 *
 * ⚠️ 与 utils/command.js 顶部注释同一条纪律：本文件**只许导出插件类**，
 *    辅助函数一律模块私有（或放 utils/extras.js 那份可测的纯函数里）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import { searchSongs, searchSingers, singerSongs, songUrlBest, lyric } from '../utils/api.js'
import { pickSession } from '../utils/session.js'
import { downloadAudio, sendVocal, getTempDir } from '../utils/send.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logError, logWarn } from '../utils/log.js'
import { parseScheduleTime, chorusSegment, pickLyricLines } from '../utils/extras.js'
import { loadStore, saveStore, newId } from '../utils/store.js'

const execFileAsync = promisify(execFile)

const RE_PREVIEW = /^#?(?:qq|QQ)m\s*试听(?:\s*(\S.*))?$/
const RE_POSTER = /^#?(?:qq|QQ)m\s*海报(?:\s*(\S.*))?$/
const RE_SUB_ADD = /^#?(?:qq|QQ)m\s*(?:订阅|关注)\s+(.+)$/
const RE_SUB_DEL = /^#?(?:qq|QQ)m\s*(?:退订|取消订阅|取关)\s+(.+)$/
const RE_SUB_LIST = /^#?(?:qq|QQ)m\s*(?:订阅列表|我的订阅)$/
const RE_SCHED_ADD = /^#?(?:qq|QQ)m\s*定时\s+(\S+)\s+([\s\S]+)$/
const RE_SCHED_LIST = /^#?(?:qq|QQ)m\s*(?:定时列表|定时任务)$/
const RE_SCHED_DEL = /^#?(?:qq|QQ)m\s*(?:取消定时|删除定时)\s*(\d+)?$/

/** 秒数上限：试听片段再长就失去"试听"的意义了 */
const PREVIEW_MAX_SEC = 60
const PREVIEW_MIN_SEC = 10

/** ffmpeg 自己说的话只留最后两行（原因在 stderr 里，见 utils/send.js 同款处理） */
function ffmpegDetail(err) {
  return String(err?.stderr || '')
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .slice(-2)
    .join(' | ')
}

/**
 * 探音频时长（秒）
 * ffprobe 缺失时退回 `ffmpeg -i` 的 stderr 里那行 Duration（两条路都失败 → 0，调用方用启发式兜底）
 */
async function probeDuration(file) {
  try {
    const r = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }
    )
    const v = Number(String(r.stdout || '').trim())
    if (v > 0) return v
  } catch {
    /* ffprobe 不一定随 ffmpeg 一起装了，走下面的土办法 */
  }
  try {
    await execFileAsync('ffmpeg', ['-i', file, '-f', 'null', '-'], {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    })
  } catch (err) {
    // ffmpeg 没有输出文件时会以非零退出 —— 但 Duration 已经打到 stderr 里了
    const m = String(err?.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return 0
}

/** 用 ffmpeg 截一段重编成紧凑 mp3（语音通道友好；-ss 放 -i 前走关键帧快seek） */
async function cutAudio(src, out, startSec, durSec) {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-ss', String(startSec),
      '-i', src,
      '-t', String(durSec),
      '-vn',
      '-acodec', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '96k',
      out,
    ],
    { windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }
  )
}

/** 发完别占着盘：与 deliverSong 同一套 keepFileSec 延迟清理 */
function cleanupLater(files) {
  const cfg = getCfg()
  const keep = Number(cfg.keepFileSec)
  const delay = Number.isFinite(keep) ? Math.max(0, keep) * 1000 : 60_000
  for (const f of files) {
    if (!f) continue
    if (delay === 0) {
      try {
        fs.unlinkSync(f)
      } catch {}
    } else {
      setTimeout(() => {
        try {
          fs.unlinkSync(f)
        } catch {}
      }, delay)
    }
  }
}

/**
 * 「关键词 / 序号」→ 歌曲（试听与海报共用）
 * 序号走点歌会话（与 #qqm听N 同源）；关键词搜 QQ 曲库第一条。
 * @returns {Promise<{song:object}|{reply:string}|{pass:boolean}>}
 */
async function resolveSongArg(e, arg) {
  const userKey = String(e.user_id || '')
  if (/^\d{1,2}$/.test(arg)) {
    const scope = e.group_id || e.user_id
    const { session } = await pickSession(scope, userKey)
    if (!session?.data?.length || session.type === 'mvList') return { reply: '暂无点歌列表，请先 #qqm点歌，或直接给关键词' }
    if (session.type === 'topCategory' || session.type === 'recommend') {
      return { reply: '当前列表不是歌曲，请先 #qqm点歌 关键词 列出歌曲' }
    }
    const n = Number(arg)
    if (n < 1 || n > session.data.length) return { reply: `请选择 1-${session.data.length}` }
    return { song: session.data[n - 1] }
  }
  const list = await searchSongs(arg, { pageSize: 1, userKey })
  if (!list.length) return { reply: `没有搜到「${arg}」` }
  return { song: list[0] }
}

export class qqmusicExtras extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-试听海报订阅',
      dsc: '副歌试听、歌词海报、歌手新歌订阅、定时点歌',
      event: 'message',
      priority: 520,
      rule: [
        { reg: RE_PREVIEW, fnc: 'previewCmd' },
        { reg: RE_POSTER, fnc: 'posterCmd' },
        // 订阅/定时都是「整群生效」的事，与 #qqm设置 一致限主人
        { reg: RE_SUB_ADD, fnc: 'subAdd', permission: 'master' },
        { reg: RE_SUB_DEL, fnc: 'subDel', permission: 'master' },
        { reg: RE_SUB_LIST, fnc: 'subList' },
        { reg: RE_SCHED_ADD, fnc: 'schedAdd', permission: 'master' },
        { reg: RE_SCHED_LIST, fnc: 'schedList' },
        { reg: RE_SCHED_DEL, fnc: 'schedDel', permission: 'master' },
      ],
    })
  }

  cfg() {
    return getCfg()
  }

  // ──────────── 副歌试听 ────────────

  async previewCmd(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    const arg = String(String(e.msg || '').match(RE_PREVIEW)?.[1] || '').trim()
    if (!arg) {
      await e.reply('用法：#qqm试听 关键词（点歌后也可 #qqm试听 序号）\n只发副歌片段，先听听好不好听再决定要不要整首')
      return true
    }

    let song
    try {
      const r = await resolveSongArg(e, arg)
      if (r.reply) {
        await e.reply(r.reply)
        return true
      }
      song = r.song
    } catch (err) {
      await e.reply(`试听失败：${err.message}`)
      return true
    }

    const sec = Math.max(PREVIEW_MIN_SEC, Math.min(PREVIEW_MAX_SEC, Number(cfg.previewSec) || 30))
    const userKey = String(e.user_id || '')
    try {
      await e.reply(`正在生成试听片段：${song.songName} - ${song.singerName}（约 ${sec} 秒）…`)

      // 试听只为"判断好不好听"：固定 128k —— 下得快、转得快，无损片段没有意义
      const play = await songUrlBest(song.songmid, {
        quality: '128',
        mediaId: song.media_mid || song.songmid,
        fallback: true,
        userKey,
      })
      if (!play.url) {
        await e.reply(`试听失败：${song.payplay ? '该曲需会员，请 #qqm登录' : '未获取到播放链'}`)
        return true
      }

      const dir = getTempDir()
      const dl = await downloadAudio(play.url, dir, 'qqmusic_preview', Number(cfg.downloadTimeout) || 90000, play.quality)

      // 时长已知 → 副歌启发式；未知 → 探一次真实时长，再不行按 60s 起放
      let interval = Number(song.interval) || 0
      if (!interval) interval = await probeDuration(dl.filePath)
      const seg = chorusSegment(interval, { sec })

      const out = path.join(dir, `qqmusic_preview_${Date.now()}.mp3`)
      try {
        await cutAudio(dl.filePath, out, seg.start, seg.dur)
      } catch (err) {
        logError(`试听裁剪失败: ${err.message}${ffmpegDetail(err) ? `（ffmpeg: ${ffmpegDetail(err)}）` : ''}`)
        await e.reply('试听片段生成失败（ffmpeg 裁剪出错），可换一首试试')
        cleanupLater([dl.filePath])
        return true
      }

      cleanupLater([dl.filePath, out])
      const ok = await sendVocal(e, out)
      if (!ok) await e.reply('试听语音发送失败（协议端拒收），可稍后再试')
      return true
    } catch (err) {
      logError(`试听失败: ${err.message}`)
      await e.reply(`试听失败：${err.message}`)
      return true
    }
  }

  // ──────────── 歌词海报 ────────────

  async posterCmd(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const arg = String(String(e.msg || '').match(RE_POSTER)?.[1] || '').trim()
    if (!arg) {
      await e.reply('用法：#qqm海报 关键词（点歌后也可 #qqm海报 序号）\n把副歌那几句排成一张可转发的分享图')
      return true
    }

    let song
    try {
      const r = await resolveSongArg(e, arg)
      if (r.reply) {
        await e.reply(r.reply)
        return true
      }
      song = r.song
    } catch (err) {
      await e.reply(`歌词海报失败：${err.message}`)
      return true
    }

    const userKey = String(e.user_id || '')
    try {
      const data = await lyric(song.songmid, userKey)
      const lrc = data?.lyric || ''
      const lines = pickLyricLines(lrc, Number(song.interval) || 0, { max: 6 })
      if (!lines.length) {
        await e.reply(`「${song.songName}」没找到合适的歌词片段（纯音乐或暂无歌词）`)
        return true
      }

      const { buildPosterCardData } = await import('../utils/card-data.js')
      const { renderPosterCard } = await import('../utils/render.js')
      const card = buildPosterCardData({
        songName: song.songName,
        singerName: song.singerName,
        albumName: song.albumName,
        cover: song.cover,
        songmid: song.songmid,
        lines,
      })
      await replyCardOrText(e, {
        render: renderPosterCard,
        data: card,
        formatText: () =>
          [`♪ 歌词海报：${card.songName} - ${card.singerName}`, ...lines].join('\n'),
        tag: '歌词海报',
      })
      return true
    } catch (err) {
      logError(`歌词海报失败: ${err.message}`)
      await e.reply(`歌词海报失败：${err.message}`)
      return true
    }
  }

  // ──────────── 歌手新歌订阅 ────────────

  async subAdd(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    if (!e.group_id) {
      await e.reply('订阅要在群里用（新歌是推到群里的，私聊没有意义）')
      return true
    }
    const keyword = String(String(e.msg || '').match(RE_SUB_ADD)?.[1] || '').trim()
    if (!keyword) {
      await e.reply('用法：#qqm订阅 歌手名')
      return true
    }

    const userKey = String(e.user_id || '')
    try {
      await e.reply(`正在找歌手：${keyword}…`)
      const singers = await searchSingers(keyword, { pageSize: 5, userKey })
      if (!singers.length) {
        await e.reply('没有找到相关歌手')
        return true
      }
      const singer = singers[0]
      const store = loadStore()
      const groupId = String(e.group_id)
      const dup = store.subs.find((s) => s.groupId === groupId && s.singermid === singer.singermid && s.enabled !== false)
      if (dup) {
        await e.reply(`本群已经订阅过「${singer.singerName}」了（#qqm订阅列表 查看）`)
        return true
      }
      const max = Math.max(1, Number(cfg.subMaxPerGroup) || 10)
      const count = store.subs.filter((s) => s.groupId === groupId && s.enabled !== false).length
      if (count >= max) {
        await e.reply(`本群订阅已达上限（${max} 个），先 #qqm退订 几个再加`)
        return true
      }

      // 基线：把现在的列表记下来 —— 否则首次扫描会把整个热门列表当"新歌"推一遍
      const base = await singerSongs(singer.singermid, { pageSize: 30, order: 1, userKey })
      store.subs.push({
        id: newId('s'),
        groupId,
        botUin: String(e.self_id || e.bot?.uin || ''),
        singermid: singer.singermid,
        singerName: singer.singerName || keyword,
        createdBy: String(e.user_id || ''),
        createdAt: Date.now(),
        lastCheckAt: Date.now(),
        songs: base?.list || [],
      })
      saveStore(store)

      const hours = Number(cfg.subScanHours) > 0 ? Number(cfg.subScanHours) : 6
      await e.reply(
        `已订阅「${singer.singerName}」：新歌进入歌手歌曲列表时推到本群（约每 ${hours} 小时查一次）\n` +
          `#qqm订阅列表 查看 · #qqm退订 ${singer.singerName} 退订`
      )
      return true
    } catch (err) {
      logError(`订阅失败: ${err.message}`)
      await e.reply(`订阅失败：${err.message}`)
      return true
    }
  }

  async subDel(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    if (!e.group_id) {
      await e.reply('请在群里操作（订阅是按群记的）')
      return true
    }
    const arg = String(String(e.msg || '').match(RE_SUB_DEL)?.[1] || '').trim()
    if (!arg) {
      await e.reply('用法：#qqm退订 序号 或 #qqm退订 歌手名（序号见 #qqm订阅列表）')
      return true
    }
    const store = loadStore()
    const groupId = String(e.group_id)
    const mine = store.subs.filter((s) => s.groupId === groupId && s.enabled !== false)
    if (!mine.length) {
      await e.reply('本群还没有订阅（#qqm订阅 歌手名 添加）')
      return true
    }

    let hit = null
    if (/^\d+$/.test(arg)) {
      hit = mine[Number(arg) - 1] || null
    } else {
      hit = mine.find((s) => s.singerName === arg) || mine.find((s) => s.singerName.includes(arg)) || null
    }
    if (!hit) {
      await e.reply(`没找到这个订阅：${arg}（可用序号见 #qqm订阅列表）`)
      return true
    }
    store.subs = store.subs.filter((s) => s !== hit)
    saveStore(store)
    await e.reply(`已退订「${hit.singerName}」`)
    return true
  }

  async subList(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    if (!e.group_id) {
      await e.reply('请在群里查看（订阅是按群记的）')
      return true
    }
    const store = loadStore()
    const mine = store.subs.filter((s) => s.groupId === String(e.group_id) && s.enabled !== false)
    if (!mine.length) {
      await e.reply('本群还没有订阅：主人发 #qqm订阅 歌手名 添加（新歌自动推到本群）')
      return true
    }
    const hours = Number(cfg.subScanHours) > 0 ? Number(cfg.subScanHours) : 6
    await e.reply(
      [
        `本群的歌手订阅（${mine.length} 个，约每 ${hours} 小时查一次）`,
        ...mine.map((s, i) => `${i + 1}. ${s.singerName}　#qqm退订 ${i + 1}`),
      ].join('\n')
    )
    return true
  }

  // ──────────── 定时点歌 ────────────

  async schedAdd(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    if (!e.group_id) {
      await e.reply('定时点歌要在群里用（到点是发到群里的）')
      return true
    }
    const m = String(e.msg || '').match(RE_SCHED_ADD)
    const t = parseScheduleTime(m?.[1])
    const keyword = String(m?.[2] || '').trim()
    if (!t || !keyword) {
      await e.reply('用法：#qqm定时 8:30 歌名（也认 8点30 / 8点半 / 20:00）\n到点后机器人会把这首歌发进群（每天一次）')
      return true
    }

    const store = loadStore()
    const groupId = String(e.group_id)
    const dup = store.schedules.find(
      (s) => s.groupId === groupId && s.time === t.text && s.keyword === keyword && s.enabled !== false
    )
    if (dup) {
      await e.reply(`已经有一个一样的定时了（每天 ${t.text} 播「${keyword}」）`)
      return true
    }
    const max = Math.max(1, Number(cfg.scheduleMaxPerGroup) || 10)
    const count = store.schedules.filter((s) => s.groupId === groupId && s.enabled !== false).length
    if (count >= max) {
      await e.reply(`本群定时已达上限（${max} 条），先 #qqm取消定时 清几条`)
      return true
    }

    store.schedules.push({
      id: newId('j'),
      groupId,
      botUin: String(e.self_id || e.bot?.uin || ''),
      time: t.text,
      keyword,
      createdBy: String(e.user_id || ''),
      createdAt: Date.now(),
      lastDate: '',
    })
    saveStore(store)
    await e.reply(
      `⏰ 已设置：每天 ${t.text} 播放「${keyword}」\n#qqm定时列表 查看 · #qqm取消定时 序号 删除`
    )
    return true
  }

  async schedList(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const store = loadStore()
    const mine = store.schedules.filter((s) => s.groupId === String(e.group_id || '') && s.enabled !== false)
    if (!mine.length) {
      await e.reply('本群还没有定时点歌：主人发 #qqm定时 8:30 歌名 添加')
      return true
    }
    await e.reply(
      [
        `本群的定时点歌（${mine.length} 条，每天到点自动播放）`,
        ...mine.map((s, i) => `${i + 1}. 每天 ${s.time} → 「${s.keyword}」`),
        '删除：#qqm取消定时 序号',
      ].join('\n')
    )
    return true
  }

  async schedDel(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    if (!e.group_id) {
      await e.reply('请在群里操作（定时是按群记的）')
      return true
    }
    const arg = String(String(e.msg || '').match(RE_SCHED_DEL)?.[1] || '').trim()
    const store = loadStore()
    const groupId = String(e.group_id)
    const mine = store.schedules.filter((s) => s.groupId === groupId && s.enabled !== false)
    if (!mine.length) {
      await e.reply('本群还没有定时点歌（#qqm定时 8:30 歌名 添加）')
      return true
    }
    if (!/^\d+$/.test(arg)) {
      await e.reply(`用法：#qqm取消定时 序号（1-${mine.length}，见 #qqm定时列表）`)
      return true
    }
    const hit = mine[Number(arg) - 1]
    if (!hit) {
      await e.reply(`请选择 1-${mine.length}`)
      return true
    }
    store.schedules = store.schedules.filter((s) => s !== hit)
    saveStore(store)
    await e.reply(`已删除：每天 ${hit.time} → 「${hit.keyword}」`)
    return true
  }
}
