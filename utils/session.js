/**
 * 点歌会话（优先 Redis，回退内存）
 *
 * 两级存储，解决千人群里「谁后点歌谁顶掉别人的列表」的问题：
 *  - 群级  scope        ：群里最近一份列表，作为兜底（没自己点过歌的人也能 #听序号）
 *  - 用户级 scope+user  ：每人各自最近一份，读取时优先取自己的
 *
 * setSession 会自动按 session.user_id 同步写一份用户级，各调用方无需改动；
 * 读取统一走 pickSession(scope, userId, has)。
 */
const mem = new Map()
const TTL_DEFAULT = 600
let writes = 0

function key(scope) {
  return `qqmusic-plugin:song:${scope}`
}

function userKey(scope, userId) {
  return `qqmusic-plugin:song:${scope}:u${userId}`
}

/** 内存兜底也按 TTL 过期（原实现永不过期，千人群里会越堆越多） */
function sweep() {
  const now = Date.now()
  for (const [k, entry] of mem) {
    if (!entry?.expireAt || entry.expireAt <= now) mem.delete(k)
  }
}

function readMem(k) {
  const entry = mem.get(k)
  if (!entry) return null
  if (entry.expireAt && entry.expireAt <= Date.now()) {
    mem.delete(k)
    return null
  }
  return entry.data
}

async function readRedis(k) {
  const redis = global.redis
  if (!redis) return null
  try {
    const raw = await redis.get(k)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 读失败按没有处理 */
  }
  return null
}

export async function getSession(scope) {
  return (await readRedis(key(scope))) || readMem(key(scope))
}

/** 取某人自己的会话（千人群里各点各的歌，互不干扰） */
export async function getUserSession(scope, userId) {
  const uid = String(userId || '')
  if (!uid) return null
  return (await readRedis(userKey(scope, uid))) || readMem(userKey(scope, uid))
}

export async function setSession(scope, session, ttlSec = TTL_DEFAULT) {
  const data = {
    group_id: scope,
    updatedAt: Date.now(),
    ...session,
  }
  const expireAt = Date.now() + ttlSec * 1000
  mem.set(key(scope), { data, expireAt })
  const redis = global.redis
  if (redis) {
    try {
      await redis.set(key(scope), JSON.stringify(data), { EX: ttlSec })
    } catch {
      /* 写失败不影响内存兜底 */
    }
  }

  // 同一份按人再存一份：群级那份会被后来者顶掉，用户级这份不会
  const uid = String(session?.user_id || '')
  if (uid) {
    mem.set(userKey(scope, uid), { data, expireAt })
    if (redis) {
      try {
        await redis.set(userKey(scope, uid), JSON.stringify(data), { EX: ttlSec })
      } catch {
        /* ignore */
      }
    }
  }

  if (++writes % 64 === 0) sweep()
  return data
}

/**
 * 取「与我相关」的会话：自己的优先，自己没有才退回群里最近一份。
 * @param {*} scope  群号（私聊为 QQ 号）
 * @param {*} userId 发送者
 * @param {(s: object|null) => any} has 会话是否可用，如 s => s?.data?.length
 * @returns {Promise<{ session: object|null, fallback: boolean }>} fallback=用的是别人的列表
 */
export async function pickSession(scope, userId, has = (s) => s?.data?.length) {
  const uid = String(userId || '')
  const own = await getUserSession(scope, uid)
  if (own && has(own)) return { session: own, fallback: false }

  const group = await getSession(scope)
  if (group && has(group)) {
    return { session: group, fallback: String(group.user_id || '') !== uid }
  }
  return { session: null, fallback: false }
}
