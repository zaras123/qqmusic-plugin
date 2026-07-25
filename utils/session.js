/**
 * 点歌会话（优先 Redis，回退内存）
 */
const mem = new Map()

function key(groupId) {
  return `qqmusic-plugin:song:${groupId}`
}

export async function getSession(groupId) {
  const k = key(groupId)
  const redis = global.redis
  if (redis) {
    try {
      const raw = await redis.get(k)
      if (raw) return JSON.parse(raw)
    } catch {}
  }
  return mem.get(String(groupId)) || null
}

export async function setSession(groupId, session, ttlSec = 600) {
  const k = key(groupId)
  const redis = global.redis
  const data = {
    group_id: groupId,
    updatedAt: Date.now(),
    ...session,
  }
  mem.set(String(groupId), data)
  if (redis) {
    try {
      await redis.set(k, JSON.stringify(data), { EX: ttlSec })
    } catch {}
  }
  return data
}

export async function clearSession(groupId) {
  const redis = global.redis
  mem.delete(String(groupId))
  if (redis) {
    try {
      await redis.del(key(groupId))
    } catch {}
  }
}
