/**
 * QQ 音乐点歌
 * 命令统一 #qqm 前缀，避免与其它插件 #点歌/#播放 冲突:
 *   #qqm点歌 / #qqm 点歌 关键词
 *   #qqm听1 ~ #qqm听N（兼容：本插件会话内仍可用 #听N）
 *   #qqm播放 关键词
 *   #qqm歌词 关键词或songmid
 *   #qqm热搜
 */

import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import {
  searchSongs,
  searchPlatformSongs,
  searchMultiSongs,
  songUrlBest,
  lyric,
  hotKeys,
  songInfoBatch,
  platformsStatus,
  SOURCE_LABEL,
} from '../utils/api.js'
import { pickSession, getUserSession, setSession } from '../utils/session.js'
import { deliverSong, sendNativeMusicCard } from '../utils/send.js'
import { QUALITY_LABEL } from '../utils/quality.js'
import { buildHelpCardData, buildGuideCardData, formatGuideText } from '../utils/help-card.js'
import { renderHelpCard, renderGuideCard, renderPlatformsCard, renderPlatformCard } from '../utils/render.js'
import { buildPlatformsCardData, formatPlatformsText, buildPlatformCardData, formatPlatformCardText } from '../utils/card-data.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logError, logWarn } from '../utils/log.js'
import { platformOf, platformShort, platformCanQrLogin, platformAliasPattern } from '../utils/platforms.js'
// ⚠️ 命令解析放 utils（见 utils/command.js 顶部注释）：apps 里多导出一个函数，
//    加载器就会把"第一个函数导出"当成插件类，整个模块失效
import { RE_SONG_CMD, RE_PICK_PLAIN, RE_LYRIC_CMD, RE_PLATFORM_STATUS, parseSongCmd, parseLyricCmd, parsePlatformStatusCmd } from '../utils/command.js'
import { getPref, setPref, clearPref } from '../utils/pref.js'
import {
  isV2Unlocked,
  platformEnabled,
  platformMaxList,
  platformQualityPref,
  fillSourceIds,
  qqSourceEnabled,
  standaloneSourceIds,
  enabledPlatforms,
} from '../utils/v2.js'

/**
 * 命令的统一写法：**平台前缀可选**
 *
 *   #qqm点歌 七里香          → QQ 曲库（老行为，一个字没变）
 *   #qqm网易云点歌 七里香    → 只搜网易云（2.0，未解锁时不响应）
 *   #qqm播放 七里香 / #qqmB站播放 七里香   —— 播放同样吃平台前缀
 *
 * 为什么不各写一条规则（2026-09-23 改）：以前 `#qqm点歌` 与 `#qqm<平台>点歌` 是
 * **两条独立规则**，多平台一加就是"同一件事好几个入口" —— 既容易两条同时命中
 * （两个 handler 都回话），也难保证两条的闸门/文案一致。现在一个动词一条规则，
 * 平台那截是可选的捕获组，由 handler 统一分流。
 *
 * ⚠️ 平台名要按**长别名优先**排（platformAliasPattern 已处理）：否则「网易云」
 *    会被切成「网易」+ 关键词"云点歌"。
 */
const RE_LISTEN = /^#?(?:qq|QQ)m\s*听\s*([1-9][0-9]?)$|^#听\s*([1-9][0-9]?)$/
/** `#qqm源` / `#qqm源 网易云` —— 查看/切换本群当前音源（2.0） */
const RE_SOURCE = new RegExp(`^#?(?:qq|QQ)m\\s*源(?:音源)?\\s*(?<arg>.+)?$`, 'i')
/** `#qqm帮助 全部` —— 展开完整清单（默认版每段只列 8 条，免得卡片长到看不清） */
const RE_HELP_FULL = /^#?(?:qq|QQ)m?\s*(?:帮助|help)\s*(?:全部|完整|all|full)$|^#?(?:qq|QQ)m帮助全部$/i


/**
 * 纯文本列表（图片卡失败时的兜底；也是没有 puppeteer 的环境里的唯一形态）
 * 来源说明按**列表里实际出现的来源**拼，不再写死「[网易云]/[酷我]/[B站]」
 * （2.0 之后来源可能有九家，写死会漏）。
 */
function formatListText(list, { title = 'QQ音乐点歌结果' } = {}) {
  const lines = list.map((s, i) => {
    const pay = s.payplay ? ' [付费]' : ''
    const src = s.source ? ` [${SOURCE_LABEL[s.source] || s.source}·${s.quality || '128k'}]` : ''
    const mv = s.mvVid ? ' 🎬' : ''
    return `${i + 1}. ${s.songName} - ${s.singerName}${pay}${src}${mv}${s.duration ? ` (${s.duration})` : ''}`
  })
  const sources = [...new Set(list.map((s) => s.source).filter(Boolean))]
  const srcNote = sources.length
    ? `\n（${sources.map((x) => `[${SOURCE_LABEL[x] || x}]`).join(' / ')} 标记为其它平台的免费补充曲，档位见标签）`
    : ''
  return (
    `♫ ${title}（#qqm听序号 或 #听序号；🎬=有MV，可 #qqmMV 播放 序号）${srcNote}\n${lines.join('\n')}`
  )
}

/**
 * 跨平台列表的称呼（"网易云/酷我/B站 等 8 家"）
 *
 * 只列前 3 家：群消息里一条标题列 8 个平台名会糊成一片，用户只需要知道
 * "这次是哪些音源在给我出歌"。
 */
function multiLabel(cfg) {
  const ps = enabledPlatforms(cfg)
  if (!ps.length) return '其它平台'
  const names = ps.map((p) => p.label)
  return names.length <= 3 ? names.join('/') : `${names.slice(0, 3).join('/')} 等 ${names.length} 家`
}

/**
 * 「当前音源」写进哪个作用域（**按身份分**，2026-09-23 定）
 *
 *   · 主人 → 群号：设的是**全群默认**（群里其他人没自己设过就用它）
 *   · 成员 → `群号:u<QQ号>`：只改**自己**那份，不动别人
 *   · 私聊 → 一律按人
 *
 * 为什么不做成"限主人才能用"：成员想只听网易云是很正常的需求，直接禁掉太粗暴；
 * 但让任何人都能改全群默认更糟（一个人换了、所有人跟着变）。分作用域两头都满足。
 */
function ownPrefScopeOf(e) {
  const group = String(e?.group_id || '')
  const uid = String(e?.user_id || '')
  // 键格式 `群:u:<QQ号>`（带分隔符，别写成 `:u${uid}` —— 读的人容易看成多一个下划线）
  if (group) return e?.isMaster === true || !uid ? group : `${group}:u:${uid}`
  return uid
}

/** 读的时候按优先级看的键：**自己设的**优先，其次主人给全群设的 */
function prefScopesToRead(e) {
  const group = String(e?.group_id || '')
  const uid = String(e?.user_id || '')
  if (!group) return uid ? [uid] : []
  const keys = []
  if (uid) keys.push(`${group}:u:${uid}`)
  keys.push(group)
  return keys
}

/**
 * 「当前音源」（`#qqm源 网易云` 设的那个）
 *
 * @returns {Promise<{p:object, scope:string, own:boolean}|null>}
 *   p = 平台对象；own = true 表示这是**调用者自己**设的（而不是主人给全群设的）
 *   没设 / 设的平台后来被关掉 → null（就当没设，别拿一个关掉的音源去搜）
 *   只有 2.0 解锁后才看这个偏好 —— 关着时预置无效，与 1.9 完全一致。
 */
async function currentSourceOf(e, cfg) {
  if (!isV2Unlocked(cfg)) return null
  const groupKey = String(e?.group_id || '')
  try {
    for (const scope of prefScopesToRead(e)) {
      // eslint-disable-next-line no-await-in-loop
      const pref = await getPref(scope)
      const id = String(pref?.source || '').trim()
      if (!id) continue
      const p = platformOf(id)
      if (!p || p.own) continue
      if (!platformEnabled(cfg, p.id)) continue
      return { p, scope, own: scope !== groupKey }
    }
    return null
  } catch {
    return null
  }
}

async function resolvePlay(song, cfg, userKey = '') {
  /**
   * 档位：QQ 本体用全局 `quality`；**外部平台用这家自己的档位**
   * （锅巴 → 该平台页签 → 音质档位）。不这样做的话，外源永远只能"按它默认"，
   * 页签里的档位选择器就成了摆设。
   * API 侧还会再核一遍"现在能不能兑现"（要账号/会员的档位会如实回落）。
   */
  const quality =
    song.source && song.source !== 'qq' ? platformQualityPref(cfg, song.source) : cfg.quality || 'flac'
  const fallback = cfg.qualityFallback !== false
  try {
    const play = await songUrlBest(song.songmid, {
      quality,
      mediaId: song.media_mid || song.songmid,
      fallback,
      userKey,
    })
    return {
      url: play.url || '',
      quality: play.quality,
      qualityLabel: play.qualityLabel || QUALITY_LABEL[play.quality] || play.quality,
      degradeNote: play.degradeNote || '',
      mvVid: play.mvVid || '',
      raw: play,
    }
  } catch (e) {
    return {
      url: '',
      quality,
      qualityLabel: QUALITY_LABEL[quality] || quality,
      error: e.message,
      raw: e.payload,
    }
  }
}

export class qqmusicSong extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-点歌',
      dsc: '对接 qqmusic-api-enhanced 的点歌',
      event: 'message',
      priority: 400,
      rule: [
        {
          // 点歌 + 播放：**一条规则**（可选平台前缀 + 可选/必写的动词，见 RE_SONG_CMD 注释）
          // 平台分支在 handler 里判闸门：未解锁时静默放行，与 1.9 一致
          reg: RE_SONG_CMD,
          fnc: 'onSongCmd',
        },
        {
          // 无前缀「#点歌」：只在锅巴开启「接管无前缀点歌」后响应，未开启时返回 false 让给其它插件
          reg: '^#?点歌\\s*(.+)$',
          fnc: 'pickSongDefault',
        },
        {
          // #qqm听N 正式指令；#听N 仅在本插件会话存在时响应（不抢其它插件）
          reg: '^#?(qq|QQ)m\\s*听\\s*([1-9][0-9]?)$|^#听\\s*([1-9][0-9]?)$',
          fnc: 'chooseSong',
        },
        {
          // 歌词：也吃平台前缀（`#qqm网易歌词 晴天`），与点歌同一套别名
          reg: RE_LYRIC_CMD,
          fnc: 'getLyric',
        },
        {
          reg: '^#?(qq|QQ)m\\s*热搜$',
          fnc: 'hotSearch',
        },
        {
          // 2.0：列出可用平台（未解锁时不响应）
          reg: '^#?(qq|QQ)m\\s*平台$',
          fnc: 'platformList',
        },
        {
          // 2.0：各家平台的**登录状态卡**（未解锁时不响应）
          reg: '^#?(qq|QQ)m\\s*(平台状态|音源状态|登录状态)$',
          fnc: 'platformsStatusCard',
        },
        {
          // 2.0：**单平台**状态卡（#qqm网易状态 / #qqm酷狗状态 …）—— 与聚合卡同一数据源
          reg: RE_PLATFORM_STATUS,
          fnc: 'platformStatusCard',
        },
        {
          // 2.0：查看/切换当前音源（未解锁时不响应）—— 省掉每次重复打平台名
          reg: RE_SOURCE,
          fnc: 'sourceCmd',
        },
        {
          // 帮助：`#qqm帮助`（精简版：每段最多 8 条）/ `#qqm帮助 全部`（完整清单）
          reg: '^#?(qq|QQ)m\\s*帮助(\\s*(全部|完整|all|full))?$|^#?(qq|QQ)音乐帮助$|^#?(qq|QQ)m\\s*help(\\s*(all|full|全部))?$|^#qm帮助(全部)?$',
          fnc: 'help',
        },
      ],
    })
  }

  cfg() {
    return getCfg()
  }

  /**
   * 「#qqm点歌 / #qqm播放（含平台前缀）」的**唯一入口**
   *
   * 一条规则 → 一个入口 → 按解析出的动词分流到 pickSong / playDirect。
   * 这样"两条规则抢同一条消息"这类冲突从结构上就不存在了（实测抓过：
   * `#qqm网易云播放 晴天` 会被点歌规则的"动词可省"分支抢走）。
   */
  async onSongCmd(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    const { verb, plat, keyword } = parseSongCmd(String(e.msg || ''))
    if (!keyword) {
      // 平台名/动词给了、关键词没给（`#qqm网易`、`#qqm网易云点歌`、`#qqm点歌`）：提示用法，别沉默
      if (plat) {
        await e.reply(
          verb === '播放'
            ? `用法：#qqm${plat}播放 关键词`
            : `用法：#qqm${plat} 关键词（也可以 #qqm${plat}点歌 关键词 / #qqm${plat}播放 关键词）`
        )
        return true
      }
      if (verb) {
        await e.reply(`用法：#qqm${verb} 关键词`)
        return true
      }
      return false
    }
    // 显式"播放"= 搜第一条直接播；"点歌"与"带平台的省动词写法"都出列表
    if (verb === '播放') return await this.playDirect(e)
    return await this.pickSong(e)
  }

  /** 无前缀「#点歌」：配置开启才接管，否则放行给其它点歌插件 */
  async pickSongDefault(e) {
    const cfg = this.cfg()
    if (cfg.defaultPickSong !== true) return false
    return this.pickSong(e)
  }

  async pickSong(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false

    const msg = String(e.msg || '').trim()
    // 兼容无前缀「#点歌 关键词」（锅巴开关打开时才接管）
    const bare = msg.match(RE_PICK_PLAIN)
    const parsed = parseSongCmd(msg)
    const keyword = parsed.keyword || (bare?.groups?.kw || '').trim()
    if (!keyword) {
      await e.reply('用法：#qqm点歌 关键词')
      return true
    }

    /**
     * 带平台前缀 → 走"只搜这一家"（2.0）。
     * 未解锁时**静默放行**（return false）：与 1.9 一模一样 —— 那条命令在 1.9 里
     * 根本不存在，所以既不能回话、也不能报错。
     */
    const platName = parsed.plat
    if (platName) {
      if (!isV2Unlocked(cfg)) return false
      return await this.pickSongOnPlatform(e, platName, keyword)
    }

    const userKey = String(e.user_id || '')
    try {
      // 2.0：本群设过"当前音源"就直接用它（#qqm源 网易云 → 之后 #qqm点歌 都走网易云）
      const cur = await currentSourceOf(e, cfg)
      if (cur) {
        return await this.pickSongOnPlatform(e, cur.p.id, keyword, { viaSource: true })
      }

      /**
       * QQ 音源被关掉时，这个命令就是"跨平台点歌"（QQ 不是唯一主干）。
       *
       * ⚠️ `qqEnabled` 是 **2.0 的开关**（"QQ 不是主营"是 2.0 才有的设定），
       * 所以它和平台清单一样**受？？？闸门管**：
       *   · 未解锁：锅巴里看不到这个字段（见 guoba/schemas.js），行为也一律当"开着"，
       *     与 2.0 之前逐字一致 —— 老用户即使 yaml 里留着 `qqEnabled: false`
       *     （比如从 2.0 退回去），点歌也不会突然只搜外源；
       *   · 解锁：开关才真正生效（锅巴里也才会出现）。
       */
      if (isV2Unlocked(cfg) && !qqSourceEnabled(cfg)) {
        await e.reply(`正在搜索（${multiLabel(cfg)}）：${keyword}`)
        return await this.pickAcrossPlatforms(e, { keyword, cfg, userKey, reason: 'qq-off' })
      }

      await e.reply(`正在搜索：${keyword}`)
      const list = await searchSongs(keyword, {
        pageSize: Math.min(Number(cfg.maxList) || 10, 20),
        userKey,
        // 补充曲：默认开启，锅巴里显式关掉才不补（老配置没有该键 → 视为开）
        fill: cfg.extraSources !== false,
        // 2.0：只补"参与了跨平台补歌"的那几家（未解锁时传 null = 不过滤，与 1.x 一致）
        fillSources: isV2Unlocked(cfg) ? fillSourceIds(cfg) : null,
      })
      if (!list.length) {
        // QQ 一条没有：别急着说"没有搜到"——其它平台的免费曲还能顶上列表
        if (standaloneSourceIds(cfg).length) {
          return await this.pickAcrossPlatforms(e, { keyword, cfg, userKey, reason: 'qq-empty' })
        }
        await e.reply('没有搜到相关歌曲')
        return true
      }

      return await this.presentList(e, { keyword, list, cfg })
    } catch (err) {
      /**
       * QQ 侧整体失败（未登录/Key 过期/网络/上游 5xx）时也**不要只报错**：
       * 开了外部平台的话，直接用它们的免费曲出列表 ——
       * 这正是"QQ 不是主营"的落地：QQ 挂了，点歌这件事不能跟着一起挂。
       */
      if (standaloneSourceIds(cfg).length) {
        logWarn(`QQ 侧搜索失败（${err.message}），改用外部平台兜底`)
        return await this.pickAcrossPlatforms(e, { keyword, cfg, userKey, reason: 'qq-error', qqError: err.message })
      }
      logError(`点歌失败: ${err.message}`)
      await e.reply(`点歌失败：${err.message}`)
    }
    return true
  }

  /**
   * 2.0：**跨平台点歌**（QQ 关掉 / 搜不到 / QQ 侧报错时用它顶列表）
   *
   * 走 API 的 `?sources=`（多平台并行搜 + 去重 + 逐条验证可播 + 按平台交错），
   * 列表、会话、`#qqm听N` 与 QQ 点歌完全共用 —— 用户操作没有区别。
   */
  async pickAcrossPlatforms(e, { keyword, cfg, userKey, reason = '', qqError = '' }) {
    const ids = standaloneSourceIds(cfg)
    if (!ids.length) {
      await e.reply('没有可用的音源平台（锅巴 → 「？？？」打开后选几家）')
      return true
    }
    const label = multiLabel(cfg)
    try {
      const res = await searchMultiSongs(keyword, ids, {
        pageSize: Math.min(Number(cfg.maxList) || 10, 20),
        userKey,
      })
      if (!res.list.length) {
        await e.reply(
          res.error
            ? `${label} 搜索失败：${res.error}`
            : `${label} 也没有搜到「${keyword}」${reason === 'qq-error' && qqError ? `（QQ 侧：${qqError}）` : ''}`
        )
        return true
      }
      // 说明为什么这次是"外源列表"（QQ 关了 / 没搜到 / QQ 报错），透明一点
      const why =
        reason === 'qq-off'
          ? '（已关闭 QQ 音源）'
          : reason === 'qq-error'
            ? `（QQ 侧搜索失败：${qqError}）`
            : '（QQ 曲库没有这条，下面都是其它平台的可播曲）'
      await e.reply(`下面 ${res.list.length} 条来自 ${label}${why}`)
      return await this.presentList(e, {
        keyword,
        list: res.list,
        cfg,
        title: `${label} 点歌结果`,
        sourceLabel: label,
      })
    } catch (err) {
      logError(`跨平台点歌失败: ${err.message}`)
      await e.reply(`${label} 点歌失败：${err.message}`)
      return true
    }
  }

  /**
   * 2.0：`#qqm网易云点歌 关键词` 等单平台点歌（由 pickSong 分流进来）
   *
   * 也保留"直接调用"的入口（单测用它验闸门）：`pickSongPlatform(e)` 会自己从消息里
   * 再解析一次平台与关键词。
   */
  async pickSongPlatform(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    if (!isV2Unlocked(cfg)) return false
    // 复用点歌那条规则（它同时认「平台+点歌」与「平台+关键词」两种写法），只要求带平台前缀
    const { plat: platName, keyword } = parseSongCmd(String(e.msg || ''))
    if (!platName || !keyword) return false
    return await this.pickSongOnPlatform(e, platName, keyword)
  }

  /** 单平台点歌的实体（pickSong 与 pickSongPlatform 共用，保证两条入口行为一致） */
  async pickSongOnPlatform(e, platName, keyword, { viaSource = false } = {}) {
    const cfg = this.cfg()
    const p = platformOf(platName)
    if (!p) return false
    if (!platformEnabled(cfg, p.id)) {
      await e.reply(`${p.label} 音源已被关闭（锅巴 → 音源平台）`)
      return true
    }

    const userKey = String(e.user_id || '')
    try {
      // viaSource：这回用的是"当前音源"，先说清是哪个（免得用户忘了自己设过）
      await e.reply(viaSource ? `正在搜索（当前音源 ${p.label}）：${keyword}` : `正在搜索 ${p.label}：${keyword}`)
      const res = await searchPlatformSongs(keyword, p.id, {
        pageSize: platformMaxList(cfg, p.id),
        userKey,
      })
      if (!res.list.length) {
        // 三种"空"要分开说，别都回一句"没搜到"（那会把 401/超时伪装成"歌不存在"）：
        //   ① 请求本身失败（鉴权/超时/上游 5xx）→ 报原因
        //   ② 这家没配好（酷狗缺凭据、YouTube 缺代理等）→ 报可操作的一步
        //   ③ 这家真没有 → 普通的"没搜到"
        await e.reply(
          res.error
            ? `${p.label} 搜索失败：${res.error}`
            : res.unavailable
            ? `${p.label} 音源暂时不可用：${res.unavailable}`
            : `${p.label} 没有搜到「${keyword}」`
        )
        return true
      }
      return await this.presentList(e, {
        keyword,
        list: res.list,
        cfg,
        title: `${p.label} 点歌结果`,
        sourceLabel: p.label,
      })
    } catch (err) {
      logError(`[${p.id}] 点歌失败: ${err.message}`)
      await e.reply(`${p.label} 点歌失败：${err.message}`)
      return true
    }
  }

  /**
   * 2.0：`#qqm平台状态` —— 各家平台**登录状态卡**（未解锁时不响应）
   *
   * 只打**一次** API（`GET /platforms` 聚合），卡片上"下一步该干什么"直接写出来：
   * 能扫码的给 `#qqm<平台>登录`，凭据类的给 POST 接口，匿名音源标"不需要账号"。
   */
  async platformsStatusCard(e) {
    const cfg = this.cfg()
    if (!isV2Unlocked(cfg)) return false
    const userKey = String(e.user_id || '')
    try {
      await e.reply('正在查各家平台的登录状态…')
      const status = await platformsStatus(userKey)
      const data = buildPlatformsCardData(status)
      const img = await renderPlatformsCard(e, data)
      if (img) {
        await e.reply(img)
        return true
      }
      await e.reply(formatPlatformsText(data))
      return true
    } catch (err) {
      logError(`平台状态卡失败: ${err.message}`)
      await e.reply(`查询平台状态失败：${err.message}`)
      return true
    }
  }

  /**
   * 2.0：`#qqm<平台>状态` —— **单平台**状态卡（#qqm网易状态 / #qqm酷狗状态 …）
   *
   * 数据与聚合卡同源（`GET /platforms`，10s 缓存），这里只挑出那一家，
   * 再把它的命令清单补齐：这一家怎么点歌/播放/取词、缺什么、下一步点哪。
   * 未解锁（？？？关着）时**静默放行**：这些命令在 1.9 里不存在。
   */
  async platformStatusCard(e) {
    const cfg = this.cfg()
    if (!isV2Unlocked(cfg)) return false
    const { plat } = parsePlatformStatusCmd(String(e.msg || ''))
    const p = platformOf(plat)
    if (!p) return false
    const userKey = String(e.user_id || '')
    try {
      const status = await platformsStatus(userKey)
      const data = buildPlatformCardData(status, p.id)
      if (!data) {
        await e.reply(`${p.label}：暂无状态（API 的 /platforms 里没有这一家）`)
        return true
      }
      const img = await renderPlatformCard(e, data)
      if (img) {
        await e.reply(img)
        return true
      }
      await e.reply(formatPlatformCardText(data))
      return true
    } catch (err) {
      logError(`[${p.id}] 平台状态卡失败: ${err.message}`)
      await e.reply(`${p.label} 状态查询失败：${err.message}`)
      return true
    }
  }

  /** 2.0：`#qqm平台` —— 列出当前可用的音源平台（未解锁时不响应） */
  async platformList(e) {
    const cfg = this.cfg()
    if (!isV2Unlocked(cfg)) return false
    const list = enabledPlatforms(cfg)
    if (!list.length) {
      await e.reply('当前没有可用的外部音源平台（可在锅巴 → 音源平台里打开）')
      return true
    }
    const cur = await currentSourceOf(e, cfg)
    await e.reply(
      [
        `可用音源平台（${list.length} 家）`,
        // 给**最短写法**：用户抄命令时少打两个"点歌"（那是可省的）
        // 「可扫码」是注册表里的事实（platforms.js 的 qrLogin），帮助/清单/登录命令共用一份
        ...list.map(
          (p) =>
            `#qqm${platformShort(p.id)} 关键词　${p.label}（免登录 ${p.quality}${platformCanQrLogin(p.id) ? ' · 可扫码登录' : ''}）`
        ),
        '',
        '不想每次都带平台名：#qqm源 网易　设一次，之后 #qqm点歌 就默认走它（#qqm源 默认 切回 QQ）',
        cur
          ? `${cur.own ? '你自己的' : '本群'}当前音源：${cur.p.label}（#qqm点歌 走它）`
          : qqSourceEnabled(cfg)
            ? '当前音源：QQ 曲库（#qqm点歌 用 QQ，并把开着的那几家免费曲补进列表尾部）'
            : '当前音源未设置，且已关闭 QQ 音源 —— 请先 #qqm源 <平台>',
      ].join('\n')
    )
    return true
  }

  /**
   * 2.0：`#qqm源` 查看 / `#qqm源 网易` 切换当前音源
   *
   * 存在的理由：平台名 + "点歌" 每次都打太啰嗦（`#qqmApple Music点歌` 长达 13 个字符）。
   * 设一次就够 —— 之后 `#qqm点歌 关键词` 直接走它，想切回 QQ 用 `#qqm源 默认`。
   *
   * **作用域按身份分**（见 ownPrefScopeOf 的注释）：
   *   · 主人设的是全群默认；成员设的只对自己生效 —— 谁都别想改别人
   *
   * 未解锁时**不响应**（这条命令在 1.9 里不存在）。
   */
  async sourceCmd(e) {
    const cfg = this.cfg()
    if (!isV2Unlocked(cfg)) return false
    const scope = ownPrefScopeOf(e)
    if (!scope) return false
    const isMaster = e?.isMaster === true
    const scopeWord = String(e?.group_id || '') && !isMaster ? '你自己的' : '本群'

    const arg = String(String(e.msg || '').match(RE_SOURCE)?.groups?.arg || '').trim()
    const cur = await currentSourceOf(e, cfg)

    // 不带参数 = 只看当前
    if (!arg) {
      const list = enabledPlatforms(cfg)
      await e.reply(
        [
          `当前音源：${cur ? `${cur.p.label}（${cur.own ? '你自己设的' : '主人给全群设的'}）` : qqSourceEnabled(cfg) ? 'QQ 曲库' : '未设置（QQ 音源已关）'}`,
          list.length
            ? `可切换：${list.map((p) => `#qqm源 ${platformShort(p.id)}`).join('　')}`
            : '（还没有可用平台：锅巴 → 「？？？」打开后选几家）',
          isMaster ? '你设的是**全群默认**；成员自己设的只影响他自己' : '你设的只影响你自己（不影响群里其他人）',
          '切回 QQ：#qqm源 默认',
        ].join('\n')
      )
      return true
    }

    // 切回 QQ
    if (/^(qq|qq音乐|默认|恢复|重置|none)$/i.test(arg)) {
      await clearPref(scope, 'source')
      const back = await currentSourceOf(e, cfg)
      await e.reply(
        back
          ? `已清掉${scopeWord}音源设置；当前回落到${back.own ? '你自己' : '全群默认'}的 ${back.p.label}`
          : `已切回 QQ 曲库：#qqm点歌 现在是 QQ 的曲库（其它平台仍可 #qqm源 <平台> 切回来）`
      )
      return true
    }

    const p = platformOf(arg)
    if (!p || p.own) {
      await e.reply(`认不出这个平台：「${arg}」\n可用写法见 #qqm平台`)
      return true
    }
    if (!platformEnabled(cfg, p.id)) {
      await e.reply(`${p.label} 音源已被关闭（锅巴 → 音源平台）`)
      return true
    }
    await setPref(scope, { source: p.id })
    await e.reply(
      `已把${scopeWord}音源切到 ${p.label}：#qqm点歌 关键词 直接用这家（免登录 ${p.quality}）\n` +
        (isMaster ? '（全群默认；成员自己设过的仍优先他自己的）\n' : '（只对你生效，不影响群里其他人）\n') +
        '想切回 QQ：#qqm源 默认'
    )
    return true
  }

  /**
   * 点歌列表的统一收尾：MV 徽标 → 写会话 → 图片卡 / 纯文本
   *
   * 抽出来是因为 2.0 的单平台点歌要走**同一条**收尾（列表卡、会话、回退文案
   * 三件事必须一致，否则「#qqm听1」在两个入口下的行为会不一样）。
   */
  async presentList(e, { keyword, list, cfg, title, sourceLabel = '' }) {
    const userKey = String(e.user_id || '')
    const scope = e.group_id || e.user_id

    // 批量查各曲是否带 MV（一次 /song/info），列表打 🎬 徽标 + 支持 #qqmMV 播放 序号
    // 补充曲（ne_/kw_/bi_ 前缀）是别家的 id，QQ 的详情接口查不到，别浪费槽位
    try {
      const mids = list
        .filter((s) => !s.external)
        .map((s) => s.songmid)
        .filter(Boolean)
      if (mids.length) {
        const infos = await songInfoBatch(mids, { userKey })
        const mvMap = new Map(infos.map((n) => [n.songmid, n.mvVid]).filter(([, v]) => v))
        for (const s of list) {
          if (s.songmid && mvMap.has(s.songmid)) s.mvVid = mvMap.get(s.songmid)
        }
      }
    } catch {
      /* MV 徽标失败不影响点歌 */
    }

    await setSession(scope, { keyword, data: list, user_id: e.user_id })

    if (cfg.renderListCard !== false) {
      const { buildListCardData } = await import('../utils/card-data.js')
      const { renderListCard } = await import('../utils/render.js')
      const ok = await replyCardOrText(e, {
        render: renderListCard,
        data: buildListCardData(keyword, list, { title, sourceLabel }),
        formatText: () => formatListText(list, { title: title || 'QQ音乐点歌结果' }),
        tag: '列表卡片',
      })
      if (ok) return true
    }

    await e.reply(formatListText(list, { title: title || 'QQ音乐点歌结果' }))
    return true
  }

  async chooseSong(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false

    const m = String(e.msg || '').trim().match(RE_LISTEN)
    const n = Number(m?.[1] || m?.[2] || 0)
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')
    // 千人群里多人同时点歌：先取自己的列表，自己没点过才退回群里最近一份
    const { session, fallback } = await pickSession(scope, userKey)
    if (!session?.data?.length || session.type === 'mvList') {
      // 无本插件会话时不抢其它插件的 #听 / #qqm听；mvList 是 MV 列表，音频播放流程不适用
      return false
    }
    // 榜单分类 / 推荐歌单列表的 data 不是歌曲，直接播放会报无意义错误，给出正确引导
    if (session.type === 'topCategory') {
      await e.reply('当前是榜单分类列表，请先 #qqm排行 榜单名 列出歌曲，再 #qqm听序号')
      return true
    }
    if (session.type === 'recommend') {
      await e.reply('当前是推荐歌单列表，请先 #qqm推荐听序号 查看歌单歌曲，再 #qqm听序号')
      return true
    }
    if (n < 1 || n > session.data.length) {
      await e.reply(`请选择 1-${session.data.length}`)
      return true
    }

    const song = session.data[n - 1]

    // 先获取播放链接信息（songUrlBest 已带出歌曲 MV vid，无需额外请求）
    const play = await resolvePlay(song, cfg, userKey)
    const mvVid = play.mvVid || ''

    // 记住本曲 MV，支持「#qqmMV 播放/下载」（不带参数）直接操作该曲 MV
    if (mvVid && session?.data?.length) {
      await setSession(scope, { ...session, lastMvVid: mvVid, user_id: e.user_id })
    }

    // 渲染详情卡片（与解析功能统一风格）
    try {
      const { buildDetailCardData } = await import('../utils/card-data.js')
      const { renderDetailCard } = await import('../utils/render.js')
      const cardData = buildDetailCardData(song, {
        qualityLabel: play.qualityLabel || play.quality || '',
        payplay: Boolean(song.payplay),
        source: song.source
          ? `${SOURCE_LABEL[song.source] || song.source} ${song.quality || '128k'}`
          : fallback
            ? '群内最近歌单'
            : '点歌',
        hasUrl: Boolean(play.url),
        mvVid,
        degradeNote: play.degradeNote || '',
        error: play.error || '',
        cfg,
      })
      const img = await renderDetailCard(e, cardData)
      if (img) {
        await e.reply(img)
      } else {
        // 纯文本兜底
        const { formatDetailText } = await import('../utils/card-data.js')
        if (play.url) {
          await e.reply(`下载中：${song.songName}（${play.qualityLabel || play.quality}）…`)
        } else {
          await e.reply(
            [
              `♪ ${song.songName} - ${song.singerName}${song.payplay ? ' [会员/付费]' : ''}`,
              song.albumName ? `专辑：${song.albumName}` : '',
              play.error ? `错误：${play.error}` : '获取播放链接失败，请 #qqm登录',
            ].filter(Boolean).join('\n')
          )
        }
      }
    } catch {
      const { formatDetailText } = await import('../utils/card-data.js')
      await e.reply(formatDetailText(song, { qualityLabel: play.qualityLabel, hasUrl: Boolean(play.url) }))
    }

    if (!play.url) {
      if (cfg.sendNativeCard && song.songid) {
        await sendNativeMusicCard(e, 'qq', song.songid)
      }
      return true
    }

    await deliverSong(e, song, play)
    return true
  }

  async playDirect(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    const { plat: platName, keyword } = parseSongCmd(String(e.msg || ''))
    if (!keyword) {
      await e.reply('用法：#qqm播放 关键词')
      return true
    }
    // 带平台前缀（#qqm网易云播放 晴天）：只在那家搜第一条再播；未解锁时静默放行
    if (platName) {
      if (!isV2Unlocked(cfg)) return false
      return await this.playDirectOnPlatform(e, platName, keyword)
    }
    const userKey = String(e.user_id || '')
    try {
      /**
       * 2.0：**「当前音源」对播放同样生效**（2026-09-23 修）
       *
       * 之前只有 `#qqm点歌` 认它：`#qqm源 网易` 之后点歌走网易云、播放却还搜 QQ，
       * 用户看到的是"设了没用"（命中 QQ 付费曲时还会回"请 #qqm登录"）。
       * 同一个偏好，两个入口必须一个口径。
       */
      const cur = await currentSourceOf(e, cfg)
      if (cur) return await this.playDirectOnPlatform(e, cur.p.id, keyword, { viaSource: true })

      const list = await searchSongs(keyword, { pageSize: 1, userKey })
      if (!list.length) {
        await e.reply('没有搜到相关歌曲')
        return true
      }
      return await this.playOne(e, { song: list[0], cfg, userKey })
    } catch (err) {
      await e.reply(`播放失败：${err.message}`)
    }
    return true
  }

  /**
   * 2.0：`#qqm<平台>播放 关键词` —— 只在那家搜第一条再播
   *
   * 与 QQ 的 `#qqm播放` 走**同一条播放链**（playOne），差别只在"去哪搜"和来源标注，
   * 这样两个入口的播放行为、降级提示、失败文案不会各走各的。
   */
  async playDirectOnPlatform(e, platName, keyword, { viaSource = false } = {}) {
    const cfg = this.cfg()
    const p = platformOf(platName)
    if (!p) return false
    if (!platformEnabled(cfg, p.id)) {
      await e.reply(`${p.label} 音源已被关闭（锅巴 → 音源平台）`)
      return true
    }
    const userKey = String(e.user_id || '')
    try {
      if (viaSource) await e.reply(`正在搜索（当前音源 ${p.label}）：${keyword}`)
      const res = await searchPlatformSongs(keyword, p.id, { pageSize: 1, userKey })
      if (!res.list.length) {
        await e.reply(
          res.error
            ? `${p.label} 搜索失败：${res.error}`
            : res.unavailable
              ? `${p.label} 音源暂时不可用：${res.unavailable}`
              : `${p.label} 没有搜到「${keyword}」`
        )
        return true
      }
      return await this.playOne(e, { song: res.list[0], cfg, userKey })
    } catch (err) {
      logError(`[${p.id}] 播放失败: ${err.message}`)
      await e.reply(`${p.label} 播放失败：${err.message}`)
      return true
    }
  }

  /**
   * 「搜到一首 → 取链 → 详情卡 → 发送」这条链（`#qqm播放` 与各平台播放共用）
   *
   * 抽出来的原因很实在：以前这段只在 playDirect 里，2.0 再加一个平台播放入口
   * 就得复制一遍 —— 那种复制一改就分叉（一处改了降级提示、另一处还是旧的）。
   */
  async playOne(e, { song, cfg, userKey }) {
    const play = await resolvePlay(song, cfg, userKey)

    // 记住本曲 MV，支持「#qqmMV 播放/下载」（不带参数）直接操作
    // 与已有会话合并写入，避免把刚点出来的列表顶掉
    if (play.mvVid) {
      const scope = e.group_id || e.user_id
      const own = await getUserSession(scope, userKey)
      await setSession(scope, { ...(own || {}), lastMvVid: play.mvVid, user_id: e.user_id })
    }

    // 渲染详情卡片（与解析功能统一风格）
    try {
      const { buildDetailCardData } = await import('../utils/card-data.js')
      const { renderDetailCard } = await import('../utils/render.js')
      const cardData = buildDetailCardData(song, {
        qualityLabel: play.qualityLabel || play.quality || '',
        payplay: Boolean(song.payplay),
        source: song.source
          ? `${SOURCE_LABEL[song.source] || song.source} ${song.quality || '128k'}`
          : '播放',
        hasUrl: Boolean(play.url),
        mvVid: play.mvVid || '',
        degradeNote: play.degradeNote || '',
        error: play.error || '',
        cfg,
      })
      const img = await renderDetailCard(e, cardData)
      if (img) {
        await e.reply(img)
      } else {
        const { formatDetailText } = await import('../utils/card-data.js')
        if (play.url) {
          await e.reply(`下载中：${song.songName}（${play.qualityLabel || play.quality}）…`)
        } else {
          await e.reply(
            [
              `♪ ${song.songName} - ${song.singerName}${song.payplay ? ' [会员/付费]' : ''}`,
              song.albumName ? `专辑：${song.albumName}` : '',
              play.error ? `错误：${play.error}` : '获取播放链接失败，请 #qqm登录',
            ].filter(Boolean).join('\n')
          )
        }
      }
    } catch {
      const { formatDetailText } = await import('../utils/card-data.js')
      await e.reply(formatDetailText(song, { qualityLabel: play.qualityLabel, hasUrl: Boolean(play.url) }))
    }

    if (!play.url) {
      // 原生音乐卡只对 QQ 曲目有意义（外源没有 QQ 的 songid）
      if (cfg.sendNativeCard && song.songid && !song.source) {
        await sendNativeMusicCard(e, 'qq', song.songid)
      }
      return true
    }
    await deliverSong(e, song, play)
    return true
  }

  async getLyric(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const { plat: platName, key } = parseLyricCmd(String(e.msg || ''))
    if (!key) {
      await e.reply('用法：#qqm歌词 关键词 / 歌曲链接 / 序号')
      return true
    }
    /**
     * 2.0：歌词也吃**平台前缀与当前音源**（2026-09-23 补）
     *
     * 以前 `#qqm源 网易` 之后 `#qqm歌词 晴天` 仍按 QQ 搜 —— 命中的若是 VIP 曲
     * 又没登录，就"没词"。数字序号（`#qqm歌词1`）不受影响：那条走会话里的歌。
     */
    const lyricPlat =
      platName && isV2Unlocked(cfg)
        ? platformOf(platName)
        : !/^\d{1,2}$/.test(key)
          ? (await currentSourceOf(e, cfg))?.p
          : null
    if (platName && !isV2Unlocked(cfg)) return false // 未解锁：平台写法静默放行
    if (lyricPlat && !platformEnabled(cfg, lyricPlat.id)) {
      await e.reply(`${lyricPlat.label} 音源已被关闭（锅巴 → 音源平台）`)
      return true
    }

    let songmid = key
    let songMeta = { songName: key, singerName: '', cover: '', albumName: '' }

    // 带平台（或当前音源）：先在那家搜第一条，再拿它的 songmid 取词
    if (lyricPlat) {
      try {
        const res = await searchPlatformSongs(key, lyricPlat.id, { pageSize: 1, userKey: String(e.user_id || '') })
        if (!res.list.length) {
          await e.reply(
            res.error
              ? `${lyricPlat.label} 搜索失败：${res.error}`
              : `${lyricPlat.label} 没有搜到「${key}」（歌词按歌取，得先搜到这首歌）`
          )
          return true
        }
        const song = res.list[0]
        songmid = song.songmid
        songMeta = {
          songName: song.songName || key,
          singerName: song.singerName || '',
          cover: song.cover || '',
          albumName: song.albumName || '',
        }
      } catch (err) {
        logError(`[${lyricPlat.id}] 歌词搜索失败: ${err.message}`)
        await e.reply(`${lyricPlat.label} 取歌词失败：${err.message}`)
        return true
      }
    }

    // #qqm歌词1~99：取点歌/解析列表第 N 首（与 #qqm听N 同源），避免把序号当关键词搜索
    if (/^\d{1,2}$/.test(key)) {
      const scope = e.group_id || e.user_id
      // 与 #qqm听N 同源：先取自己的列表，没有再退回群里最近一份
      const { session } = await pickSession(scope, String(e.user_id || ''))
      const n = Number(key)
      // 非歌曲列表会话：数字序号无意义，给出正确引导（关键词查词不受影响）
      if (session?.type === 'topCategory' || session?.type === 'recommend') {
        await e.reply(
          session.type === 'topCategory'
            ? '当前是榜单分类列表，请先 #qqm排行 榜单名 列出歌曲'
            : '当前是推荐歌单列表，请先 #qqm推荐听序号 列出歌曲'
        )
        return true
      }
      if (session?.type === 'mvList') {
        await e.reply('当前列表是 MV，请用 #qqmMV 播放 序号；查歌词请先 #qqm点歌')
        return true
      }
      if (session?.data?.length && n >= 1 && n <= session.data.length) {
        const song = session.data[n - 1]
        if (!song.songmid) {
          await e.reply('该歌曲缺少 songmid，无法查询歌词，请用 #qqm歌词 关键词')
          return true
        }
        songmid = song.songmid
        songMeta = {
          songName: song.songName || key,
          singerName: song.singerName || '',
          cover: song.cover || '',
          albumName: song.albumName || '',
        }
      } else {
        await e.reply(
          session?.data?.length
            ? `请选择 1-${session.data.length}`
            : '暂无点歌列表，请先 #qqm点歌，或用 #qqm歌词 关键词'
        )
        return true
      }
    } else if (!/^[0-9A-Za-z]{10,}$/.test(key) || /[一-龥]/.test(key)) {
      // 关键词搜索分支也需捕获 API 异常，避免静默无响应
      try {
        const list = await searchSongs(key, { pageSize: 1, userKey: String(e.user_id || '') })
        if (!list.length) {
          await e.reply('未找到歌曲')
          return true
        }
        songmid = list[0].songmid
        songMeta = {
          songName: list[0].songName || key,
          singerName: list[0].singerName || '',
          cover: list[0].cover || '',
          albumName: list[0].albumName || '',
        }
      } catch (err) {
        await e.reply(`歌词失败：${err.message}`)
        return true
      }
    }
    try {
      const data = await lyric(songmid, String(e.user_id || ''))
      const text = data?.lyric || ''
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\[[^\]]*]/, '').trim())
        .filter(Boolean)
        .slice(0, 40)
      if (!lines.length) {
        await e.reply('暂无歌词')
        return true
      }

      const { buildLyricCardData, formatLyricText } = await import('../utils/card-data.js')
      const { renderLyricCard } = await import('../utils/render.js')
      const card = buildLyricCardData({ ...songMeta, songmid, lines })
      await replyCardOrText(e, {
        render: renderLyricCard,
        data: card,
        formatText: formatLyricText,
        tag: '歌词卡片',
        onFallback: async () => {
          await e.reply(
            [
              songMeta.songName
                ? `歌词：${songMeta.songName} - ${songMeta.singerName || '未知'}`
                : '',
              lines.join('\n'),
            ]
              .filter(Boolean)
              .join('\n')
          )
        },
      })
    } catch (err) {
      await e.reply(`歌词失败：${err.message}`)
    }
    return true
  }

  async hotSearch(e) {
    try {
      const list = await hotKeys(String(e.user_id || ''))
      const tops = (Array.isArray(list) ? list : []).slice(0, 15)
      if (!tops.length) {
        await e.reply('暂无热搜')
        return true
      }

      const { buildHotCardData, formatHotText } = await import('../utils/card-data.js')
      const { renderHotCard } = await import('../utils/render.js')
      await replyCardOrText(e, {
        render: renderHotCard,
        data: buildHotCardData(tops),
        formatText: () => formatHotText(tops),
        tag: '热搜卡片',
        onFallback: async () => {
          const text = tops
            .map(
              (item, i) =>
                `${i + 1}. ${item.k || item.keyword || item.query || JSON.stringify(item)}`
            )
            .join('\n')
          await e.reply(`QQ音乐热搜\n${text}`)
        },
      })
    } catch (err) {
      await e.reply(`热搜失败：${err.message}`)
    }
    return true
  }

  async help(e) {
    const cfg = this.cfg()

    // 2.0：解锁后换成新版帮助 UI（多平台 + 分组更紧凑的一屏）
    // 未解锁时**完全不进这个分支** —— 老帮助卡与老文本一个字都不变
    if (isV2Unlocked(cfg)) {
      try {
        const curSrc = await currentSourceOf(e, cfg)
        const data = buildGuideCardData(e, {
          currentSource: curSrc
            ? `当前音源：${curSrc.p.label}`
            : qqSourceEnabled(cfg)
              ? '当前音源：QQ 曲库'
              : '仅其它平台',
          // `#qqm帮助 全部` = 完整清单；默认版每段最多 8 条（卡片太长 QQ 里会被压得看不清）
          full: RE_HELP_FULL.test(String(e.msg || '').trim()),
        })
        const img = await renderGuideCard(e, data)
        if (img) {
          await e.reply(img)
          return true
        }
      } catch (err) {
        logWarn(`2.0 帮助图渲染失败: ${err.message}`)
      }
      await e.reply(formatGuideText(e))
      return true
    }

    try {
      const data = buildHelpCardData(e)
      const img = await renderHelpCard(e, data)
      if (img) {
        await e.reply(img)
        return true
      }
    } catch (err) {
      logWarn(`帮助图渲染失败: ${err.message}`)
    }

    // 降级纯文本（与卡片一致：主人相关条目仅主人可见）
    await e.reply(
      [
        '【QQ音乐插件帮助】',
        '— 点歌（均需 #qqm 前缀）—',
        '#qqm点歌 七里香  →  #qqm听1（会话内也可 #听1）',
        '#qqm播放 晴天',
        '#qqm歌词 关键词 / 序号  /  #qqm热搜',
        '— 状态 —',
        e.isMaster
          ? '#qqm登录  /  #qqm登录微信  /  #qqm状态  /  #qms  /  #qqm登出'
          : '#qqm状态  /  #qms',
        ...(e.isMaster
          ? ['— 管理（主人）—', '#qqm设置  /  #qqm 音质 flac  /  #qqm 测试']
          : []),
        '— 解析 —',
        '分享 QQ 音乐卡片或 y.qq.com 链接自动解析',
        `API: ${cfg.apiBase ? '已配置' : '未配置'}`,
      ].join('\n')
    )
    return true
  }
}
