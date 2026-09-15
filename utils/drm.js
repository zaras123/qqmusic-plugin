/**
 * QQ 音乐加密文件解密（QMC2：.mflac / .mgg）
 *
 * 背景：VIP/受保护曲目服务端只给**加密文件**（明文文件名一律回「必须请求加密文件」），
 * 官方客户端拿到 purl + ekey 后本地解密再播放。API 侧已改成请求加密文件
 * （filename 用 F0M0…mflac / O4M0·O6M0·O8M0…mgg，且 songtype=1 才会下发 ekey），
 * 这里负责把下回来的文件解开。
 *
 * ⚠️ 这是**规避技术保护措施**，仅在账号本人自用场景下启用；解不开一律按失败回落，
 * 绝不把解不开的文件当音频发出去（见 decryptQmcBuffer 的魔数校验）。
 *
 * 算法来源：QMC2 公开实现（unlock-music / qmc-decoder 系）的描述——
 *  · key ≤ 300 字节：Map 密码，逐字节 XOR 打乱后的掩码
 *  · key >  300 字节：修改版 RC4（分段 + 丢弃），本文件暂未实现（先靠日志确认是否用得到）
 *  · ekey 为 base64；以 "QQMusic EncV2,Key:" 开头的是二级加密，需要 TC-TEA（暂未实现）
 */

/** 输出格式的魔数：用来验证解密是否真的成功（失败就是解错了） */
const MAGIC = {
  flac: [0x66, 0x4c, 0x61, 0x43], // "fLaC"
  ogg: [0x4f, 0x67, 0x67, 0x53], // "OggS"
  mp3: [0x49, 0x44, 0x33], // "ID3"（部分 mp3 是 0xFFFB 同步字，另判）
}

/** 由文件名后缀推断解密后的目标格式 */
export function targetFormatOf(filename = '') {
  const s = String(filename).toLowerCase()
  if (s.endsWith('.mflac') || s.endsWith('.flac')) return 'flac'
  if (s.endsWith('.mgg') || s.endsWith('.ogg')) return 'ogg'
  if (s.endsWith('.mp3') || s.endsWith('.mgg1') || s.endsWith('.mggl')) return 'mp3'
  return 'flac'
}

/**
 * 解析 ekey → 原始密钥字节
 * @returns {{ok:boolean, key?:Buffer, kind?:string, reason?:string}}
 */
export function parseEkey(ekeyRaw) {
  const s = String(ekeyRaw || '').replace(/\0+$/, '').trim()
  if (!s) return { ok: false, reason: 'ekey 为空' }
  let buf
  try {
    buf = Buffer.from(s, 'base64')
  } catch {
    return { ok: false, reason: 'ekey 不是合法 base64' }
  }
  if (!buf.length) return { ok: false, reason: 'ekey 解码为空' }
  // 二级加密的 ekey 需要 TC-TEA 两段解密（暂未实现）：明确报出来，别拿它当原始密钥用
  if (buf.slice(0, 18).toString('latin1').includes('QQMusic EncV2,Key:')) {
    return { ok: false, kind: 'encv2', reason: 'ekey 为 EncV2 二级加密，需要 TC-TEA（暂未实现）' }
  }
  if (buf.length < 8) return { ok: false, reason: `密钥过短（${buf.length} 字节）` }
  // API 下发的通常是原始密钥，直接使用
  return { ok: true, key: buf, kind: 'raw' }
}

/** 8 位左/右循环移位 */
function rotl8(v, s) {
  return ((v << s) | (v >>> (8 - s))) & 0xff
}
function rotr8(v, s) {
  return ((v >>> s) | (v << (8 - s))) & 0xff
}

/**
 * Map 密码的掩码字节（key ≤ 300 字节）
 * 文档写法与某 JS 移植写法在移位那一步不一致，两种都试（variant 0/1），
 * 由输出魔数判定哪个正确 —— 解错会立刻被魔数拦住，不会静默出错
 *
 * 索引：offset 超过 0x7FFF 先回绕；index = (offset² + 71214) % keyLen
 */
export function mapMask(key, offset, variant) {
  let off = offset
  if (off > 0x7fff) off %= 0x7fff
  const idx = (off * off + 71214) % key.length
  const v = key[idx]
  const shift = ((idx & 7) + 4) % 8
  if (shift === 0) return v
  if (variant === 0) return (rotl8(v, shift) | rotr8(v, shift)) & 0xff
  return ((v << shift) | (v >>> shift)) & 0xff
}

/** 用给定掩码函数就地解密一份缓冲 */
function xorDecrypt(buf, maskFn) {
  const out = Buffer.allocUnsafe(buf.length)
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ maskFn(i)
  return out
}

/** 校验解密结果是不是真音频（魔数） */
export function looksLikeAudio(buf, format) {
  if (!buf || buf.length < 12) return false
  const m = MAGIC[format]
  if (!m) return true // 未知格式不拦
  if (m.every((b, i) => buf[i] === b)) return true
  // flac/ogg 前面可能带 ID3 标签：跳过 ID3 头再判
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    const at = 10 + size
    return at + m.length <= buf.length && m.every((b, i) => buf[at + i] === b)
  }
  // mp3 常见同步字
  if (format === 'mp3') return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
  return false
}

/**
 * 解密整份加密音频
 * @param {Buffer} buf 下载下来的文件
 * @param {string} ekey API 下发的 ekey
 * @param {string} filename 文件名（用于推断目标格式）
 * @returns {{ok:boolean, data?:Buffer, format?:string, variant?:number, keyLen?:number, reason?:string}}
 */
export function decryptQmcBuffer(buf, ekey, filename = '') {
  const parsed = parseEkey(ekey)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const key = parsed.key
  const format = targetFormatOf(filename)
  if (key.length > 300) {
    // 走修改版 RC4 分支：实现复杂且未验证，先如实报出来（日志里能看出 key 长度）
    return {
      ok: false,
      keyLen: key.length,
      reason: `密钥 ${key.length} 字节 > 300，需 QMC2-RC4 分支（暂未实现）`,
    }
  }
  for (const variant of [0, 1]) {
    const out = xorDecrypt(buf, (i) => mapMask(key, i, variant))
    if (looksLikeAudio(out, format)) {
      return { ok: true, data: out, format, variant, keyLen: key.length }
    }
  }
  return { ok: false, keyLen: key.length, format, reason: '两种 Map 变体都解不出合法音频头' }
}
