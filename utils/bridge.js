/**
 * 主动发消息的桥（定时点歌 / 订阅推送 / 锅巴控制台用）。
 *
 * 不再假设只有 ICQQ：ICQQ / OneBotv11 / QQBot / Milky / Satori 等适配器
 * 只要暴露 `gl`、`getGroupList()` 或 `sendApi('send_group_msg')`，就会被
 * 枚举成「适配器 · 账号」下的一组群；发消息时优先按账号定位，定位不到
 * 再退回全局匹配。
 */

function botIdOf(bot, fallback = '') {
  return String(bot?.uin ?? bot?.self_id ?? bot?.selfId ?? fallback ?? '').trim()
}

/** 识别适配器类型与显示名。 */
export function adapterOf(bot) {
  const adapter = bot?.adapter || {}
  const rawId = String(adapter.id || '').trim()
  const rawName = String(adapter.name || adapter.id || bot?.adapterName || '').trim()
  const lower = `${rawId} ${rawName}`.toLowerCase()
  let kind = ''

  if (bot?.adapter?.path === 'data/QQBot/' || bot?.sdk?.sessionManager || lower.includes('qqbot')) {
    kind = 'qqbot'
  } else if (bot?.icqq || lower.includes('icqq')) {
    kind = 'icqq'
  } else if (
    lower.includes('onebot') ||
    lower.includes('napcat') ||
    lower.includes('llonebot') ||
    lower.includes('lagrange') ||
    typeof bot?.sendApi === 'function'
  ) {
    kind = 'onebot'
  } else if (lower.includes('milky')) {
    kind = 'milky'
  } else if (lower.includes('satori')) {
    kind = 'satori'
  } else if (lower.includes('comwechat')) {
    kind = 'comwechat'
  } else if (lower.includes('opq')) {
    kind = 'opqbot'
  } else if (bot?.gl) {
    kind = 'qq'
  } else {
    kind = rawId.toLowerCase() || 'unknown'
  }

  const name = rawName || kind
  return { kind, name, id: rawId }
}

function platformKey(bot, id = '') {
  const adapter = adapterOf(bot)
  const uin = botIdOf(bot, id)
  return `${adapter.kind}:${uin}`
}

/** 列出当前在线的全部 bot：[uin, bot]。 */
export function botsList() {
  const B = global.Bot
  if (!B) return []
  const out = []
  const seen = new Set()
  const push = (uin, bot) => {
    const id = botIdOf(bot, uin)
    if (!id || id === 'stdin' || !bot || typeof bot !== 'object') return
    if (
      typeof bot.pickGroup !== 'function' &&
      typeof bot.sendApi !== 'function' &&
      typeof bot.sendGroupMsg !== 'function' &&
      !bot.gl &&
      typeof bot.getGroupList !== 'function'
    ) {
      return
    }
    const key = platformKey(bot, id)
    if (seen.has(key)) return
    seen.add(key)
    out.push([id, bot])
  }
  if (typeof B.entries === 'function') {
    try {
      for (const [uin, bot] of B.entries()) push(uin, bot?.bot || bot)
    } catch {
      /* Map 语义不完整就跳过 */
    }
  }
  for (const [uin, bot] of Object.entries(B)) {
    if (typeof B.entries === 'function' && typeof B.get === 'function') {
      try {
        if (B.get(uin) === bot) continue
      } catch {
        /* fallthrough */
      }
    }
    push(uin, bot?.bot || bot)
  }
  return out
}

function botOfUin(uin) {
  const id = String(uin || '')
  if (!id) return null
  return botsList().find(([x]) => x === id)?.[1] || null
}

function hasGroupInList(gl, gid) {
  if (!gl || typeof gl.get !== 'function') return true
  if (gl.get(gid)) return true
  const n = Number(gid)
  if (Number.isFinite(n) && gl.get(n)) return true
  return gl.size === 0
}

function groupNameOf(group, gid) {
  return String(
    group?.group_name ||
      group?.groupName ||
      group?.name ||
      group?.remark ||
      gid
  )
}

async function groupsOfBot(bot, id) {
  const rows = []
  const seen = new Set()
  const push = (gid, group = {}) => {
    const groupId = String(gid ?? group?.group_id ?? group?.groupId ?? group?.id ?? '').trim()
    if (!/^\d{5,20}$/.test(groupId) || seen.has(groupId)) return
    seen.add(groupId)
    rows.push({
      group_id: groupId,
      name: groupNameOf(group, groupId),
      platform: platformKey(bot, id),
      adapter: adapterOf(bot).name,
      uin: botIdOf(bot, id),
    })
  }

  const gl = bot?.gl
  if (gl && typeof gl.entries === 'function') {
    for (const [gid, group] of gl.entries()) push(gid, group)
  }
  if (!rows.length && typeof bot?.getGroupList === 'function') {
    try {
      const data = await bot.getGroupList()
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      for (const group of list) push(group?.group_id ?? group?.groupId ?? group?.id, group)
    } catch {
      /* 适配器没实现或尚未连上 */
    }
  }
  return rows
}

/** 全部适配器 × 账号的群列表（平铺）。 */
export async function listGroupRows() {
  const rows = []
  for (const [id, bot] of botsList()) {
    rows.push(...(await groupsOfBot(bot, id)))
  }
  return rows.sort((a, b) =>
    a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name, 'zh-CN')
  )
}

/** 按「适配器 · 账号」分组，供 WebUI 直接渲染。 */
export async function groupPlatforms() {
  const map = new Map()
  for (const row of await listGroupRows()) {
    let platform = map.get(row.platform)
    if (!platform) {
      platform = {
        platform: row.platform,
        name: `${row.adapter} · ${row.uin}`,
        groups: [],
      }
      map.set(row.platform, platform)
    }
    platform.groups.push({
      group_id: row.group_id,
      name: row.name,
      bot: row.uin,
      platform: row.platform,
    })
  }
  return [...map.values()]
}

function makeGroup(bot, gid) {
  if (typeof bot?.pickGroup === 'function') {
    try {
      const group = bot.pickGroup(gid)
      if (group) return group
    } catch {
      /* fallthrough */
    }
  }
  if (typeof bot?.sendGroupMsg === 'function') {
    return {
      group_id: String(gid),
      sendMsg: (msg) => bot.sendGroupMsg(gid, msg),
    }
  }
  if (typeof bot?.sendApi === 'function') {
    return {
      group_id: String(gid),
      sendMsg: (msg) => bot.sendApi('send_group_msg', { group_id: gid, message: msg }),
      sendFile: (file, name) =>
        bot.sendApi('upload_group_file', { group_id: gid, file, name }),
    }
  }
  return null
}

/**
 * 找一个「真的在这个群里」的 bot。
 * @param {string|number} groupId
 * @param {string|number} [preferUin] 指定账号
 * @param {string} [platform] 指定适配器平台（`onebot:10001` 或 `onebot`）
 */
export function pickBotForGroup(groupId, preferUin = '', platform = '') {
  const gid = String(groupId)
  if (!gid) return null
  const want = String(platform || '').trim()
  const candidates = []
  const pref = botOfUin(preferUin)
  if (pref && (!want || platformKey(pref, preferUin) === want || want === adapterOf(pref).kind)) {
    candidates.push(pref)
  }
  for (const [, bot] of botsList()) {
    if (want) {
      const key = platformKey(bot)
      if (key !== want && adapterOf(bot).kind !== want) continue
    }
    candidates.push(bot)
  }

  const seen = new Set()
  for (const bot of candidates) {
    const key = platformKey(bot)
    if (seen.has(key)) continue
    seen.add(key)
    if (!hasGroupInList(bot.gl, gid)) continue
    const group = makeGroup(bot, gid)
    if (group) return { bot, group, platform: key }
  }
  return null
}

/**
 * 合成一个够下游链路使用的群事件。
 * 兼容 ICQQ / OneBot / QQBot / Milky / Satori 的群发送通道。
 */
export function groupEventOf({ groupId, preferUin = '', platform = '', userId = '' } = {}) {
  const hit = pickBotForGroup(groupId, preferUin, platform)
  if (!hit) return null
  const { bot, group } = hit
  const uid = String(userId || bot.uin || preferUin || '')
  return {
    self_id: bot.uin ?? bot.self_id,
    user_id: uid,
    group_id: String(groupId),
    bot,
    group,
    isGroup: true,
    isMaster: false,
    reply: async (msg) => {
      await group.sendMsg(msg)
      return true
    },
  }
}

/** 把任意消息发进群。 */
export async function sendToGroup(groupId, msg, preferUin = '', platform = '') {
  if (!msg) return false
  const hit = pickBotForGroup(groupId, preferUin, platform)
  if (!hit) return false
  try {
    await hit.group.sendMsg(msg)
    return true
  } catch {
    return false
  }
}
