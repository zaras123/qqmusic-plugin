/**
 * 「本群/本人」的轻量偏好（优先 Redis，回退内存）
 *
 * 为什么单开一份存储：点歌列表在 `utils/session.js` 的**同一个键**上（10 分钟过期、
 * 会被后来者顶掉）。如果把"当前音源"也写进那条会话，用户设完音源再点一次歌，
 * 音源设置就被列表覆盖了 —— 两种数据生命周期完全不同，必须分开。
 *
 * 键空间：`qqmusic-plugin:pref:<scope>`，其中 scope 由调用方决定：
 *   · 主人设的默认音源 → 群号（对全群生效）
 *   · 普通成员设的     → `群号:u<QQ号>`（只对他自己生效，不动别人）
 *   私聊里一律按人存。
 * 过期：30 天（音源是"设一次管很久"的偏好，不是会话）
 */
const PREFIX = 'qqmusic-plugin:pref:'
const TTL_SEC = 30 * 24 * 3600
const mem = new Map()
let writes = 0

function keyOf(scope) {
  return `${PREFIX}${scope}`
}

function readMem(scope) {
  const entry = mem.get(keyOf(scope))
  if (!entry) return null
  if (entry.expireAt && entry.expireAt <= Date.now()) {
    mem.delete(keyOf(scope))
    return null
  }
  return entry.data
}

/**
 * 内存兜底也要回收
 *
 * 只靠"读的时候判过期"是不够的：没人再读的那个群，它的键会永远躺在 Map 里
 * （`#qqm源` 每条很小，但群多的机器人会只增不减）。session.js 早就有这个 sweep，
 * 这里照抄一份，每 64 次写清一次。
 */
function sweep() {
  const now = Date.now()
  for (const [k, entry] of mem) {
    if (!entry?.expireAt || entry.expireAt <= now) mem.delete(k)
  }
}

/** 读偏好（认不出就是 {}，调用方用默认值兜） */
export async function getPref(scope) {
  const k = keyOf(scope)
  const redis = global.redis
  if (redis) {
    try {
      const raw = await redis.get(k)
      if (raw) return JSON.parse(raw)
    } catch {
      /* 读失败按没有处理，回落内存 */
    }
  }
  return readMem(scope) || {}
}

/** 合并写偏好 */
export async function setPref(scope, patch = {}) {
  const next = { ...(await getPref(scope)), ...patch, updatedAt: Date.now() }
  const k = keyOf(scope)
  mem.set(k, { data: next, expireAt: Date.now() + TTL_SEC * 1000 })
  const redis = global.redis
  if (redis) {
    try {
      await redis.set(k, JSON.stringify(next), { EX: TTL_SEC })
    } catch {
      /* 内存兜底 */
    }
  }
  if (++writes % 64 === 0) sweep()
  return next
}

/** 显式清一个键（`#qqm源 默认` 用；不写空对象，免得留个空壳进 Redis） */
export async function clearPref(scope, name) {
  const cur = await getPref(scope)
  delete cur[name]
  return await setPref(scope, cur)
}
