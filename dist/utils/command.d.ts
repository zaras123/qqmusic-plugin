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
export declare const RE_SONG_CMD: RegExp;
/** 无前缀「#点歌 关键词」（Karin WebUI 开关打开时才接管） */
export declare const RE_PICK_PLAIN: RegExp;
/**
 * 歌词命令：`#qqm歌词 关键词` / `#qqm歌词1` / `#qqm网易歌词 关键词`
 *
 * 平台前缀与点歌同一套（长别名优先）；`key` 可以是"关键词"或"列表序号"。
 * 注意 key 必填 —— `#qqm网易歌词` 这种半截命令不该命中任何规则。
 */
export declare const RE_LYRIC_CMD: RegExp;
/** @returns {{plat:string, key:string}} */
export declare function parseLyricCmd(text?: string): {
    plat: string;
    key: string;
};
/**
 * @returns {{plat:string, verb:string, keyword:string}} plat 空串 = QQ 曲库；verb 空串 = 省动词写法
 */
export declare function parseSongCmd(text?: string): {
    plat: string;
    verb: string;
    keyword: string;
};
/**
 * 平台状态卡：`#qqm<平台>状态`（含 QQ 本体 —— includeOwn:true，别名表默认排除 qq）
 * 规则与 handler 共用这一条正则 + parsePlatformStatusCmd：两处各写一份的话，
 * 一处用了非捕获组、另一处读 m[1]，症状就是"永远静默 return false"（实测踩过）。
 */
export declare const RE_PLATFORM_STATUS: RegExp;
/**
 * 平台凭据（cookie）粘贴：`#qqm网易ck MUSIC_U=xxx; __csrf=yyy`
 *
 * 为什么要有这条命令：**不是每家都能扫码**（酷我 / Apple 只能粘贴），而汽水扫码会被
 * 上游风控掐掉。以前遇到这种情况只能让用户自己去 `curl POST /<平台>/cookies` —— 群里
 * 没人会干这个，等于"这家的账号态配不了"。现在给一个命令入口，形如：
 *   #qqm网易ck <整串 cookie>      #qqm酷狗ck <整串>      #qqm汽水ck <整串>
 *   #qqm酷我ck <整串>            #qqmappleck <Netscape cookies 全文>
 *
 * ⚠️ 用 `[\s\S]+` 而不是 `.+`：Apple 那种是**多行文件全文**，`.` 不吃换行。
 * ⚠️ 平台名与 `ck` 之间**必须紧挨着**（`#qqm网易ck …`，中间不能有空格）。这条不是风格问题：
 *    RE_SONG_CMD 的省动词分支是"平台 + **空白** + 关键词"，只要这里留了空格，
 *    `#qqm网易 ck xxx` 就会**同时**命中点歌规则（搜"ck xxx"）与这条规则 → 两个 handler 都回话。
 *    反过来若把 `ck` 加进点歌规则的排除词表，`#qqm网易 清空` 之类**正常搜索词**会被误排除
 *    （排除表是按前缀匹配的）—— 所以约束压在这边，写法固定成"紧挨着"。
 *    载荷可留空（`#qqm网易ck`）：那时 handler 会回一条用法提示，而不是沉默。
 */
export declare const RE_PLATFORM_CK: RegExp;
/** 清掉自己那份凭据：`#qqm网易清ck` / `#qqm酷狗清除cookie` 之类的写法都收（同样紧挨着，理由见上） */
export declare const RE_PLATFORM_CK_CLEAR: RegExp;
/** @returns {{plat:string, cookie:string}} 认不出返回全空串；`#qqm网易ck`（没带载荷）时 cookie 为空串 */
export declare function parsePlatformCkCmd(text?: string): {
    plat: string;
    cookie: string;
};
/** @returns {{plat:string}} 认不出返回 {plat:''} */
export declare function parsePlatformCkClearCmd(text?: string): {
    plat: string;
};
/** @returns {{plat:string}} 认不出返回 {plat:''} */
export declare function parsePlatformStatusCmd(text?: string): {
    plat: string;
};
/**
 * 听歌统计：`#qqm听歌`（我的统计）/ `#qqm听歌榜 本周`（本群排行）
 *
 * ⚠️ 规则表与 handler 必须**共用这两条**（apps/stats.js 的 reg 直接写 `.source`）——
 *    与上面平台状态同一条教训：两处各写一份，改了一处另一处还按老形状判，
 *    症状是"命令能命中、参数却永远是默认值"。
 * ⚠️ 形状上有意与「#qqm听N」（apps/song.js 里的 RE_LISTEN）错开：那条要求"听"字后面
 *    **直接跟数字**，这两条跟的是"歌 / 榜 / 排行"，两边不会互吃。
 */
export declare const RE_MY_STATS: RegExp;
export declare const RE_STATS_BOARD: RegExp;
/**
 * 勋章进度（只读）：`#qqm勋章` / `#qqm勋章任务` / `#qqm成就进度`
 *
 * 查的是**平台侧**的听歌时长与勋章任务进度（走 API /cgi 透传，需登录），
 * 与上面两条「本地记账」是两回事，别混。
 *
 * ⚠️ 形状上有意与点歌规则错开：`勋章` / `成就` 都不是平台别名、也不是点歌动词，
 *    所以既不会命中「平台 + 关键词」那条省动词分支，也不会命中 `#qqm点歌`。
 */
export declare const RE_MEDAL: RegExp;
declare const _default: {
    RE_SONG_CMD: RegExp;
    RE_PICK_PLAIN: RegExp;
    RE_LYRIC_CMD: RegExp;
    RE_PLATFORM_STATUS: RegExp;
    RE_MY_STATS: RegExp;
    RE_STATS_BOARD: RegExp;
    RE_MEDAL: RegExp;
    RE_PLATFORM_CK: RegExp;
    RE_PLATFORM_CK_CLEAR: RegExp;
    parseSongCmd: typeof parseSongCmd;
    parseLyricCmd: typeof parseLyricCmd;
    parsePlatformStatusCmd: typeof parsePlatformStatusCmd;
    parsePlatformCkCmd: typeof parsePlatformCkCmd;
    parsePlatformCkClearCmd: typeof parsePlatformCkClearCmd;
};
export default _default;
