/**
 * 账号写操作命令解析（纯函数，**必须放 utils 而不是 apps**）
 *
 * 仓库纪律同 utils/command.js 顶部：apps 里只许导出插件类（index.js 把
 * 「第一个函数导出」当插件类去 new），辅助函数一律落在这里。
 *
 * 覆盖 qqmusic-api-enhanced 的 24 个写接口：
 *   歌单   create / delete / addSongs / delSongs / like / unlike
 *   收藏   favSonglistWrite / unfavSonglistWrite / favAlbumWrite / unfavAlbumWrite
 *   不喜欢 addDislike / cancelDislike / cancelAllDislike
 *   评论   add / delete
 *   音响力 like / privacy
 *   私信   send / deleteSession / deleteMessage / clearSession / setConfig /
 *          markAllRead / cardAction
 *
 * 所有写命令都**必须带确认词**（`确认` / `confirm`）—— 误触会真改账号数据，
 * 解析层就把没带确认词的命令判成"用法提示"，而不是放行。
 */

/** 确认词：中文「确认」或英文 confirm（大小写不敏感） */
export const MANAGE_CONFIRM_RE = /^(?:确认|确认执行|确认操作|confirm|CONFIRM)$/i

/**
 * 通用：命令尾巴里挑出确认词，返回去掉确认词后的剩余参数。
 * 只有确认词在**结尾**才算数（`确认` 出现在中间不认，避免标题里带个"确认"就误放行）。
 * @returns {{ok:boolean, rest:string}}
 */
export function splitConfirm(text = '') {
  const s = String(text ?? '').trim()
  const parts = s.split(/\s+/)
  if (!parts.length) return { ok: false, rest: s }
  const tail = parts[parts.length - 1]
  if (!MANAGE_CONFIRM_RE.test(tail)) return { ok: false, rest: s }
  return { ok: true, rest: parts.slice(0, -1).join(' ').trim() }
}

/**
 * 写接口成功回包有时仍带着上游业务码。
 *
 * API 的 writeRes/finish 已检查最外层 r.code，但业务错误也可能落在返回的
 * data.code 里。插件如果只信外层 result=100，就会把这类失败误报成“已执行”。
 * 这里只认 code 字段，避免把普通响应里的 message 误判成失败。
 */
export function upstreamWriteError(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const code = data.code
  if (code == null || String(code).trim() === '') return ''
  if (Number(code) === 0) return ''
  const message = data.errMsg ?? data.errmsg ?? data.msg ?? data.message
  return String(message ?? '').trim() || `上游返回 code=${code}`
}

const RE_PREFIX = /^#?(?:qq|QQ)m\s*/i

/** 歌单名：允许中文/英文/数字/少量符号，1-30 字 */
function cleanPlaylistName(raw = '') {
  return String(raw ?? '').trim().replace(/^["'「『]+|["'」』]+$/g, '').trim()
}

/** 歌曲规格：`123:1` / `123`（默认 type=1）/ 多首用逗号或空格 */
export function parseSongSpecs(raw = '') {
  const out = []
  for (const chunk of String(raw ?? '').split(/[\s,，]+/)) {
    const s = chunk.trim()
    if (!s) continue
    const m = s.match(/^(\d+)(?::(\d+))?$/)
    if (!m) continue
    out.push(`${m[1]}:${m[2] || 1}`)
  }
  return out
}

/** 纯数字 ID 列表：`123,456` */
export function parseIdList(raw = '') {
  const out = []
  for (const chunk of String(raw ?? '').split(/[\s,，]+/)) {
    const s = chunk.trim()
    if (/^\d+$/.test(s)) out.push(Number(s))
  }
  return out
}

// ──────────── 歌单 / 收藏 ────────────

/**
 * 歌单与收藏类命令的统一解析。
 *
 * 支持的写法（末尾都要带确认词）：
 *   歌单新建 <名称> 确认
 *   歌单删除 <dirId> 确认
 *   歌单加歌 <dirId> <songId[:type]...> 确认
 *   歌单删歌 <dirId> <songId[:type]...> 确认
 *   喜欢歌曲 <songId[:type]...> 确认       （收藏进「我喜欢」，dirId=201）
 *   取消喜欢 <songId[:type]...> 确认
 *   收藏歌单 <playlistId...> 确认
 *   收藏歌单取消 <playlistId...> 确认
 *   收藏专辑 <albumId...> 确认
 *   收藏专辑取消 <albumId...> 确认
 *
 * @returns {{action:string, name:string, dirId:number, ids:number[], songs:string[], ok:boolean, usage:string}}
 */
export function parsePlaylistCmd(text = '') {
  const base = { action: '', name: '', dirId: 0, ids: [], songs: [], ok: false, usage: '' }
  const m = String(text ?? '').trim().match(RE_PREFIX)
  if (!m) return base
  let body = String(text).trim().slice(m[0].length).trim()

  // 收藏歌单取消 要在 收藏歌单 之前判（前缀包含关系）
  let action = ''
  for (const [re, name] of [
    [/^(?:歌单新建|新建歌单)\s+([\s\S]+)$/, 'playlistCreate'],
    [/^(?:歌单删除|删除歌单|解散歌单)\s+([\s\S]+)$/, 'playlistDelete'],
    [/^(?:歌单加歌|歌单添加|添加歌曲)\s+([\s\S]+)$/, 'playlistAddSongs'],
    [/^(?:歌单删歌|歌单移除|移除歌曲)\s+([\s\S]+)$/, 'playlistDelSongs'],
    [/^(?:喜欢歌曲|收藏歌曲)\s+([\s\S]+)$/, 'likeSong'],
    [/^(?:取消喜欢|取消收藏歌曲)\s+([\s\S]+)$/, 'unlikeSong'],
    [/^(?:收藏专辑取消|取消收藏专辑|专辑取消收藏)\s+([\s\S]+)$/, 'unfavAlbum'],
    [/^(?:收藏专辑|专辑收藏)\s+([\s\S]+)$/, 'favAlbum'],
    [/^(?:收藏歌单取消|取消收藏歌单|歌单取消收藏)\s+([\s\S]+)$/, 'unfavSonglist'],
    [/^(?:收藏歌单|歌单收藏)\s+([\s\S]+)$/, 'favSonglist'],
  ]) {
    const mm = body.match(re)
    if (mm) {
      action = name
      body = mm[1].trim()
      break
    }
  }
  if (!action) return base

  const { ok, rest } = splitConfirm(body)
  const out = { ...base, action, ok }
  if (!ok) return out

  if (action === 'playlistCreate') {
    out.name = cleanPlaylistName(rest)
    if (!out.name || out.name.length > 30) {
      out.usage = '歌单名需为 1-30 个字符'
      out.ok = false
    }
    return out
  }

  const parts = rest.split(/\s+/).filter(Boolean)
  if (action === 'playlistDelete') {
    const dirId = Number(parts[0])
    if (!Number.isFinite(dirId) || dirId <= 0) {
      out.usage = '用法：#qqm歌单删除 <dirId> 确认'
      out.ok = false
      return out
    }
    out.dirId = dirId
    return out
  }

  if (action === 'playlistAddSongs' || action === 'playlistDelSongs') {
    const dirId = Number(parts[0])
    const songs = parseSongSpecs(parts.slice(1).join(' '))
    if (!Number.isFinite(dirId) || dirId <= 0 || !songs.length) {
      out.usage = `用法：#qqm${action === 'playlistAddSongs' ? '歌单加歌' : '歌单删歌'} <dirId> <songId[:type]> 确认`
      out.ok = false
      return out
    }
    out.dirId = dirId
    out.songs = songs
    return out
  }

  if (action === 'likeSong' || action === 'unlikeSong') {
    const songs = parseSongSpecs(rest)
    if (!songs.length) {
      out.usage = `用法：#qqm${action === 'likeSong' ? '喜欢歌曲' : '取消喜欢'} <songId[:type]> 确认`
      out.ok = false
      return out
    }
    out.songs = songs
    return out
  }

  // 收藏 / 取消收藏专辑：逗号或空格分隔的 albumId
  const ids = parseIdList(rest)
  if (!ids.length) {
    const usageWords = {
      favAlbum: '收藏专辑 <albumId...>',
      unfavAlbum: '收藏专辑取消 <albumId...>',
      favSonglist: '收藏歌单 <playlistId...>',
      unfavSonglist: '收藏歌单取消 <playlistId...>',
    }
    out.usage = `用法：#qqm${usageWords[action]} 确认`
    out.ok = false
    return out
  }
  out.ids = ids
  return out
}

// ──────────── 不喜欢 ────────────

/** type：1=歌曲 2=歌手 3=风格；中文别名也收 */
export function parseDislikeType(raw = '') {
  const s = String(raw ?? '').trim()
  if (/^1$|歌曲|单曲/.test(s)) return 1
  if (/^2$|歌手|艺人/.test(s)) return 2
  if (/^3$|风格|曲风/.test(s)) return 3
  return 0
}

/**
 * 不喜欢管理：
 *   不喜欢 <歌曲|歌手|风格> <id...> 确认
 *   取消不喜欢 <歌曲|歌手|风格> <id...> 确认
 *   清空不喜欢 确认
 */
export function parseDislikeCmd(text = '') {
  const base = { action: '', type: 0, ids: [], ok: false, usage: '' }
  const m = String(text ?? '').trim().match(RE_PREFIX)
  if (!m) return base
  const body = String(text).trim().slice(m[0].length).trim()

  if (/^(?:清空不喜欢|取消全部不喜欢|不喜欢清空)\s+[\s\S]+$/.test(body)) {
    const rest = body.replace(/^(?:清空不喜欢|取消全部不喜欢|不喜欢清空)\s+/, '')
    const { ok } = splitConfirm(rest)
    return { ...base, action: 'cancelAllDislike', ok }
  }

  // 最顺手的写法：不喜欢歌曲 123 / 取消不喜欢歌手 888。
  // 也保留显式的「不喜欢 歌曲 123」（类型与 ID 分开），两条规则共用一套参数。
  const typed = body.match(/^(取消不喜欢|不喜欢)(歌曲|单曲|歌手|艺人|风格|曲风)\s+([\s\S]+)$/)
  const generic = body.match(/^(取消不喜欢|不喜欢)\s+([\s\S]+)$/)
  const mm = typed || generic
  if (!mm) return base
  const action = mm[1] === '不喜欢' ? 'addDislike' : 'cancelDislike'
  const { ok, rest } = splitConfirm(typed ? mm[3] : mm[2])
  const parts = rest.split(/\s+/).filter(Boolean)
  const type = parseDislikeType(typed ? mm[2] : parts[0])
  const ids = parseIdList(typed ? parts.join(' ') : parts.slice(1).join(' '))
  if (!ok) return { ...base, action, type, ids }
  if (!type || !ids.length) {
    return {
      ...base,
      action,
      type,
      ids,
      ok: false,
      usage: `用法：#qqm${action === 'addDislike' ? '不喜欢' : '取消不喜欢'} <歌曲|歌手|风格> <id...> 确认`,
    }
  }
  return { action, type, ids, ok: true, usage: '' }
}

// ──────────── 评论 ────────────

/**
 * 评论：
 *   发评论 <歌曲|专辑|歌单|排行|MV> <bizId> <内容> 确认
 *   删评论 <cmId> 确认
 */
export function parseCommentCmd(text = '') {
  const base = { action: '', biztype: 0, bizId: '', content: '', cmId: '', ok: false, usage: '' }
  const m = String(text ?? '').trim().match(RE_PREFIX)
  if (!m) return base
  const body = String(text).trim().slice(m[0].length).trim()

  const del = body.match(/^(?:删评论|删除评论|评论删除)\s+([\s\S]+)$/)
  if (del) {
    const { ok, rest } = splitConfirm(del[1])
    const cmId = rest.trim()
    if (!ok) return { ...base, action: 'commentDelete', cmId }
    if (!cmId) {
      return { ...base, action: 'commentDelete', ok: false, usage: '用法：#qqm删评论 <cmId> 确认' }
    }
    return { ...base, action: 'commentDelete', cmId, ok: true }
  }

  const add = body.match(/^(?:发评论|评论发布|发布评论)\s+([\s\S]+)$/)
  if (!add) return base
  const { ok, rest } = splitConfirm(add[1])
  const parts = rest.split(/\s+/).filter(Boolean)
  const bizLabel = parts[0] || ''
  const biztype = /^1$|歌曲|单曲/.test(bizLabel)
    ? 1
    : /^2$|专辑/.test(bizLabel)
      ? 2
      : /^3$|歌单/.test(bizLabel)
        ? 3
        : /^4$|排行|榜单/.test(bizLabel)
          ? 4
          : /^5$|mv|MV/.test(bizLabel)
            ? 5
            : 0
  const bizId = parts[1] || ''
  const content = parts.slice(2).join(' ').trim()
  if (!ok) return { ...base, action: 'commentAdd', biztype, bizId, content }
  if (!biztype || !bizId || !content) {
    return {
      ...base,
      action: 'commentAdd',
      biztype,
      bizId,
      content,
      ok: false,
      usage: '用法：#qqm发评论 <歌曲|专辑|歌单|排行|MV> <bizId> <内容> 确认',
    }
  }
  return { action: 'commentAdd', biztype, bizId, content, ok: true, usage: '' }
}

// ──────────── 音响力（好友听歌榜） ────────────

/**
 *   音响力点赞 <uin> 确认
 *   音响力取消点赞 <uin> 确认
 *   音响力隐私 <0|1> 确认      （公开 / 隐藏，按 API status 原样传）
 */
export function parseSoundPowerCmd(text = '') {
  const base = { action: '', uin: '', status: null, ok: false, usage: '' }
  const m = String(text ?? '').trim().match(RE_PREFIX)
  if (!m) return base
  const body = String(text).trim().slice(m[0].length).trim()

  const priv = body.match(/^(?:音响力隐私|排行榜隐私|音响力设置)\s+([\s\S]+)$/)
  if (priv) {
    const { ok, rest } = splitConfirm(priv[1])
    const status = Number(rest.trim())
    if (!ok) return { ...base, action: 'soundpowerPrivacy', status }
    if (![0, 1].includes(status)) {
      return { ...base, action: 'soundpowerPrivacy', ok: false, usage: '用法：#qqm音响力隐私 <0|1> 确认（1=隐藏，0=公开）' }
    }
    return { ...base, action: 'soundpowerPrivacy', status, ok: true }
  }

  const cancel = body.match(/^(?:音响力取消点赞|取消音响力点赞)\s+([\s\S]+)$/)
  if (cancel) {
    const { ok, rest } = splitConfirm(cancel[1])
    const uin = rest.trim()
    if (!ok) return { ...base, action: 'soundpowerUnlike', uin }
    if (!uin) return { ...base, action: 'soundpowerUnlike', ok: false, usage: '用法：#qqm音响力取消点赞 <uin> 确认' }
    return { ...base, action: 'soundpowerUnlike', uin, ok: true }
  }

  const like = body.match(/^(?:音响力点赞|点赞好友)\s+([\s\S]+)$/)
  if (like) {
    const { ok, rest } = splitConfirm(like[1])
    const uin = rest.trim()
    if (!ok) return { ...base, action: 'soundpowerLike', uin }
    if (!uin) return { ...base, action: 'soundpowerLike', ok: false, usage: '用法：#qqm音响力点赞 <uin> 确认' }
    return { ...base, action: 'soundpowerLike', uin, ok: true }
  }

  return base
}

// ──────────── 私信 ────────────

/**
 * 私信写操作（7 个）。
 *
 *  私信发送 <userId> <msgType> <文本> 确认
 *  私信删除会话 <sessionId> 确认
 *  私信删除消息 <sessionId> <msgId> 确认
 *  私信清空会话 <sessionId> 确认
 *  私信设置 <configType> <configValue> 确认
 *  私信全部已读 <encryptUin> [cmdFlag] 确认
 *  私信卡片操作 <targetUserId> <msgType> <msgId> [value] 确认
 *
 * msgType 与 API 一致（1=文本）。发送的文本走 user_input。
 */
export function parsePrivateMsgCmd(text = '') {
  const base = { action: '', args: {}, ok: false, usage: '' }
  const m = String(text ?? '').trim().match(RE_PREFIX)
  if (!m) return base
  const body = String(text).trim().slice(m[0].length).trim()

  const patterns = [
    [/^(?:私信发送|发送私信)\s+([\s\S]+)$/, 'privateSend'],
    [/^(?:私信删除会话|删除私信会话)\s+([\s\S]+)$/, 'privateDeleteSession'],
    [/^(?:私信删除消息|删除私信消息)\s+([\s\S]+)$/, 'privateDeleteMessage'],
    [/^(?:私信清空会话|清空私信会话|私信清空)\s+([\s\S]+)$/, 'privateClearSession'],
    [/^(?:私信设置|设置私信)\s+([\s\S]+)$/, 'privateSetConfig'],
    [/^(?:私信全部已读|私信标记已读)\s+([\s\S]+)$/, 'privateMarkAllRead'],
    [/^(?:私信卡片操作|私信卡片)\s+([\s\S]+)$/, 'privateCardAction'],
  ]
  let action = ''
  let payload = ''
  for (const [re, name] of patterns) {
    const mm = body.match(re)
    if (mm) {
      action = name
      payload = mm[1]
      break
    }
  }
  if (!action) return base

  const { ok, rest } = splitConfirm(payload)
  const parts = rest.split(/\s+/).filter(Boolean)
  const out = { ...base, action, ok }

  if (action === 'privateSend') {
    const userId = parts[0] || ''
    const msgType = Number(parts[1])
    const content = parts.slice(2).join(' ').trim()
    out.args = { userId, msgType, content }
    if (!ok) return out
    if (!userId || !Number.isFinite(msgType) || !content) {
      return { ...out, ok: false, usage: '用法：#qqm私信发送 <userId> <msgType> <文本> 确认' }
    }
    return out
  }

  if (action === 'privateDeleteSession' || action === 'privateClearSession') {
    const sessionId = parts[0] || ''
    out.args = { sessionId }
    if (!ok) return out
    if (!sessionId) {
      return { ...out, ok: false, usage: `用法：#qqm${action === 'privateDeleteSession' ? '私信删除会话' : '私信清空会话'} <sessionId> 确认` }
    }
    return out
  }

  if (action === 'privateDeleteMessage') {
    const sessionId = parts[0] || ''
    const msgId = parts[1] || ''
    out.args = { sessionId, msgId }
    if (!ok) return out
    if (!sessionId || !msgId) {
      return { ...out, ok: false, usage: '用法：#qqm私信删除消息 <sessionId> <msgId> 确认' }
    }
    return out
  }

  if (action === 'privateSetConfig') {
    const configType = Number(parts[0])
    const configValue = parts.slice(1).join(' ').trim()
    out.args = { configType, configValue }
    if (!ok) return out
    if (!Number.isFinite(configType) || !configValue) {
      return { ...out, ok: false, usage: '用法：#qqm私信设置 <configType> <configValue> 确认' }
    }
    return out
  }

  if (action === 'privateMarkAllRead') {
    const encryptUin = parts[0] || ''
    const cmdFlag = parts[1] != null ? Number(parts[1]) : 1
    out.args = { encryptUin, cmdFlag: Number.isFinite(cmdFlag) ? cmdFlag : 1 }
    if (!ok) return out
    if (!encryptUin) {
      return { ...out, ok: false, usage: '用法：#qqm私信全部已读 <encryptUin> [cmdFlag] 确认' }
    }
    return out
  }

  // privateCardAction
  const targetUserId = parts[0] || ''
  const msgType = Number(parts[1])
  const msgId = parts[2] || ''
  const value = parts[3] != null ? Number(parts[3]) : 1
  out.args = { targetUserId, msgType, msgId, value: Number.isFinite(value) ? value : 1 }
  if (!ok) return out
  if (!targetUserId || !Number.isFinite(msgType) || !msgId) {
    return { ...out, ok: false, usage: '用法：#qqm私信卡片操作 <targetUserId> <msgType> <msgId> [value] 确认' }
  }
  return out
}

/**
 * 一句话用法提示：`#qqm账号操作` 时不带子命令，回这条。
 * handler 用它做总入口提示，避免用户猜命令。
 */
export const MANAGE_USAGE = [
  '【账号操作 · 仅主人】所有命令末尾都要带「确认」才会执行，例如 #qqm喜欢歌曲 123:1 确认',
  '歌单：#qqm歌单新建 <名称> / #qqm歌单删除 <dirId> / #qqm歌单加歌 <dirId> <songId[:type]> / #qqm歌单删歌 <dirId> <songId[:type]>',
  '收藏：#qqm喜欢歌曲 <songId[:type]> / #qqm取消喜欢 <songId[:type]> / #qqm收藏歌单 <playlistId...> / #qqm收藏歌单取消 <playlistId...> / #qqm收藏专辑 <albumId...> / #qqm收藏专辑取消 <albumId...>',
  '不喜欢：#qqm不喜欢 <歌曲|歌手|风格> <id...> / #qqm取消不喜欢 <歌曲|歌手|风格> <id...> / #qqm清空不喜欢',
  '评论：#qqm发评论 <歌曲|专辑|歌单|排行|MV> <bizId> <内容> / #qqm删评论 <cmId>',
  '音响力：#qqm音响力点赞 <uin> / #qqm音响力取消点赞 <uin> / #qqm音响力隐私 <0|1>',
  '私信：#qqm私信发送 <userId> <msgType> <文本> / #qqm私信删除会话 <sessionId> / #qqm私信清空会话 <sessionId> / #qqm私信删除消息 <sessionId> <msgId>',
  '私信：#qqm私信设置 <configType> <configValue> / #qqm私信全部已读 <encryptUin> / #qqm私信卡片操作 <targetUserId> <msgType> <msgId>',
].join('\n')

export default {
  MANAGE_CONFIRM_RE,
  MANAGE_USAGE,
  splitConfirm,
  upstreamWriteError,
  parseSongSpecs,
  parseIdList,
  parsePlaylistCmd,
  parseDislikeType,
  parseDislikeCmd,
  parseCommentCmd,
  parseSoundPowerCmd,
  parsePrivateMsgCmd,
}
