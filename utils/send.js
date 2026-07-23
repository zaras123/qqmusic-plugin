/**
 * 发送音乐：文本 / 卡片 / 下载语音 / 群文件
 * 适配 TRSS-Yunzai：
 *  - ICQQ-Plugin + 本地 @icqqjs/icqq
 *  - OneBotv11 反向 WS（NapCat / LLOneBot / Lagrange 等）
 *  - QQBot-Plugin（gitee.com/ts-yf/QQBot-Plugin 官方机器人）
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import axios from 'axios'
import { yunzaiPath } from './path.js'
import {
  detectAdapter,
  ensureSegment,
  normalizeMediaFile,
  isLocalPath,
} from './adapter.js'
import {
  QUALITY_LADDER,
  QUALITY_LABEL,
  qualityCandidates,
  QQMUSIC_QUALITY_LIST,
} from './quality.js'
import { logInfo, logWarn } from './log.js'
import { getCfg } from './common.js'

const execFileAsync = promisify(execFile)

/** QQBot-Plugin makeRecord 直传白名单（见 forceSilk=false 时） */
const QQBOT_DIRECT_AUDIO_EXT = new Set(['silk', 'wav', 'mp3', 'flac'])

export {
  QUALITY_LADDER,
  QUALITY_LABEL,
  qualityCandidates,
  QQMUSIC_QUALITY_LIST,
}

/** 腾讯官方 files 接口偶发"系统繁忙"等可重试错误 */
const QQ_RETRYABLE = /系统繁忙|繁忙|50015014|50015015|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 对易瞬时失败的回调做退避重试（QQBot files 接口偏好）
 * @param {(attempt:number)=>Promise<any>} fn
 * @param {object} opts
 */
async function withRetry(fn, { times = 3, baseMs = 1500, retryIf = () => true, tag = '' } = {}) {
  let lastErr = null
  for (let i = 1; i <= times; i++) {
    try {
      return await fn(i)
    } catch (err) {
      lastErr = err
      const msg = err?.message || String(err)
      if (!retryIf(err, msg)) throw err
      if (i < times) {
        const wait = baseMs * i + Math.floor(Math.random() * 500)
        logWarn(`${tag}第${i}次失败：${msg}（${wait}ms 后重试）`)
        await sleep(wait)
      } else {
        logWarn(`${tag}重试 ${times} 次仍失败：${msg}`)
      }
    }
  }
  throw lastErr
}

/** OneBot sendApi 封装（TRSS 绑定为 bot.sendApi(action, params)） */
async function botSendApi(e, action, params = {}) {
  const bot = e?.bot
  if (!bot?.sendApi) return null
  try {
    // TRSS OneBotv11: sendApi(action, params)
    return await bot.sendApi(action, params)
  } catch (err) {
    // 兼容偶发 (data, ws, action, params) 未 bind 的情况
    try {
      if (bot.sendApi.length >= 3) {
        return await bot.sendApi(e, bot.ws || bot, action, params)
      }
    } catch {
      /* fallthrough */
    }
    throw err
  }
}

export async function sendNativeMusicCard(e, platformType, musicId) {
  const adapter = detectAdapter(e)
  if (adapter.kind === 'qqbot') {
    // 官方 QQBot 无 go-cq 风格 music 段
    return false
  }

  const id = String(musicId)
  await ensureSegment()

  // 1) OneBot API
  if (adapter.kind === 'onebot' && e.bot?.sendApi) {
    try {
      const message = [{ type: 'music', data: { type: platformType, id } }]
      if (e.group_id) {
        await botSendApi(e, 'send_group_msg', { group_id: e.group_id, message })
        return true
      }
      if (e.user_id) {
        await botSendApi(e, 'send_private_msg', { user_id: e.user_id, message })
        return true
      }
      await botSendApi(e, 'send_msg', {
        group_id: e.group_id,
        user_id: e.user_id,
        message,
      })
      return true
    } catch (err) {
      logWarn(`sendApi 原生卡失败: ${err.message}`)
    }
  }

  // 2) segment.music（ICQQ 若挂载了 oicq 扩展）
  if (global.segment?.music) {
    try {
      await e.reply(segment.music(platformType, id))
      return true
    } catch (err) {
      logWarn(`segment.music 失败: ${err.message}`)
    }
  }

  // 3) 原始 music 对象
  try {
    await e.reply({ type: 'music', data: { type: platformType, id } })
    return true
  } catch (err) {
    logWarn(`原生音乐卡发送失败: ${err.message}`)
    return false
  }
}

export async function sendCustomMusicCard(
  e,
  { url, audio, title, image, content = '', musicType = 'custom' }
) {
  const adapter = detectAdapter(e)
  if (adapter.kind === 'qqbot') return false

  const data = {
    type: musicType,
    url: url || audio,
    audio: audio || url,
    title: title || 'QQ音乐',
    image: image || '',
  }
  if (content) data.content = content

  if (adapter.kind === 'onebot' && e.bot?.sendApi) {
    try {
      const message = [{ type: 'music', data }]
      if (e.group_id) {
        await botSendApi(e, 'send_group_msg', { group_id: e.group_id, message })
        return true
      }
      if (e.user_id) {
        await botSendApi(e, 'send_private_msg', { user_id: e.user_id, message })
        return true
      }
    } catch (err) {
      logWarn(`sendApi 自定义卡失败: ${err.message}`)
    }
  }

  try {
    await e.reply({ type: 'music', data })
    return true
  } catch (err) {
    logWarn(`自定义音乐卡失败: ${err.message}`)
    return false
  }
}

/**
 * QQBot 语音前处理：
 * ts-yf QQBot-Plugin 的 makeRecord 仅在扩展名为 silk/wav/mp3/flac 时跳过转码；
 * QQ 音乐常见 C400/m4a 会触发 ffmpeg→pcm→silk（整首 5 分钟会很重）。
 * 这里先转成 mp3，让适配器直传。
 */
async function prepareQqbotRecordFile(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return filePath
  }
  const abs = path.resolve(filePath)
  const ext = path.extname(abs).slice(1).toLowerCase()
  if (QQBOT_DIRECT_AUDIO_EXT.has(ext)) return abs

  const out = path.join(
    path.dirname(abs),
    `${path.basename(abs, path.extname(abs))}_qqbot.mp3`
  )
  if (fs.existsSync(out) && fs.statSync(out).size > 256) return out

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        abs,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-b:a',
        '128k',
        out,
      ],
      { windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 }
    )
    if (fs.existsSync(out) && fs.statSync(out).size > 256) {
      logInfo(`QQBot 语音预处理: ${path.basename(abs)} → ${path.basename(out)}`)
      return out
    }
  } catch (err) {
    logWarn(`QQBot 转 mp3 失败，回退原文件: ${err.message}`)
  }
  return abs
}

/**
 * 发送语音
 * - ICQQ：本地路径 / Buffer 均可
 * - OneBot WS：本地路径或 base64://
 * - QQBot：record → 适配器转 audio；mp3/flac 可直传（fork 默认 forceSilk=false）
 *           m4a 等会先转 mp3，避免整首走 silk
 */
export async function sendVocal(e, fileOrUrl, httpFallback) {
  if (!fileOrUrl) return false
  await ensureSegment()
  const adapter = detectAdapter(e)

  const trySend = async (raw) => {
    let file = normalizeMediaFile(raw)
    if (isLocalPath(file) && fs.existsSync(file)) {
      file = path.resolve(file)
    }

    // QQBot：m4a 等先转 mp3，再交给适配器（避免 makeRecord 强制 silk）
    if (adapter.kind === 'qqbot') {
      if (isLocalPath(file) && fs.existsSync(file)) {
        file = await prepareQqbotRecordFile(file)
      }
      if (global.segment?.record) {
        await e.reply(segment.record(file))
        return true
      }
      await e.reply({ type: 'record', file })
      return true
    }

    // OneBot：部分实现本地路径不稳，失败时再 base64
    if (adapter.kind === 'onebot' && isLocalPath(file) && fs.existsSync(file)) {
      try {
        if (global.segment?.record) {
          await e.reply(segment.record(file))
          return true
        }
        await e.reply({ type: 'record', file })
        return true
      } catch (err) {
        logWarn(`OneBot 本地语音失败，尝试 base64: ${err.message}`)
        const b64 = fs.readFileSync(file).toString('base64')
        const payload = `base64://${b64}`
        if (global.segment?.record) {
          await e.reply(segment.record(payload))
          return true
        }
        await e.reply({ type: 'record', file: payload })
        return true
      }
    }

    // ICQQ / 通用
    if (global.segment?.record) {
      await e.reply(segment.record(file))
      return true
    }
    await e.reply({ type: 'record', file })
    return true
  }

  try {
    return await trySend(fileOrUrl)
  } catch (err) {
    logWarn(`语音发送失败(${adapter.kind}): ${err.message}`)
    if (httpFallback && String(httpFallback).startsWith('http')) {
      try {
        return await trySend(httpFallback)
      } catch (err2) {
        logWarn(`语音直链回退失败: ${err2.message}`)
      }
    }
    // OneBot 再试 sendApi
    if (adapter.kind === 'onebot' && e.bot?.sendApi) {
      try {
        let file = normalizeMediaFile(fileOrUrl)
        if (isLocalPath(file) && fs.existsSync(file)) {
          file = `base64://${fs.readFileSync(file).toString('base64')}`
        }
        const message = [{ type: 'record', data: { file } }]
        if (e.group_id) {
          await botSendApi(e, 'send_group_msg', { group_id: e.group_id, message })
          return true
        }
        if (e.user_id) {
          await botSendApi(e, 'send_private_msg', { user_id: e.user_id, message })
          return true
        }
      } catch (err3) {
        logWarn(`sendApi 语音失败: ${err3.message}`)
      }
    }
    return false
  }
}

export async function downloadAudio(url, saveDir, filename = 'song', timeout = 90000, qualityHint = '') {
  if (!url) throw new Error('空下载地址')
  fs.mkdirSync(saveDir, { recursive: true })
  // 磁盘文件名尽量 ASCII，避免 Windows/Highway 路径坑；展示名在 upload 时再处理
  let safe = String(filename)
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!safe || safe.length < 2) safe = 'qqmusic'
  let ext = '.mp3'
  const u = url.toLowerCase()
  const q = String(qualityHint || '').toLowerCase()
  if (['flac', 'hires', 'master', 'atmos', 'atmos_master'].includes(q)) ext = '.flac'
  else if (q === 'ape') ext = '.ape'
  else if (q === 'm4a') ext = '.m4a'
  else if (
    u.includes('.flac') ||
    u.includes('f000') ||
    u.includes('rs01') ||
    u.includes('rs02') ||
    u.includes('q000')
  ) {
    ext = '.flac'
  } else if (u.includes('.m4a') || u.includes('c400')) ext = '.m4a'
  else if (u.includes('.ape') || u.includes('a000')) ext = '.ape'
  else if (u.includes('.ogg')) ext = '.ogg'
  else if (u.includes('m800') || u.includes('m500') || u.includes('.mp3')) ext = '.mp3'

  const filePath = path.join(saveDir, `${safe}_${Date.now()}${ext}`)

  const candidates = buildDownloadCandidates(url)
  let lastErr = null

  for (const tryUrl of candidates) {
    try {
      const res = await axios.get(tryUrl, {
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 5,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://y.qq.com/',
          Origin: 'https://y.qq.com',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Connection: 'keep-alive',
        },
        validateStatus: () => true,
      })
      if (res.status >= 400) {
        lastErr = new Error(`下载失败 HTTP ${res.status}`)
        logWarn(`下载 ${res.status}: ${tryUrl.slice(0, 90)}…`)
        continue
      }
      const buf = Buffer.from(res.data)
      if (buf.length < 256) {
        lastErr = new Error('下载内容过小，可能链接失效')
        continue
      }
      const head = buf.slice(0, 32).toString('utf8').toLowerCase()
      if (head.includes('<html') || head.includes('<!doctype')) {
        lastErr = new Error('下载到 HTML 页面，链接可能失效')
        continue
      }
      fs.writeFileSync(filePath, buf)
      return { filePath, size: buf.length, ext, url: tryUrl }
    } catch (err) {
      lastErr = err
      logWarn(`下载异常: ${err.message}`)
    }
  }
  throw lastErr || new Error('下载失败')
}

/** 同一 vkey 在不同 QQ 音乐 CDN 域名间尝试 */
function buildDownloadCandidates(url) {
  const list = []
  const push = (u) => {
    if (u && !list.includes(u)) list.push(u)
  }
  push(url)
  try {
    if (url.startsWith('http://')) push(url.replace(/^http:\/\//i, 'https://'))
    if (url.startsWith('https://')) push(url.replace(/^https:\/\//i, 'http://'))

    const u = new URL(url)
    const hosts = [
      u.host,
      'aqqmusic.tc.qq.com',
      'ws.stream.qqmusic.qq.com',
      'isure.stream.qqmusic.qq.com',
      'dl.stream.qqmusic.qq.com',
      'streamoc.music.tc.qq.com',
      'mobileoc.music.tc.qq.com',
    ]
    for (const host of hosts) {
      for (const proto of ['http:', 'https:']) {
        push(`${proto}//${host}${u.pathname}${u.search}`)
      }
    }
  } catch {
    /* keep original only */
  }
  return list
}

export function getTempDir() {
  const cfg = getCfg()
  const rel = cfg.tempDir || 'temp/qqmusic-plugin'
  return path.isAbsolute(rel) ? rel : path.join(yunzaiPath, rel)
}

export function formatSize(bytes) {
  const n = Number(bytes)
  if (!n || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/**
 * 规整曲名/歌手：去掉括号备注、非法路径字符、压缩空白
 * 例：「恋愛サーキュレーション (恋爱循环)（《化物语》…」→「恋愛サーキュレーション」
 */
export function cleanTrackText(s = '', maxLen = 40) {
  let t = String(s || '')
  // 统一括号族，便于剥备注
  t = t
    .replace(/[（【「『]/g, '(')
    .replace(/[）】」』]/g, ')')
    .replace(/[《〈]/g, '(')
    .replace(/[》〉]/g, ')')
  // 反复去掉成对 (...)（含嵌套一层）
  for (let i = 0; i < 6; i++) {
    const next = t.replace(/\([^()]*\)/g, ' ')
    if (next === t) break
    t = next
  }
  // 未闭合括号及之后（分享标题常被截断）
  t = t.replace(/\([^)]*$/g, ' ')
  // 路径与控制字符
  t = t.replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
  t = t.replace(/[…·•]+/g, ' ')
  t = t.replace(/[.。]{2,}/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^[-_\s.]+|[-_\s.]+$/g, '')
  if (maxLen > 0 && t.length > maxLen) t = t.slice(0, maxLen).trim()
  return t
}

/**
 * 群文件展示名（规整）：
 *   歌手-歌名.flac
 * Highway 失败时 asciiOnly → QQMusic_时间.ext
 */
export function buildMusicFileName(
  { singer = '', title = '', quality = '', ext = '.flac' } = {},
  { asciiOnly = false, includeQuality = false } = {}
) {
  const safeExt = /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : '.mp3'
  const q = String(quality || '').toLowerCase()
  const qTag =
    includeQuality && q && !['auto', 'adaptive', 'best'].includes(q)
      ? `_${q.replace(/[^a-z0-9_]/g, '')}`
      : ''

  let artist = cleanTrackText(singer, 24)
  let name = cleanTrackText(title, 36)
  if (!name) name = '未知歌曲'
  if (!artist) artist = '未知歌手'

  let stem = `${artist}-${name}${qTag}`
  stem = stem
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .slice(0, 72)

  if (asciiOnly) {
    const ascii = stem
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[-_]+|[-_]+$/g, '')
    // 几乎只剩符号时不要用
    stem =
      ascii && /[A-Za-z0-9]{2,}/.test(ascii)
        ? ascii
        : `QQMusic_${Date.now().toString(36)}`
  }

  if (!stem || stem === '-') stem = `QQMusic_${Date.now().toString(36)}`
  return `${stem}${safeExt}`
}

/** 兼容旧调用：从磁盘路径剥名字（尽量别用，优先 buildMusicFileName） */
export function safeUploadFileName(filePathOrName, { asciiOnly = false } = {}) {
  const base = path.basename(String(filePathOrName || 'song'))
  const ext = path.extname(base) || '.mp3'
  let stem = path.basename(base, ext)
  // 去掉下载时拼的 _时间戳
  stem = stem.replace(/_\d{10,}$/g, '')
  // 旧格式 singer-title
  const m = stem.match(/^(.+?)-(.+)$/)
  if (m) {
    return buildMusicFileName(
      { singer: m[1], title: m[2], ext },
      { asciiOnly }
    )
  }
  return buildMusicFileName({ title: stem || 'song', ext }, { asciiOnly })
}

function isHighwayError(err) {
  const msg = String(err?.message || err || '')
  return /210005|Highway|httpUpload|上传.*失败|retcode.?1200/i.test(msg)
}

/**
 * 上传/发送音频文件
 * @param {string} [displayName] 群里显示的文件名；不传则从路径推断
 */
export async function uploadGroupFile(e, filePath, displayName) {
  if (!filePath || !fs.existsSync(filePath)) return false
  const abs = path.resolve(filePath)
  const ext = path.extname(abs) || '.mp3'

  let prettyName =
    displayName && String(displayName).trim()
      ? safeUploadFileName(displayName, { asciiOnly: false })
      : safeUploadFileName(abs, { asciiOnly: false })
  // 保证扩展名与真实文件一致
  if (!prettyName.toLowerCase().endsWith(ext.toLowerCase())) {
    prettyName = prettyName.replace(/\.[A-Za-z0-9]{1,8}$/, '') + ext
  }
  const asciiName = buildMusicFileName(
    {
      title: path.basename(prettyName, path.extname(prettyName)),
      ext,
    },
    { asciiOnly: true }
  )

  const adapter = detectAdapter(e)
  await ensureSegment()

  const namesToTry = prettyName === asciiName ? [prettyName] : [prettyName, asciiName]

  // 私聊
  if (!e.group_id) {
    for (const name of namesToTry) {
      try {
        if (adapter.kind === 'qqbot' || adapter.preferSegmentFile) {
          if (global.segment?.file) {
            await e.reply(segment.file(abs, name))
            return true
          }
        }
        if (e.friend?.sendFile) {
          await e.friend.sendFile(abs, name)
          return true
        }
        if (adapter.kind === 'onebot' && e.bot?.sendApi && e.user_id) {
          await botSendApi(e, 'upload_private_file', {
            user_id: e.user_id,
            file: abs,
            name,
          })
          return true
        }
        if (global.segment?.file) {
          await e.reply(segment.file(abs, name))
          return true
        }
      } catch (err) {
        logWarn(`私聊文件发送失败(${adapter.kind}, ${name}): ${err.message}`)
        if (!isHighwayError(err) && name === prettyName) continue
      }
    }
    return false
  }

  const errors = []

  // —— OneBot：先 upload_group_file（大文件专用），再 group.sendFile ——
  if (adapter.kind === 'onebot' && e.bot?.sendApi) {
    for (const name of namesToTry) {
      try {
        await botSendApi(e, 'upload_group_file', {
          group_id: e.group_id,
          file: abs,
          name,
        })
        logInfo(`群文件 upload_group_file 成功: ${name}`)
        return true
      } catch (err) {
        errors.push(`upload_group_file(${name}): ${err.message}`)
        logWarn(`upload_group_file 失败: ${err.message}`)
      }
    }
  }

  // —— QQBot：segment.file ——
  if (adapter.kind === 'qqbot' || adapter.preferSegmentFile) {
    for (const name of namesToTry) {
      try {
        if (global.segment?.file) {
          await e.reply(segment.file(abs, name))
          return true
        }
        await e.reply({ type: 'file', file: abs, name })
        return true
      } catch (err) {
        errors.push(`segment.file(${name}): ${err.message}`)
      }
    }
  }

  // —— ICQQ：fs.upload / sendFile(file, pid, name) ——
  if (adapter.kind === 'icqq' || e.group?.fs?.upload) {
    for (const name of namesToTry) {
      try {
        if (e.group?.fs?.upload) {
          await e.group.fs.upload(abs, '/', name)
          return true
        }
      } catch (err) {
        errors.push(`fs.upload(${name}): ${err.message}`)
      }
      try {
        if (e.group?.sendFile) {
          await e.group.sendFile(abs, '/', name)
          return true
        }
      } catch (err) {
        errors.push(`icqq.sendFile(${name}): ${err.message}`)
      }
    }
  }

  // —— 通用 sendFile（OneBot 两参）——
  if (e.group?.sendFile && adapter.kind !== 'icqq') {
    for (const name of namesToTry) {
      try {
        await e.group.sendFile(abs, name)
        return true
      } catch (err) {
        errors.push(`group.sendFile(${name}): ${err.message}`)
      }
    }
  }

  // —— 非 OneBot 才兜底 segment.file（OneBot 大文件走 send_msg 易 Highway 炸）——
  if (adapter.kind !== 'onebot' && global.segment?.file) {
    for (const name of namesToTry) {
      try {
        await e.reply(segment.file(abs, name))
        return true
      } catch (err) {
        errors.push(`fallback segment.file(${name}): ${err.message}`)
      }
    }
  }

  logWarn(`上传群文件失败(${adapter.kind}): ${errors.join(' | ')}`)
  return false
}

/**
 * 综合发送（点歌 / 卡片解析共用）
 * 流程: (可选文案/音乐卡) → 下载 → 语音 → 群文件
 */
export async function deliverSong(e, song, play, options = {}) {
  const cfg = getCfg()
  const adapter = detectAdapter(e)
  const title = song.songName || '未知歌曲'
  const singer = song.singerName || '未知歌手'
  const cover =
    song.cover ||
    (song.albummid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.albummid}.jpg`
      : 'https://y.gtimg.cn/mediastyle/global/img/album_300.png')
  const pageUrl = song.songmid
    ? `https://y.qq.com/n/ryqq/songDetail/${song.songmid}`
    : 'https://y.qq.com/'

  const qualityLabel =
    play?.qualityLabel ||
    QUALITY_LABEL[play?.quality] ||
    play?.quality ||
    cfg.quality ||
    ''

  const skipText = options.skipTextInfo === true
  const skipNative = options.skipNativeCard === true
  const skipCustom = options.skipCustomCard === true

  // QQBot 原生/自定义 music 卡基本不可用，强制跳过避免刷错误日志
  const allowNative = !skipNative && cfg.sendNativeCard && adapter.supportsNativeMusic
  const allowCustom = !skipCustom && cfg.sendCustomCard && adapter.supportsNativeMusic

  if (!skipText && cfg.sendTextInfo !== false) {
    const lines = [
      `${cfg.identifyPrefix || ''}QQ音乐`,
      `♪ ${title} - ${singer}`,
      song.albumName ? `专辑：${song.albumName}` : '',
      qualityLabel ? `音质：${qualityLabel}` : '',
      adapter.kind !== 'unknown' ? `通道：${adapter.name || adapter.kind}` : '',
      play?.url ? '' : '⚠ 未获取到播放链，请 #qqm登录',
    ].filter(Boolean)
    await e.reply(lines.join('\n'))
  }

  if (allowNative && song.songid) {
    await sendNativeMusicCard(e, 'qq', song.songid)
  }

  if (allowCustom && play?.url) {
    await sendCustomMusicCard(e, {
      url: pageUrl,
      audio: play.url,
      title,
      image: cover,
      content: singer,
      musicType: 'custom',
    })
  }

  if (!play?.url) return { ok: false, reason: 'no_url', adapter: adapter.kind }

  const needDownload = cfg.sendVocal || cfg.uploadFile
  if (!needDownload) return { ok: true, downloaded: false, adapter: adapter.kind }

  let localPath = ''
  let size = 0
  /** 群文件/好友文件展示名（规整后的 歌手-歌名.ext） */
  let displayName = ''
  try {
    const dir = getTempDir()
    const timeout = Number(cfg.downloadTimeout) || 120000
    const tryUrls = [play.url]
    let dl = null
    let lastErr = null
    for (let i = 0; i < tryUrls.length; i++) {
      try {
        dl = await downloadAudio(
          tryUrls[i],
          dir,
          // 磁盘临时名尽量短 ASCII；展示名另算
          'qqmusic',
          timeout,
          play.quality || cfg.quality || ''
        )
        break
      } catch (err) {
        lastErr = err
        logWarn(`下载尝试失败: ${err.message}`)
        if (song.songmid && i === 0) {
          try {
            const { songUrlBest } = await import('./api.js')
            const prefer =
              /RS01|RS02|Q000|master|atmos|hires/i.test(
                String(play.quality || '') + String(play.url || '')
              )
                ? 'flac'
                : play.quality || cfg.quality || 'flac'
            const fresh = await songUrlBest(song.songmid, {
              quality: prefer,
              mediaId: song.media_mid || play.mediaId || song.songmid,
              fallback: true,
            })
            if (fresh?.url && fresh.url !== tryUrls[0]) {
              tryUrls.push(fresh.url)
              play = { ...play, ...fresh }
            }
          } catch (e2) {
            logWarn(`刷新播放链失败: ${e2.message}`)
          }
        }
      }
    }
    if (!dl) throw lastErr || new Error('下载失败')
    localPath = dl.filePath
    size = dl.size
    // 群文件展示名：歌手-歌名.ext（规整，不含时间戳）
    const fileExt = path.extname(localPath) || '.mp3'
    displayName = buildMusicFileName(
      {
        singer,
        title,
        quality: play.quality || cfg.quality || '',
        ext: fileExt,
      },
      { asciiOnly: false, includeQuality: false }
    )
    logInfo(`已下载 ${path.basename(localPath)} → 展示名 ${displayName} ${formatSize(size)} [${adapter.kind}]`)
  } catch (err) {
    logWarn(`下载失败: ${err.message}`)
    await e.reply(
      `下载音频失败：${err.message}\n可尝试 #qqm登录 后重发，或换一首歌`
    )
    if (cfg.sendVocal) {
      await sendVocal(e, play.url)
    }
    return { ok: false, reason: 'download_fail', error: err.message, adapter: adapter.kind }
  }

  const cleanupPaths = new Set()
  if (localPath) cleanupPaths.add(localPath)

  if (cfg.sendVocal) {
    let vocalPath = localPath
    // QQBot：语音用 mp3 直传；群文件仍用原始高音质文件
    if (adapter.kind === 'qqbot' && localPath) {
      try {
        vocalPath = await prepareQqbotRecordFile(localPath)
        if (vocalPath && vocalPath !== localPath) cleanupPaths.add(vocalPath)
      } catch {
        vocalPath = localPath
      }
    }
    let ok = false
    try {
      ok = await withRetry(() => sendVocal(e, vocalPath, play.url), {
        times: adapter.kind === 'qqbot' ? 3 : 1,
        retryIf: (_e, msg) => adapter.kind === 'qqbot' && QQ_RETRYABLE.test(msg),
        tag: 'QQBot 语音 ',
      })
    } catch (err) {
      logWarn(`语音最终失败: ${err.message}`)
    }
    if (!ok) {
      await sendVocal(e, play.url)
    }
  }

  if (cfg.uploadFile) {
    // 群：上传群文件；私聊：发好友文件 / segment.file
    // 展示名用规整后的 歌手-歌名.ext
    let up = false
    try {
      up = await withRetry(() => uploadGroupFile(e, localPath, displayName || undefined), {
        times: adapter.kind === 'qqbot' || adapter.kind === 'onebot' ? 3 : 1,
        baseMs: adapter.kind === 'onebot' ? 2500 : 1500,
        retryIf: (_e, msg) =>
          (adapter.kind === 'qqbot' && QQ_RETRYABLE.test(msg)) ||
          (adapter.kind === 'onebot' &&
            /210005|Highway|httpUpload|系统繁忙|timeout|ECONNRESET/i.test(msg)),
        tag: `${adapter.kind} 群文件 `,
      })
    } catch (err) {
      logWarn(`群文件最终失败: ${err.message}`)
    }
    if (!up && e.group_id) {
      await e.reply(
        `群文件上传失败（${adapter.name || adapter.kind}；大 FLAC 可能触发 Highway 限制）。语音已尝试发送，可稍后再试或改用较低音质`
      )
    }
  }

  const keep = Number(cfg.keepFileSec)
  const delay = Number.isFinite(keep) ? Math.max(0, keep) * 1000 : 60_000
  for (const p of cleanupPaths) {
    if (!p) continue
    if (delay === 0) {
      try {
        fs.unlinkSync(p)
      } catch {}
    } else {
      setTimeout(() => {
        try {
          fs.unlinkSync(p)
        } catch {}
      }, delay)
    }
  }

  return { ok: true, downloaded: true, path: localPath, size, adapter: adapter.kind }
}
