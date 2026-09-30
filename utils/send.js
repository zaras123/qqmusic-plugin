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
import { QUALITY_LABEL } from './quality.js'
import { logInfo, logWarn } from './log.js'
import { getCfg } from './common.js'

const execFileAsync = promisify(execFile)

/** QQBot-Plugin makeRecord 直传白名单（见 forceSilk=false 时） */
const QQBOT_DIRECT_AUDIO_EXT = new Set(['silk', 'wav', 'mp3', 'flac'])

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
export async function botSendApi(e, action, params = {}) {
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

/**
 * 原生音乐卡「能力记忆」：
 * key = adapter.kind:adapter.id → { failCount }
 * 同一适配器连续失败达到阈值后，本会话内自动跳过原生卡，不再每次点歌都重试刷错。
 */
const NATIVE_CARD_MAX_FAIL = 3
const nativeCardState = new Map()

/** 判断失败是否为「协议端不支持该消息类型」类错误（本地即拦截，非网络/风控类） */
function isMusicCardUnsupported(err) {
  if (!err) return false
  const msg = String(err?.message || err?.data || err || '')
  return (
    err?.retcode === 1200 ||
    /sequence=0|不支持|不支持的|not\s*support|unsupported|message\s*type|消息类型/i.test(msg)
  )
}

/**
 * NTQQ 系协议端（NapCat / Lagrange / LLOneBot）普遍不支持 go-cq 风格的原生 music 卡，
 * 常以 retcode 1200 / sequence=0 直接拒绝。这里做「能力记忆 + 静默降级」：
 *  - 同一适配器累计失败 3 次后，本会话内自动跳过原生卡，避免每次点歌都刷错误日志
 *  - 首次失败打印完整原因，之后静默；交给调用方降级（自定义卡 / 语音 / 文件）
 * @param {boolean} [force] 忽略失败记忆强制尝试一次
 * @param {object} [cardData] 提供真实播放链后，NTQQ 系 OneBot 用 custom 卡渲染（type:qq 需协议端服务端拉歌单，普遍不支持）
 * @returns {Promise<{ok:boolean, reason?:'unsupported'|'disabled'|'failed', error?:Error}>}
 */
export async function sendNativeMusicCard(
  e,
  platformType,
  musicId,
  { force = false, url = '', audio = '', title = '', image = '', content = '', singer = '' } = {}
) {
  const adapter = detectAdapter(e)
  // 官方 QQBot 无 go-cq 风格 music 段
  if (adapter.kind === 'qqbot') {
    return { ok: false, reason: 'unsupported' }
  }

  // NTQQ 系 OneBot（LLOneBot / NapCat / Lagrange）不支持 `type:qq`（需服务端拉歌曲信息），
  // 调用方提供了真实播放链时改用 custom 卡——带直链才能渲染成 QQ 音乐卡片（与小飞插件一致）。
  if (adapter.kind === 'onebot' && (audio || url)) {
    const sent = await sendCustomMusicCard(e, {
      url: url || audio,
      audio: audio || url,
      title,
      image,
      content,
      singer,
      musicType: 'custom',
    })
    if (sent) {
      nativeCardState.delete(`${adapter.kind}:${adapter.id || adapter.name || 'unknown'}`)
    }
    return sent ? { ok: true } : { ok: false, reason: 'failed' }
  }

  const key = `${adapter.kind}:${adapter.id || adapter.name || 'unknown'}`
  const st = nativeCardState.get(key) || { failCount: 0 }

  // 已确认该适配器不支持：静默跳过，不再浪费一次请求
  if (!force && st.failCount >= NATIVE_CARD_MAX_FAIL) {
    return { ok: false, reason: 'disabled' }
  }

  const id = String(musicId)
  await ensureSegment()

  const markFail = (err) => {
    st.failCount += 1
    nativeCardState.set(key, st)
    const unsupported = isMusicCardUnsupported(err)
    // 首次失败打印完整原因；之后静默，避免点一首歌就刷一条红色堆栈
    if (st.failCount === 1) {
      logWarn(
        `原生音乐卡发送失败（${adapter.name || adapter.kind}）：${err?.message || err}` +
          (unsupported
            ? '，该协议端不支持原生音乐卡，已自动降级为自定义卡 / 语音 / 文件'
            : '')
      )
    }
    if (st.failCount === NATIVE_CARD_MAX_FAIL) {
      logWarn(
        `原生音乐卡连续失败 ${st.failCount} 次，本会话内自动跳过（${adapter.name || adapter.kind}）。` +
          '如需彻底关闭可在锅巴中关闭「发送原生 QQ 音乐卡」'
      )
    }
    return { ok: false, reason: unsupported ? 'unsupported' : 'failed', error: err }
  }

  // 1) OneBot API（sendApi 抛错则走兜底路径再补一次）
  if (adapter.kind === 'onebot' && e.bot?.sendApi) {
    try {
      const message = [{ type: 'music', data: { type: platformType, id } }]
      if (e.group_id) await botSendApi(e, 'send_group_msg', { group_id: e.group_id, message })
      else if (e.user_id) await botSendApi(e, 'send_private_msg', { user_id: e.user_id, message })
      else await botSendApi(e, 'send_msg', { group_id: e.group_id, user_id: e.user_id, message })
      nativeCardState.delete(key)
      return { ok: true }
    } catch (err) {
      if (await tryFallbackCard(e, platformType, id)) {
        nativeCardState.delete(key)
        return { ok: true }
      }
      return markFail(err)
    }
  }

  // 2) segment.music（ICQQ 若挂载了 oicq 扩展）
  if (global.segment?.music) {
    const ok = await tryFallbackCard(e, platformType, id)
    if (ok) { nativeCardState.delete(key); return { ok: true } }
    return markFail(new Error('segment.music 发送失败'))
  }

  // 3) 原始 music 对象
  const ok3 = await tryFallbackCard(e, platformType, id)
  if (ok3) { nativeCardState.delete(key); return { ok: true } }
  return markFail(new Error('原生音乐卡发送失败'))
}

/** 依次尝试 segment.music / 原始 music 对象两条兜底路径 */
async function tryFallbackCard(e, platformType, id) {
  if (global.segment?.music) {
    try {
      await e.reply(segment.music(platformType, id))
      return true
    } catch { /* 尝试下一条 */ }
  }
  try {
    await e.reply({ type: 'music', data: { type: platformType, id } })
    return true
  } catch { /* 都失败 */ }
  return false
}

export async function sendCustomMusicCard(
  e,
  { url, audio, title, image, content = '', singer = '', musicType = 'custom' }
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
  if (singer) data.singer = singer

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
 * 语音消息前置压缩：保证「发得出去」。
 * QQ 语音（record）对体积 / 格式敏感：FLAC 等高音质文件直接发，会被协议端以
 * 体积 / 格式限制拒绝（上传失败 / retcode 1200），导致高音质下语音「发不出来」。
 * 规则：
 *  - 扩展名在 directExt 白名单 且 体积 ≤ maxBytes → 直接用，避免无谓转码
 *  - 否则 ffmpeg 压成紧凑 mp3（码率按源体积分级），宁可牺牲语音画质也保证可发送
 * 群文件仍保留原始高音质文件，不受影响（见 deliverSong 的群文件降级逻辑）。
 * QQBot 的 makeRecord 仅对 silk/wav/mp3/flac 跳过转码，m4a 会触发重转码 → 统一先转 mp3。
 */
const VOCAL_MAX_BYTES = 5 * 1024 * 1024 // 5MB
/** OneBot / ICQQ 语音直传白名单（体积不大时直接发，避免无谓转码） */
const VOCAL_DIRECT_EXT = new Set(['mp3', 'silk', 'wav', 'amr', 'm4a', 'ogg', 'flac'])

export async function prepareVocalFile(
  filePath,
  { directExt = VOCAL_DIRECT_EXT, maxBytes = VOCAL_MAX_BYTES, lowQuality } = {}
) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return filePath
  }
  // 禁用高清语音（disableHighQualityVocal）：PC QQ 播放不了 44.1k 立体声语音，
  // 改编码成 mono 16k 低码率（PC 可正常播放）。未显式传参时读配置。
  const isLow = lowQuality ?? (getCfg().disableHighQualityVocal === true)
  const abs = path.resolve(filePath)
  const size = fs.statSync(abs).size
  const ext = path.extname(abs).slice(1).toLowerCase()
  // 低音质模式强制重编码（即使源是小 mp3，也要转成 PC 兼容格式）
  if (!isLow && directExt.has(ext) && size <= maxBytes) return abs

  const out = path.join(
    path.dirname(abs),
    `${path.basename(abs, path.extname(abs))}_${isLow ? 'vocal_low' : 'vocal'}.mp3`
  )
  if (fs.existsSync(out) && fs.statSync(out).size > 256) return out

  const bitrate = size > 16 * 1024 * 1024 ? '64k' : size > 8 * 1024 * 1024 ? '96k' : '128k'
  const args = isLow
    ? ['-y', '-i', abs, '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '32k', out]
    : ['-y', '-i', abs, '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', bitrate, out]
  try {
    await execFileAsync('ffmpeg', args, {
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    })
    if (fs.existsSync(out) && fs.statSync(out).size > 256) {
      logInfo(`语音压缩: ${path.basename(abs)} → ${path.basename(out)} (${isLow ? 'mono16k低音质' : bitrate})`)
      return out
    }
  } catch (err) {
    if (/ENOENT|not found|spawn\s+\S+\s+ENOENT/i.test(err?.message || '')) {
      logWarn(`未检测到 ffmpeg，无法压缩语音。高音质（FLAC 等）文件可能无法作为语音发送，请安装 ffmpeg 或调低音质`)
    } else {
      /**
       * 把 ffmpeg **自己说的话**带出来。
       *
       * 以前只打 `err.message`，而 execFile 的 message 永远是
       * `Command failed: ffmpeg -y -i …` —— 真正的成因（识别不了格式 / 缺编码器 /
       * 超时被杀）全在 `err.stderr` 里。于是每次都得靠猜：
       * 2026-09-30 用户反馈"ffmpeg 识别不了母带格式"就是这么推出来的
       * （推对了，但本可以一眼看到）。stderr 只留最后两行，避免刷屏。
       */
      const detail = String(err?.stderr || '')
        .trim()
        .split('\n')
        .filter((l) => l.trim())
        .slice(-2)
        .join(' | ')
      logWarn(`语音压缩失败，回退原文件: ${err.message}${detail ? `（ffmpeg: ${detail}）` : ''}`)
    }
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
        file = await prepareVocalFile(file, { directExt: QQBOT_DIRECT_AUDIO_EXT })
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

/**
 * 音频容器魔数嗅探（纯函数，导出给单测）
 *
 * **下载成功 ≠ 拿到的是音频** —— 这是 2026-09-30「ffmpeg 识别不了母带格式 → 发不出语音」
 * 那条反馈的根：
 *   · 高规格档（母带 / 全景声 / Hi-Res）上游常**只给加密文件**（`.mflac` / `.mgg`，QMC2）。
 *     正常链路是 API 的 `/song/file` 下载并**解密**后回明文；但只要有一次走岔
 *     （重试链直接推上游 purl、API 没解开仍回 200、CDN 给了 404 错误体……），
 *     密文就会以 HTTP 200 原样落盘成一个 `.flac`。
 *   · 之后没有任何一步会怀疑它：ffmpeg 拿到密文只会说
 *     `Invalid data found when processing input`，而日志里只有一句 `Command failed: ffmpeg …`
 *     —— 看不出"这份文件根本不该能用"。
 * 这里按魔数认容器：**认不出 = 这份不可用**（当下载失败处理，交给上层刷新播放链 / 换档位）。
 *
 * ⚠️ 认得宽一点没关系（多认一种就少一次误杀），但**绝不能认不出还放行** ——
 * 放行等于让密文一路走到 ffmpeg 和协议端。已知会经过这条路的音频：
 * QQ 的 mp3 / m4a / flac / ape、API 解密出来的 flac / ogg、各外源（含 YouTube 的 webm/opus）。
 *
 * @returns {'flac'|'ogg'|'mp3'|'mp4'|'wav'|'ape'|'webm'|''} 空串 = 认不出
 */
export function sniffAudioContainer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return ''
  const at = (s, off = 0) => {
    for (let i = 0; i < s.length; i++) if (buf[off + i] !== s.charCodeAt(i)) return false
    return true
  }
  if (at('fLaC')) return 'flac'
  if (at('OggS')) return 'ogg'
  if (at('RIFF') && at('WAVE', 8)) return 'wav'
  if (at('MAC ')) return 'ape' // Monkey's Audio
  // EBML：webm / mkv（YouTube 的 opus 音轨走这里）
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'
  // MP4 / M4A：`ftyp` 在偏移 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4'
  // ID3v2 头：跳过头里声明的长度再看里面是什么（带 ID3 的 flac / mp3 都很常见）
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    const off = 10 + size
    if (off + 12 <= buf.length) return sniffAudioContainer(buf.subarray(off)) || 'mp3'
    return 'mp3'
  }
  // MPEG 帧同步（0xFFEx/0xFFFx）—— ADTS AAC 也长这样，归到 mp3 这档（只用来定扩展名）
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'
  return ''
}

/** 容器 → 磁盘扩展名。按**真实容器**定名（解密出来的全景声其实是 ogg、m4a 其实是 mp4） */
const CONTAINER_EXT = {
  flac: '.flac',
  ogg: '.ogg',
  mp3: '.mp3',
  mp4: '.m4a',
  wav: '.wav',
  ape: '.ape',
  webm: '.webm',
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
  if (q === 'video') ext = '.mp4'
  else if (['flac', 'hires', 'master', 'atmos', 'atmos_master'].includes(q)) ext = '.flac'
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

  // ⚠️ 落盘路径挪到循环里算：扩展名要等**看过字节**之后才定得下来（见下面的魔数体检）
  const savePathOf = (e) => path.join(saveDir, `${safe}_${Date.now()}${e}`)

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
      let realExt = ext
      // 魔数体检（只对音频做：MV 走的是 mp4/fmp4，别拿音频白名单去卡它）
      if (q !== 'video') {
        const container = sniffAudioContainer(buf)
        if (!container) {
          lastErr = new Error('拿到的不是可解码的音频（可能仍是加密文件或假档链接）')
          logWarn(
            `下载到的字节不像音频（首 4 字节 ${buf.subarray(0, 4).toString('hex')}，共 ${buf.length}B）——` +
              `多半是没解开的 .mflac/.mgg，换下一个候选: ${tryUrl.slice(0, 80)}…`
          )
          continue
        }
        // 扩展名按**真实容器**定：解密出来的全景声是 ogg、m4a 其实住在 mp4 里。
        // 名字说谎会一路骗到"群文件展示名 / 语音白名单"（下面那段按 .mgg 改名的补丁
        // 就是为这个写的，现在已经没必要了 —— 这里一次说准）
        realExt = CONTAINER_EXT[container] || ext
      }
      const filePath = savePathOf(realExt)
      fs.writeFileSync(filePath, buf)
      return { filePath, size: buf.length, ext: realExt, url: tryUrl }
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
  // 路径字符换成下划线（这里的结果只用于拼文件名），控制字符换空格
  t = t.replace(/[\\/:*?"<>|]/g, '_')
  t = t.replace(/[\r\n\t]/g, ' ')
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
  // 非法路径字符已在 cleanTrackText 里换成下划线，这里只做空白与下划线规整
  stem = stem
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

  // —— OneBot：优先用适配器原生 sendFile（TRSS 适配器内部处理正确协议，参考 rconsole-plugin）——
  if (adapter.kind === 'onebot' && e.group?.sendFile) {
    for (const name of namesToTry) {
      // 兼容 (path, name) 与 (path) 两种签名（rconsole 用单参）
      for (const [fp, fn] of [[abs, name], [abs, undefined]]) {
        try {
          await e.group.sendFile(fp, fn)
          logInfo(`群文件 group.sendFile 成功: ${fn || path.basename(fp)}`)
          return true
        } catch (err) {
          errors.push(`group.sendFile(${fn || path.basename(fp)}): ${err.message}`)
        }
      }
    }
  }

  // —— OneBot：再试 upload_group_file（大文件专用），失败走 send_group_msg 文件段 ——
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
        logWarn(`upload_group_file 失败(${name}): ${err.message}`)
      }
    }
    // LLOneBot / NapCat 等：upload_group_file 偶发失败（Highway/风控/超时），改走 send_group_msg 文件段通常可成功
    for (const name of namesToTry) {
      try {
        await botSendApi(e, 'send_group_msg', {
          group_id: e.group_id,
          message: [{ type: 'file', data: { file: abs, name } }],
        })
        logInfo(`群文件 send_group_msg 文件段成功: ${name}`)
        return true
      } catch (err) {
        errors.push(`send_msg file(${name}): ${err.message}`)
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

  // —— 通用 sendFile（ICQQ/其它适配器；OneBot 已在上面早试过）——
  if (e.group?.sendFile && adapter.kind !== 'icqq' && adapter.kind !== 'onebot') {
    for (const name of namesToTry) {
      try {
        await e.group.sendFile(abs, name)
        return true
      } catch (err) {
        errors.push(`group.sendFile(${name}): ${err.message}`)
      }
    }
  }

  // —— 最后兜底 segment.file（sendApi 路径全失败后；OneBot 大文件走 send_msg 易 Highway 炸，但小文件通常没问题）——
  if (global.segment?.file) {
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
 * 一起听同步（deliverSong 收尾调用）
 * 放在「只发卡」与「完整发送」两个收尾点，但**不放** no_url 早退分支 ——
 * 点歌失败时不该顺带把一起听房间也开出来。
 * 失败只回一句短提示，绝不改 deliverSong 的返回值（chart/resolve 也在调它）。
 */
async function syncTogetherAfterSend(e, song, cfg) {
  try {
    const { autoSyncTogether } = await import('./together.js')
    const sync = await autoSyncTogether(e, song, cfg)
    if (sync && !sync.ok && !sync.silent) await e.reply(`（${sync.message}）`)
  } catch (err) {
    logWarn(`一起听自动同步异常: ${err.message}`)
  }
}

/**
 * 把一条播放链换算成"插件**真正该去下载**的地址"
 *
 * ⚠️ 高规格档（母带 / 全景声 / Hi-Res）**必须**过这里 —— 这是 2026-09-30
 * 「ffmpeg 识别不了母带格式 → 语音发不出去」那条反馈的来路：
 *
 *   加密件（.mflac/.mgg）**不能**直接下。QQ 给的就是密文，得让 API 的 `/song/file`
 *   下载并用 ekey/vkey 解密后回明文（解密算法在 API 侧 util/drm.js）。插件直接把上游
 *   purl 拿去下载的话，落盘的是一个 HTTP 200 的**密文**，扩展名还是 `.flac` ——
 *   于是 ffmpeg 只会回一句 `Invalid data found when processing input`，语音怎么都发不出去。
 *
 * 原来的代码只在**首次**下载时做了这层换算；下面「刷新播放链」那条重试路是把上游 purl
 * 直接 push 进 tryUrls 的 —— 高规格档第一次取流失败（CDN 404 / 解密失败 / 超时）后
 * 走到重试，就正好踩在上面的坑里，而且日志上完全看不出来。
 *
 * 判据不只信 `encrypted` 标记，也看**文件名后缀**：上游有时只给一条
 * `AIM0<media_mid>.mflac` 却没把标记带回来，而名字本身就是证据。
 */
async function downloadUrlFor(play, userKey = '') {
  const url = play?.url
  if (!url) return ''
  const looksEncrypted =
    play.encrypted === true || /\.(mflac|mgg)(\?|$)/i.test(String(play.file || url))
  if (!looksEncrypted) return url
  try {
    const { buildSongFileUrl } = await import('./api.js')
    return (
      buildSongFileUrl({
        url,
        filename: play.file,
        ekey: play.ekey,
        vkey: play.vkey,
        userKey,
      }) || url
    )
  } catch {
    return url // 构造失败就用原地址（沿用老行为）
  }
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

  // 原生音乐卡。NTQQ 系 OneBot 用 custom 卡（带直链才能渲染成 QQ 音乐卡片）；ICQQ 走原生 type:qq。
  // 失败时若开启了自定义卡且有直链则再降级一次，否则交由下方语音 / 群文件兜底。
  if (allowNative && song.songid) {
    const nativeRes = await sendNativeMusicCard(e, 'qq', song.songid, {
      url: pageUrl,
      audio: play?.url,
      title,
      image: cover,
      content: singer,
      singer,
    })
    if (!nativeRes.ok && allowCustom && play?.url) {
      await sendCustomMusicCard(e, {
        url: pageUrl,
        audio: play.url,
        title,
        image: cover,
        content: singer,
        singer,
        musicType: 'custom',
      })
    }
  } else if (allowCustom && play?.url) {
    await sendCustomMusicCard(e, {
      url: pageUrl,
      audio: play.url,
      title,
      image: cover,
      content: singer,
      singer,
      musicType: 'custom',
    })
  }

  if (!play?.url) return { ok: false, reason: 'no_url', adapter: adapter.kind }

  const needDownload = cfg.sendVocal || cfg.uploadFile
  if (!needDownload) {
    // 只发文案/音乐卡也属于「发出去了」，同样同步一起听
    await syncTogetherAfterSend(e, song, cfg)
    return { ok: true, downloaded: false, adapter: adapter.kind }
  }

  let localPath = ''
  let size = 0
  /** 群文件/好友文件展示名（规整后的 歌手-歌名.ext） */
  let displayName = ''
  try {
    const dir = getTempDir()
    const timeout = Number(cfg.downloadTimeout) || 120000
    // 下载走哪个账号槽：与取播放链同一套规则（普通曲 = 主人账号（开了「一律走主人账号」时）；
    // Apple 曲 = 请求者自己那份）。取播放链与下载用**同一个槽**，否则会"取得到、下不到"。
    let playUserKey = ''
    try {
      const { pickPlayUserKey } = await import('./api.js')
      playUserKey = pickPlayUserKey(String(e.user_id || ''), { mediaId: play.mediaId })
    } catch {
      /* 拿不到就当公共账号 */
    }
    const tryUrls = [await downloadUrlFor(play, playUserKey)]
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
              play = { ...play, ...fresh }
              // ⚠️ 刷新回来的链**也要过 downloadUrlFor**。高规格档刷新回来多半还是一条
              //    加密链（.mflac/.mgg）—— 直接 push 上游 purl 就是把密文当音频下载下来，
              //    交给 ffmpeg 时只会说"识别不了"（2026-09-30 那条语音反馈的来路）。
              const next = await downloadUrlFor(play, playUserKey)
              if (next && next !== tryUrls[0]) tryUrls.push(next)
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
    // 加密文件（.mflac/.mgg）走的是 API 的 /song/file（下载 + 解密后回明文，见 downloadUrlFor）；
    // 解不开时那边直接回 4xx/502，这里当下载失败回落。
    // ⚠️ 原先这里还有一段"按 play.file 后缀把 .flac 改成 .ogg"的补丁 —— 已删：
    //    它的条件（`!play.encrypted || !/\.(flac|ogg|…)$/`）从来没成立过，是死代码；
    //    而**真的**搞错扩展名的那种情况（全景声解出来是 ogg、m4a 住在 mp4 里）现在由
    //    downloadAudio 按**真实容器魔数**定名，一次说准，不再靠事后改名。
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
    /**
     * 拿原链兜底当语音：**只对明文链有意义**。
     *
     * 加密曲目（母带/全景声那类）的 `play.url` 就是那份 DRM 文件本身，协议端拉下来
     * 仍是一坨密文 —— 发出去只会是一条**播不响的语音**（还会让人以为"发了但没声"）。
     * 宁可什么都不发：上面那句回复已经说清失败原因了。
     */
    if (cfg.sendVocal && !play.encrypted) {
      await sendVocal(e, play.url)
    }
    return { ok: false, reason: 'download_fail', error: err.message, adapter: adapter.kind }
  }

  const cleanupPaths = new Set()
  if (localPath) cleanupPaths.add(localPath)

  // 语音 / OneBot 群文件都需要「紧凑 mp3」：FLAC 直接发语音会被协议端拒；OneBot 群文件也不接受 .flac。
  // ICQQ 群文件保留原始高音质文件（走 fs.upload / sendFile），无需压缩。
  let vocalPath = ''
  const needCompress =
    localPath && (cfg.sendVocal || (cfg.uploadFile && adapter.kind === 'onebot'))
  if (needCompress) {
    try {
      vocalPath = await prepareVocalFile(localPath, {
        directExt: adapter.kind === 'qqbot' ? QQBOT_DIRECT_AUDIO_EXT : VOCAL_DIRECT_EXT,
        // 低音质只用于语音（禁用高清语音时 PC 可播）；仅作 OneBot 群文件兜底时仍保高音质
        lowQuality: cfg.sendVocal && cfg.disableHighQualityVocal === true,
      })
    } catch {
      vocalPath = localPath
    }
    if (vocalPath && vocalPath !== localPath) cleanupPaths.add(vocalPath)
  }

  if (cfg.sendVocal && localPath) {
    const vocalSend = vocalPath || localPath
    let ok = false
    try {
      // httpFallback 传明文链：加密曲目的 url 是 DRM 文件，回退发它只会是条播不响的语音
      ok = await withRetry(() => sendVocal(e, vocalSend, play.encrypted ? '' : play.url), {
        times: adapter.kind === 'qqbot' ? 3 : 1,
        retryIf: (_e, msg) => adapter.kind === 'qqbot' && QQ_RETRYABLE.test(msg),
        tag: '语音 ',
      })
    } catch (err) {
      logWarn(`语音最终失败: ${err.message}`)
    }
    if (!ok && !play.encrypted) {
      await sendVocal(e, play.url)
    }
  }

  if (cfg.uploadFile) {
    // 群：上传群文件；私聊：发好友文件 / segment.file
    const hasCompressed = Boolean(vocalPath && vocalPath !== localPath && fs.existsSync(vocalPath))
    const compressedName = displayName
      ? displayName.replace(/\.[^.]+$/, '_压缩版.mp3')
      : 'QQ音乐_压缩版.mp3'
    const retryOpts = (tag) => ({
      times: adapter.kind === 'qqbot' || adapter.kind === 'onebot' ? 3 : 1,
      baseMs: adapter.kind === 'onebot' ? 2500 : 1500,
      retryIf: (_e, msg) =>
        (adapter.kind === 'qqbot' && QQ_RETRYABLE.test(msg)) ||
        (adapter.kind === 'onebot' &&
          /210005|Highway|httpUpload|系统繁忙|timeout|ECONNRESET/i.test(msg)),
      tag,
    })

    let up = false

    // 先传原始文件。uploadGroupFile 内 OneBot 已优先用适配器原生 e.group.sendFile
    // （参考 rconsole-plugin，能正常传 flac），失败才落到 upload_group_file 等动作。
    try {
      up = await withRetry(
        () => uploadGroupFile(e, localPath, displayName || undefined),
        retryOpts(`${adapter.kind} 群文件 `)
      )
    } catch (err) {
      logWarn(`群文件最终失败: ${err.message}`)
    }

    // 原始上传失败（如 OneBot 的 upload_group_file 拒 flac）→ 改传压缩语音版，保证能拿到文件
    if (!up && hasCompressed) {
      try {
        up = await withRetry(
          () => uploadGroupFile(e, vocalPath, compressedName),
          retryOpts('群文件(压缩版) ')
        )
        if (up) {
          await e.reply(
            `原始高音质文件上传失败，已改传压缩版（${formatSize(fs.statSync(vocalPath).size)}）。需要无损文件请在 QQ 音乐客户端获取`
          )
        }
      } catch (err) {
        logWarn(`压缩版群文件失败: ${err.message}`)
      }
    }

    if (!up && e.group_id) {
      await e.reply(
        `群文件上传失败（${adapter.name || adapter.kind}；大文件可能触发 Highway 限制）。语音已尝试发送，可稍后再试或改用较低音质`
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

  // 一起听：歌已经发出去了，再同步进群里的一起听（细节见 syncTogetherAfterSend）
  await syncTogetherAfterSend(e, song, cfg)

  return { ok: true, downloaded: true, path: localPath, size, adapter: adapter.kind }
}
