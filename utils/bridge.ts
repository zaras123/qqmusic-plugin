/**
 * 主动发消息桥：定时点歌 / 订阅推送在没有原始消息事件时，按群号找 Karin
 * 的 bot + contact，并合成一个够下游链路使用的群事件。
 */

async function karinMod() {
  try {
    return await import('node-karin')
  } catch {
    return null
  }
}

function botIdOf(bot, fallback = '') {
  return String(bot?.selfId ?? bot?.uin ?? fallback ?? '').trim()
}

/** 列出当前在线的全部 bot：[selfId, bot]。 */
export async function botsListAsync() {
  const karin = await karinMod()
  if (!karin) return []

  const out = []
  const seen = new Set()
  const push = (bot, fallbackId = '') => {
    const id = botIdOf(bot, fallbackId)
    if (!id || seen.has(id) || !bot || typeof bot !== 'object') return
    seen.add(id)
    out.push([id, bot])
  }

  try {
    if (typeof karin.getAllBotList === 'function') {
      for (const item of karin.getAllBotList() || []) push(item?.bot, item?.index)
    } else if (typeof karin.getAllBot === 'function') {
      for (const bot of karin.getAllBot() || []) push(bot)
    }
  } catch {
    return []
  }
  return out
}

async function botOfUin(uin) {
  const id = String(uin || '').trim()
  if (!id) return null
  const karin = await karinMod()
  try {
    const bot = karin?.getBot?.(id)
    if (bot) return bot
  } catch {
    /* 继续按列表找 */
  }
  return (await botsListAsync()).find(([x]) => x === id)?.[1] || null
}

/**
 * 找群发送通道。
 * @returns {Promise<{bot:object, contact:object, selfId:string}|null>}
 */
export async function pickChannelForGroup(groupId, preferUin = '') {
  const gid = String(groupId || '').trim()
  if (!gid) return null

  const karin = await karinMod()
  if (!karin || typeof karin.contactGroup !== 'function') return null

  const candidates = []
  const preferred = await botOfUin(preferUin)
  if (preferred) candidates.push(preferred)
  for (const [, bot] of await botsListAsync()) candidates.push(bot)

  const seen = new Set()
  for (const bot of candidates) {
    const selfId = botIdOf(bot)
    if (!bot || seen.has(selfId) || typeof bot.sendMsg !== 'function') continue
    seen.add(selfId)
    try {
      const contact = karin.contactGroup(gid)
      if (contact) return { bot, contact, selfId }
    } catch {
      /* 换下一个 bot */
    }
  }
  return null
}

async function rawSendToGroup(groupId, msg, preferUin = '') {
  if (!msg) return false
  const ch = await pickChannelForGroup(groupId, preferUin)
  if (!ch) return false
  try {
    await ch.bot.sendMsg(ch.contact, msg)
    return true
  } catch {
    const karin = await karinMod()
    if (typeof karin?.sendMsg === 'function') {
      try {
        await karin.sendMsg(ch.selfId, ch.contact, msg)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

/**
 * 合成群事件：下游读 selfId / contact / bot / groupId / userId 与 reply。
 */
export async function groupEventOf({ groupId, preferUin = '', userId = '' } = {}) {
  const ch = await pickChannelForGroup(groupId, preferUin)
  if (!ch) return null
  const { bot, contact, selfId } = ch
  const uid = String(userId || selfId || preferUin || '')
  const gid = String(groupId)

  return {
    selfId,
    contact,
    bot,
    userId: uid,
    groupId: gid,
    isGroup: true,
    isPrivate: false,
    isMaster: false,
    // 合成事件没有 Karin 的原始 getter，补上业务链路内部仍在读的兼容字段
    self_id: selfId,
    user_id: uid,
    group_id: gid,
    reply: async (msg) => rawSendToGroup(groupId, msg, preferUin),
  }
}

/** 把任意消息（文本 / segment / 数组）发进群。 */
export async function sendToGroup(groupId, msg, preferUin = '') {
  return rawSendToGroup(groupId, msg, preferUin)
}
