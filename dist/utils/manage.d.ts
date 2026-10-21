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
export declare const MANAGE_CONFIRM_RE: RegExp;
/**
 * 通用：命令尾巴里挑出确认词，返回去掉确认词后的剩余参数。
 * 只有确认词在**结尾**才算数（`确认` 出现在中间不认，避免标题里带个"确认"就误放行）。
 * @returns {{ok:boolean, rest:string}}
 */
export declare function splitConfirm(text?: string): {
    ok: boolean;
    rest: string;
};
/**
 * 写接口成功回包有时仍带着上游业务码。
 *
 * API 的 writeRes/finish 已检查最外层 r.code，但业务错误也可能落在返回的
 * data.code 里。插件如果只信外层 result=100，就会把这类失败误报成“已执行”。
 * 这里只认 code 字段，避免把普通响应里的 message 误判成失败。
 */
export declare function upstreamWriteError(data: any): string;
/** 歌曲规格：`123:1` / `123`（默认 type=1）/ 多首用逗号或空格 */
export declare function parseSongSpecs(raw?: string): any[];
/** 纯数字 ID 列表：`123,456` */
export declare function parseIdList(raw?: string): any[];
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
export declare function parsePlaylistCmd(text?: string): {
    action: string;
    name: string;
    dirId: number;
    ids: any[];
    songs: any[];
    ok: boolean;
    usage: string;
};
/** type：1=歌曲 2=歌手 3=风格；中文别名也收 */
export declare function parseDislikeType(raw?: string): 0 | 1 | 2 | 3;
/**
 * 不喜欢管理：
 *   不喜欢 <歌曲|歌手|风格> <id...> 确认
 *   取消不喜欢 <歌曲|歌手|风格> <id...> 确认
 *   清空不喜欢 确认
 */
export declare function parseDislikeCmd(text?: string): {
    action: string;
    type: number;
    ids: any[];
    ok: boolean;
    usage: string;
};
/**
 * 评论：
 *   发评论 <歌曲|专辑|歌单|排行|MV> <bizId> <内容> 确认
 *   删评论 <cmId> 确认
 */
export declare function parseCommentCmd(text?: string): {
    action: string;
    biztype: number;
    bizId: string;
    content: string;
    cmId: string;
    ok: boolean;
    usage: string;
} | {
    action: string;
    biztype: number;
    bizId: string;
    content: string;
    ok: boolean;
    usage: string;
};
/**
 *   音响力点赞 <uin> 确认
 *   音响力取消点赞 <uin> 确认
 *   音响力隐私 <0|1> 确认      （公开 / 隐藏，按 API status 原样传）
 */
export declare function parseSoundPowerCmd(text?: string): {
    action: string;
    uin: string;
    status: any;
    ok: boolean;
    usage: string;
};
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
export declare function parsePrivateMsgCmd(text?: string): {
    action: string;
    args: {};
    ok: boolean;
    usage: string;
};
/**
 * 一句话用法提示：`#qqm账号操作` 时不带子命令，回这条。
 * handler 用它做总入口提示，避免用户猜命令。
 */
export declare const MANAGE_USAGE: string;
declare const _default: {
    MANAGE_CONFIRM_RE: RegExp;
    MANAGE_USAGE: string;
    splitConfirm: typeof splitConfirm;
    upstreamWriteError: typeof upstreamWriteError;
    parseSongSpecs: typeof parseSongSpecs;
    parseIdList: typeof parseIdList;
    parsePlaylistCmd: typeof parsePlaylistCmd;
    parseDislikeType: typeof parseDislikeType;
    parseDislikeCmd: typeof parseDislikeCmd;
    parseCommentCmd: typeof parseCommentCmd;
    parseSoundPowerCmd: typeof parseSoundPowerCmd;
    parsePrivateMsgCmd: typeof parsePrivateMsgCmd;
};
export default _default;
