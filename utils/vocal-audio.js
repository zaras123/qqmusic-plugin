/**
 * Validate decoded audio before handing it to an adapter.
 * Container duration alone is insufficient: truncated FLAC retains its original duration.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const processOptions = { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024 }

function positive(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function failure(message, cause) {
  const error = new Error('vocal: ' + message)
  error.code = cause?.code === 'ENOENT' ? 'VOCAL_TOOL_MISSING' : 'VOCAL_INVALID_AUDIO'
  return error
}

async function probeSeconds(file) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries',
      'stream=duration:format=duration', '-of', 'json', file,
    ], processOptions)
    const data = JSON.parse(stdout)
    const seconds = positive(data.streams?.[0]?.duration) || positive(data.format?.duration)
    if (!data.streams?.length || !seconds) throw new Error('音轨或时长无法识别')
    return seconds
  } catch (error) {
    if (error.code === 'ENOENT') throw failure('未找到 ffprobe，请安装完整 FFmpeg 后重试', error)
    throw failure('无法读取音频时长，请重新下载音源')
  }
}

function assertComplete(actual, expected) {
  if (!(actual > 0)) throw failure('未解码出有效音频')
  // MP3 padding / ordinary metadata rounding are allowed; missing song sections are not.
  if (expected > 0 && actual < expected - Math.max(2, expected * 0.05)) {
    throw failure('音频不完整：应约 ' + expected.toFixed(2) +
      ' 秒，实际仅 ' + actual.toFixed(2) + ' 秒，请重新下载音源')
  }
}

export async function validateAndPrepareVocal(filePath, {
  directExt, maxBytes, lowQuality = false, expectedSeconds = 0,
} = {}) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    throw failure('本地音频文件不存在')
  }
  const abs = path.resolve(filePath)
  const ext = path.extname(abs).slice(1).toLowerCase()
  const size = fs.statSync(abs).size
  // Native SILK is handled by the protocol library; FFmpeg cannot decode it.
  if (ext === 'silk' && directExt?.has(ext) && size > 0) {
    return { filePath: abs, converted: false, nativeSilk: true }
  }
  const sourceSeconds = await probeSeconds(abs)
  const expected = positive(expectedSeconds)
  const direct = !lowQuality && directExt?.has(ext) && size <= maxBytes
  // A unique target prevents stale/partial cache reuse and concurrent writes to one file.
  const out = direct ? '' : path.join(path.dirname(abs),
    path.basename(abs, path.extname(abs)) + '_' +
    (lowQuality ? 'vocal_low_' : 'vocal_') + randomUUID() + '.mp3')
  const bitrate = lowQuality ? '32k' : size > 16 * 1024 * 1024 ? '64k'
    : size > 8 * 1024 * 1024 ? '96k' : '128k'
  const args = [
    '-nostdin', '-hide_banner', '-v', 'error', '-xerror', '-y', '-i', abs,
    '-map', '0:a:0', '-vn', '-progress', 'pipe:1', '-nostats',
    ...(direct ? ['-f', 'null', '-'] : [
      '-acodec', 'libmp3lame', '-ar', lowQuality ? '16000' : '44100',
      '-ac', lowQuality ? '1' : '2', '-b:a', bitrate, out,
    ]),
  ]
  try {
    const { stdout } = await run('ffmpeg', args, processOptions)
    const times = [...String(stdout).matchAll(/^out_time_us=(\d+)$/gm)]
    const decodedSeconds = times.length ? Number(times.at(-1)[1]) / 1000000 : 0
    assertComplete(decodedSeconds, sourceSeconds)
    assertComplete(decodedSeconds, expected)
    const outputSeconds = direct ? decodedSeconds : await probeSeconds(out)
    assertComplete(outputSeconds, sourceSeconds)
    assertComplete(outputSeconds, expected)
    if (!direct && fs.statSync(out).size <= 256) throw failure('转码产物为空')
    return { filePath: out || abs, converted: !direct, sourceSeconds, outputSeconds, bitrate }
  } catch (error) {
    if (out) { try { fs.unlinkSync(out) } catch {} }
    if (String(error.code || '').startsWith('VOCAL_')) throw error
    if (error.code === 'ENOENT') throw failure('未找到 ffmpeg，请安装完整 FFmpeg 后重试', error)
    const detail = String(error.stderr || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')
    throw failure('音频解码/转码失败' + (detail ? '：' + detail : '，请重新下载音源'))
  }
}
