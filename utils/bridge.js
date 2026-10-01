/**
 * 主动发消息的桥（定时点歌 / 订阅推送用 —— **没有消息事件**时把歌发进群）
 *
 * 与「回复消息」的根本差别：正常链路手里有 `e`（框架给的，bot/group 都是现成的）；
 * 定时任务只在 store 里存了群号，得自己找 bot、拼一个**够真的合成事件**，
 * 让 deliverSong / renderCard / sendVocal 这条既有链路原样跑 —— 复制一份发送逻辑
 * 就是两处各烂各的（README 性能红线 ⑤ 的教训）。
 *
 * 合成事件的成员只填「下游真的会读的」：bot / group / group_id / user_id / reply。
 * detectAdapter 认 `e.bot`，OneBot 语音的 sendApi 路要 `e.bot.sendApi`，
 * 都能走通；下游不该读 `e.msg` / `e.at` 之类 —— 那本来就不属于合成事件。
 */

/**
 * 列出当前在线的全部 bot（TRSS 的 Bot 是 Map 子类、Miao 是普通对象，两样都收）
 * @returns {Array<[string, object]>} [uin, bot]
 */
export function botsList() {
  const B = global.Bot
  if (!B) return []
  const out = []
  const seen = new Set()
  const push = (uin, bot) => {
    const id = String(uin ?? '')
    if (!id || id === 'stdin' || seen.has(id)) return
    if (!bot || typeof bot !== 'object' || typeof bot.pickGroup !== 'function') return
    seen.add(id)
    out.push([id, bot])
  }
  // TRSS-Yunzai：Bot extends Map，值有直接是 bot 的，也有 { bot } 包一层的
  if (typeof B.entries === 'function') {
    try {
      for (const [uin, bot] of B.entries()) push(uin, bot?.bot || bot)
    } catch {
      /* Map 语义不完整就跳过 */
    }
  }
  // Miao-Yunzai / 老分支：Bot[uin] 直接挂
  for (const [uin, bot] of Object.entries(B)) {
    if (typeof B.entries === 'function' && typeof B.get === 'function') {
      try {
        if (B.get(uin) === bot) continue // 上面 Map 遍历已经收过
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

/**
 * 群列表里查得到这个群吗（gl 的键可能是数字也可能是字符串，两边都试）
 * 列表为空（bot 还在加载）时不拦截 —— 别把"还没加载完"当成"不在群"。
 */
function hasGroupInList(gl, gid) {
  if (!gl || typeof gl.get !== 'function') return true
  if (gl.get(gid)) return true
  const n = Number(gid)
  if (Number.isFinite(n) && gl.get(n)) return true
  return gl.size === 0
}

/**
 * 找一个「真的在这个群里」的 bot
 * @param {string|number} groupId
 * @param {string|number} [preferUin] 存任务时记下的 bot 号，优先用它（群在哪个账号下就是稳定的）
 * @returns {{bot:object, group:object}|null}
 */
export function pickBotForGroup(groupId, preferUin = '') {
  const gid = String(groupId)
  if (!gid) return null
  const candidates = []
  const pref = botOfUin(preferUin)
  if (pref) candidates.push(pref)
  for (const [, b] of botsList()) candidates.push(b)

  for (const bot of candidates) {
    // 有群列表（icqq / TRSS OneBot 适配器都是 Map）就用它先筛一遍，别对着
    // 已经退掉的群傻发（发送失败在 OneBot 上还会打出一条警告日志）
    if (!hasGroupInList(bot.gl, gid)) continue
    try {
      const group = bot.pickGroup(gid)
      if (group) return { bot, group }
    } catch {
      /* 这个账号没有该群，试下一个 */
    }
  }
  return null
}

/**
 * 拼一个够真的合成群事件（发不出去 = 不在线/没这个群 → null，调用方按失败处理）
 * @param {object} opts
 * @param {string|number} opts.groupId
 * @param {string|number} [opts.preferUin] 优先用哪个 bot
 * @param {string|number} [opts.userId] 事件"发起人"（定时点歌用它把 userKey 落到设置者账号上）
 */
export function groupEventOf({ groupId, preferUin = '', userId = '' } = {}) {
  const hit = pickBotForGroup(groupId, preferUin)
  if (!hit) return null
  const { bot, group } = hit
  const uid = String(userId || bot.uin || preferUin || '')
  return {
    self_id: bot.uin,
    user_id: uid,
    group_id: String(groupId),
    bot,
    group,
    isGroup: true,
    isMaster: false,
    // 下游只需要「reply 能把消息发进群」这一件事；返回值口径与 e.reply 一致
    reply: async (msg) => {
      await group.sendMsg(msg)
      return true
    },
  }
}

/**
 * 把任意消息（文本 / segment / 数组）发进群，返回是否发成功
 * @returns {Promise<boolean>}
 */
export async function sendToGroup(groupId, msg, preferUin = '') {
  if (!msg) return false
  const hit = pickBotForGroup(groupId, preferUin)
  if (!hit) return false
  try {
    await hit.group.sendMsg(msg)
    return true
  } catch {
    return false
  }
}
