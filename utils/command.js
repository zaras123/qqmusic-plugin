/**
 * 点歌/播放命令的解析（纯函数，**必须放在 util 而不是 apps**）
 *
 * ⚠️ 为什么不能放在 `apps/song.js` 里导出：插件加载器（index.js）是这么找插件类的
 *    —— `Object.keys(mod).find(k => typeof mod[k] === 'function')`，也就是**第一个函数导出**
 *    。一旦 apps 里多导出一个辅助函数，它就会被当成"插件类"去 new，整个点歌模块直接失效
 *    （实测：规则数从 8 掉到 0，命令全部"无人接管"）。辅助函数一律放 utils/。
 *
 * 支持的全部写法（动词可省**只对带平台前缀开放**）：
 *   #qqm点歌 七里香            QQ 曲库（老行为，一个字没变）
 *   #qqm播放 七里香            QQ 曲库，搜第一条直接播
 *   #qqm网易 七里香            平台 + 关键词（最短写法）
 *   #qqm网易云点歌 七里香       平台 + 动词 + 关键词
 *   #qqmB站播放 七里香         在 B站搜第一条直接播
 *
 * 两个关键约束：
 *   1. 平台别名必须**长优先**（platformAliasPattern 已排序），否则「网易云音乐」
 *      会被切成「网易」+ 关键词"云音乐…"。
 *   2. 省动词那条分支要排除以别的动词开头的关键词（点歌/播放/歌词/听/热搜/平台/源），
 *      否则 `#qqm网易歌词 晴天` 会被当成搜"歌词 晴天"。QQ 那条（动词必写）不加此限制
 *      —— `#qqm点歌 播放列表` 是合法搜索词。
 */
import { platformAliasPattern } from './platforms.js'

const PLAT_PREFIX = platformAliasPattern()

/**
 * 点歌 + 播放**共用**一条正则（动词是捕获组，平台前缀可选）
 *
 * 结构（顺序很关键，别重排）：
 *   ① 平台 + 动词 [+ 关键词]   —— 动词紧跟在平台名后面时优先按"动词"解释，
 *      所以 `#qqm网易云点歌`（忘写关键词）不会被切成"平台=网易、关键词=云点歌"
 *   ② 平台 + **空格** + 关键词  —— 省动词写法（必须有空格，否则会跟上面打架）
 *   ③ 只有平台名（`#qqm网易`）—— 匹配上是为了回一句用法提示，而不是沉默
 *   ④ 动词 [+ 关键词]（`#qqm点歌 七里香`）—— 老写法，一个字没变
 */
export const RE_SONG_CMD = new RegExp(
  '^#?(?:qq|QQ)m\\s*(?:' +
    `(?<platA>${PLAT_PREFIX})\\s*(?:` +
    '(?<verbA>点歌|播放)(?:\\s+(?<kwA>.+))?' +
    `|\\s+(?<kwBare>(?!(?:点歌|播放|歌词|听|热搜|平台|源))[\\s\\S]+)` +
    '|$)' +
    '|(?<verbB>点歌|播放)(?:\\s+(?<kwB>.+))?' +
    ')$',
  'i'
)

/** 无前缀「#点歌 关键词」（锅巴开关打开时才接管） */
export const RE_PICK_PLAIN = /^#?点歌\s*(?<kw>.+)$/

/**
 * 歌词命令：`#qqm歌词 关键词` / `#qqm歌词1` / `#qqm网易歌词 关键词`
 *
 * 平台前缀与点歌同一套（长别名优先）；`key` 可以是"关键词"或"列表序号"。
 * 注意 key 必填 —— `#qqm网易歌词` 这种半截命令不该命中任何规则。
 */
export const RE_LYRIC_CMD = new RegExp(
  `^#?(?:qq|QQ)m\\s*(?:(?<plat>${PLAT_PREFIX})\\s*)?歌词\\s*(?<key>.+)$`,
  'i'
)

/** @returns {{plat:string, key:string}} */
export function parseLyricCmd(text = '') {
  const m = String(text || '').trim().match(RE_LYRIC_CMD)
  const g = m?.groups || {}
  return { plat: g.plat || '', key: String(g.key || '').trim() }
}

/**
 * @returns {{plat:string, verb:string, keyword:string}} plat 空串 = QQ 曲库；verb 空串 = 省动词写法
 */
export function parseSongCmd(text = '') {
  const m = String(text || '').trim().match(RE_SONG_CMD)
  if (!m) return { plat: '', verb: '', keyword: '' }
  const g = m.groups || {}
  return {
    plat: g.platA || '',
    verb: g.verbA || g.verbB || '',
    keyword: (g.kwA || g.kwBare || g.kwB || '').trim(),
  }
}

/**
 * 平台状态卡：`#qqm<平台>状态`（含 QQ 本体 —— includeOwn:true，别名表默认排除 qq）
 * 规则与 handler 共用这一条正则 + parsePlatformStatusCmd：两处各写一份的话，
 * 一处用了非捕获组、另一处读 m[1]，症状就是"永远静默 return false"（实测踩过）。
 */
export const RE_PLATFORM_STATUS = new RegExp('^#?(?:qq|QQ)m\\s*(' + platformAliasPattern({ includeOwn: true }) + ')\\s*(?:状态|登录状态|音源状态)$', 'i')

/** @returns {{plat:string}} 认不出返回 {plat:''} */
export function parsePlatformStatusCmd(text = '') {
  const m = String(text || '').trim().match(RE_PLATFORM_STATUS)
  return { plat: m?.[1] || '' }
}

export default { RE_SONG_CMD, RE_PICK_PLAIN, RE_LYRIC_CMD, parseSongCmd, parseLyricCmd }
