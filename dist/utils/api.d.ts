/**
 * 归一化 apiBase：兼容用户手改配置文件时的常见写法问题，
 * 不再因格式问题抛裸的 Invalid URL：
 *  - 漏写协议头：域名自动补 https://；localhost / IP 直连仍补 http://
 *  - 中文输入法的全角冒号（http：//）→ 转半角
 *  - 复制粘贴带入的首尾引号、空格、零宽字符 / BOM → 清除
 */
export declare function normalizeApiBase(raw: any): string;
/** 登录管理类接口：就算开了「一律走主人账号」也只看请求者本人，不能被主人账号顶掉 */
/**
 * 「按请求者本人取槽位」的接口 —— 开了「一律走主人账号」也**不换**账号
 *
 * 凭据是**一人一号**（API 按 userKey 存）。如果把这些请求也换成主人账号，就等于
 * "大家传的 cookie 都写进主人那一槽、互相覆盖" —— Apple 与四家平台的 ck 通道当场废掉。
 * （2026-09-24 修：`#qqmappleck` 传上去的凭据会落到主人槽位，根因就是它不在这个名单里。）
 *
 * ⚠️ 路径**从平台注册表算**，别手抄：Apple 的字段叫 cookies、清除走 DELETE，
 *    历史上"手抄漏掉这个例外"已经踩过一次（见 platforms.js 顶部注释）。
 */
export declare function isPerUserScopePath(pathname: any): boolean;
/**
 * 这个请求是不是「Apple 音源」的 —— 它**不参与**「一律走主人账号」
 *
 * 为什么 Apple 特殊（2026-09-24，需求："Apple 可以每人一个号一个 cookie"）：
 * Apple 的凭据是每人一份的 Netscape cookies（sidecar 按 userKey 存），而 sidecar 侧
 * 有**共享回落**（自己那份不在 → 用共享/default 那份）。所以按"发送者自己"走是安全的：
 * 有自己账号的人用自己的，没配的人自动回落到主人那份，两边都不坏。
 */
export declare function isAppleScopedRequest(pathname?: string, params?: {}): boolean;
/**
 * 播歌类请求实际生效的 userKey：
 * 开了「一律走主人账号」且配了主人账号 → 返回主人账号（主人的 ck）；否则原样返回请求者。
 * /song/file 直链（buildSongFileUrl）不经过 request()，调用方用它保证取链和下载用同一个账号。
 */
export declare function pickPlayUserKey(userKey?: string, params?: {}): string;
export declare function request(pathname: any, params?: {}, method?: string, userKey?: string, { timeout, asUser, maxRedirects }?: {
    asUser?: boolean;
    maxRedirects?: any;
    timeout?: number;
}): Promise<any>;
/**
 * 仅取登录态元信息
 */
export declare function pullLoginMeta(userKey?: string): Promise<{
    login: boolean;
    userKey: any;
    uin: string;
    nick: any;
    hasKey: boolean;
    hasRefresh: boolean;
    loginType: any;
    tmeLoginType: any;
    keyAgeSec: any;
    keyExpiresIn: number;
    refreshable: boolean;
    refreshChecked: boolean;
    refreshReason: any;
}>;
/**
 * 加密曲目的「服务端下载并解密」地址（主逻辑在 API，插件只负责搬运明文）。
 * 抓包显示客户端下载 URL 上只有 vkey、没有 ekey，故两个都带上让 API 逐个试。
 */
export declare function buildSongFileUrl({ url, filename, ekey, vkey, userKey, local, decrypt }?: {
    decrypt?: boolean;
    ekey?: string;
    filename?: string;
    local?: boolean;
    url?: string;
    userKey?: string;
    vkey?: string;
}): string;
/**
 * 登录续期状态的用户可见提示（导出以便单测）
 *
 * ⚠️ 不能只看「有没有 refresh 材料」：微信 PC 流程换到的会话**有 refresh_key 但续期实测被拒**
 * （所有形状都回 code=1000），而 App 扫码的会话能续期 —— 两者表面一样。
 * 所以以 API 登录时实测的结果 `refreshable` 为准；没实测过时才退回看材料。
 */
export declare function loginRenewHint(meta?: {}): any;
export declare function listAccounts(): Promise<any>;
/**
 * 各家平台的**登录状态**（一次拿全，给"平台状态卡"用）
 *
 * API 侧聚合了 QQ / 网易云 / 酷狗 / 汽水 / 酷我 / Apple / 匿名音源 ——
 * 一次请求就够了（原来是 6 次：`/login/status` + 4 个 `/x/status` + `/apple/status`）。
 * 返回值里**没有凭据内容**，只有"配没配、从哪来、能不能扫码"。
 */
export declare function platformsStatus(userKey?: string): Promise<any>;
export declare function searchSongs(keyword: any, { pageNo, pageSize, userKey, fill, fillLimit, fillSources, local }?: {
    fill?: boolean;
    fillLimit?: number;
    fillSources?: any;
    local?: boolean;
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
/**
 * **只搜某一个平台**（2.0：`#qqm网易云点歌` 这类指令用）
 *
 * 与 `searchSongs({fill:true})` 的区别：fill 是"QQ 为主 + 其它平台追加几条"，
 * 按平台筛完常常只剩 0~1 条；这里直接走 API 的 `?source=<平台>`，不进 QQ 搜索。
 *
 * API 侧会**先取链验证**再返回（"点了播不了"最伤体验），所以这里拿到的都是能播的候选。
 * 空结果时 API 会带 `unavailable`（"这家没配好" vs "这家真没有"），原样交给上层提示。
 *
 * @returns {Promise<{list:Array, source:string, label:string, unavailable:string, tried:string[], error:string}>}
 */
export declare function searchPlatformSongs(keyword: any, platform: any, { pageSize, userKey, local }?: {
    local?: boolean;
    pageSize?: number;
    userKey?: string;
}): Promise<{
    list: any[];
    source: any;
    label: string;
    unavailable: string;
    tried: any[];
    error: any;
} | {
    source: any;
    error: string;
    list: any;
    label: any;
    unavailable: string;
    tried: any;
}>;
/**
 * **一次搜多家外部平台**（2.0：QQ 关掉 / QQ 搜不出来时，用免费曲顶列表）
 *
 * 走 API 的 `?sources=a,b,c`：服务端把这几个平台一起搜、去重、**逐条验证可播**，
 * 再按平台交错返回 —— 所以这里拿到的每一条都是能播的（点了不会空）。
 *
 * @param {string[]} sources 平台 id 数组（顺序即注册表顺序；空数组 = 直接放弃）
 */
export declare function searchMultiSongs(keyword: any, sources: any, { pageSize, userKey, local }?: {
    local?: boolean;
    pageSize?: number;
    userKey?: string;
}): Promise<{
    list: any[];
    sources: any[];
    unavailable: string;
    tried: any[];
    error: any;
} | {
    error: string;
    list: any;
    sources: any;
    unavailable: string;
    tried: any;
}>;
/**
 * 外部平台来源 → 展示名 + 图标 + 颜色
 *
 * ⚠️ 定义已**搬到 utils/platforms.js**（单一事实来源，那里还带别名/音质/命令用正则片段）。
 * 这里保留同名导出，老调用方（卡片、Karin WebUI、解析）不用改。
 */
export { SOURCE_META, SOURCE_LABEL } from './platforms.js';
/** 取来源图标 URL（未知来源返回空串；模板据此走文字标签） */
export declare function sourceIconOf(source: any): string;
/** 统一歌曲对象归一化：兼容 /data 包裹、/track_info 包裹、扁平结构 */
export declare function normalizeSearchItem(item: any, idx?: number): {
    channelKind: string;
    channelLabel: string;
    sourceLabel: string;
    local: boolean;
    libraryId: string;
    version: string;
    versionLabel: string;
    index: number;
    songmid: any;
    songid: any;
    source: any;
    quality: any;
    external: boolean;
    media_mid: any;
    songName: any;
    singerName: any;
    albumName: any;
    albummid: any;
    cover: any;
    duration: string;
    interval: number;
    payplay: any;
    msgid: any;
    raw: any;
};
export declare function songDetail(songmid: any, userKey?: string): Promise<any>;
/** 单次指定音质 */
export declare function songUrl(songmid: any, { type, quality, fallback, mediaId, channel, userKey, local, fresh }?: {
    channel?: string;
    fallback?: number;
    fresh?: boolean;
    local?: boolean;
    quality?: string;
    type?: string;
    userKey?: string;
}): Promise<{
    url: string;
    quality: any;
    mediaId: any;
    tip: string;
    retcode: any;
    hasLogin: any;
    pay: any;
    refreshed: any;
    refreshReason: any;
    triedChannels: any;
    tried: any;
    achieved: string;
    raw: any;
} | {
    channelKind: string;
    channelLabel: string;
    local: boolean;
    libraryId: string;
    matchedSongmid: string;
    matchedBy: string;
    version: string;
    versionLabel: string;
    ext: string;
    source: string;
    sourceLabel: string;
    qualityLabel: string;
    external: boolean;
    url: string;
    file: any;
    domain: any;
    purl: any;
    quality: any;
    tried: any;
    mediaId: any;
    pay: any;
    refreshed: any;
    audioRevision: any;
    playChannel: any;
    ekey: any;
    vkey: any;
    encrypted: boolean;
}>;
export declare function refreshLogin(userKey?: string): Promise<any>;
/**
 * 组装「拿不到播放链」的用户可见文案（导出以便单测）
 *
 * DRM 曲目要省略「该曲需会员播放，请 #qqm登录」那句：API 已说明该曲**只提供加密文件**，
 * 登录/会员都解决不了 —— 再追加会员提示是自相矛盾，会把用户往错方向带（实测踩过）。
 */
export declare function buildPlayFailMessage(payload?: {}, pay?: any, tried?: any[], detailFallback?: string): string;
export declare function songUrlBest(songmid: any, { quality, mediaId, fallback, probe, userKey, local }?: {
    fallback?: boolean;
    local?: boolean;
    probe?: boolean;
    quality?: string;
    userKey?: string;
}): Promise<any>;
export declare function lyric(songmid: any, userKey?: string): Promise<any>;
export declare function hotKeys(userKey?: string): Promise<any>;
export declare function parseQQMusicIds(text?: string): {
    songmid: string;
    songid: string;
    albummid: string;
    media_mid: string;
};
export declare function parseQQMusicCard(msg: any): {
    songmid: string;
    songid: string;
    albummid: string;
    media_mid: string;
    title: string;
    desc: string;
    jumpUrl: any;
    cover: any;
    keyword: string;
    raw: any;
};
export declare function coverUrl(albummid: any, size?: number): string;
/** 歌手头像：无专辑图时的兜底（翻唱/上传/UGC 条目常没有专辑 mid，但有歌手 mid） */
export declare function singerCoverUrl(singermid: any, size?: number): string;
export declare function topCategory(userKey?: string): Promise<any>;
export declare function topDetail(id: any, { pageNo, pageSize, period, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
export declare function recommendHot(userKey?: string): Promise<any>;
export declare function searchSingers(keyword: any, { pageNo, pageSize, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
export declare function searchAlbums(keyword: any, { pageNo, pageSize, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
export declare function searchSonglists(keyword: any, { pageNo, pageSize, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
export declare function singerSongs(singermid: any, { pageNo, pageSize, order, userKey }?: {
    order?: number;
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<{
    list: any;
    total: any;
    pageNo: any;
    singermid: any;
}>;
export declare function singerDesc(singermid: any, userKey?: string): Promise<any>;
export declare function albumSongs(albummid: any, { begin, num, userKey }?: {
    begin?: number;
    num?: number;
    userKey?: string;
}): Promise<{
    list: any;
    total: any;
    albummid: any;
}>;
export declare function songlistDetail(disstid: any, userKey?: string): Promise<{
    dissname: any;
    songCount: any;
    listenNum: any;
    disstid: any;
    creator: any;
    songlist: {
        channelKind: string;
        channelLabel: string;
        sourceLabel: string;
        local: boolean;
        libraryId: string;
        version: string;
        versionLabel: string;
        index: number;
        songmid: any;
        songid: any;
        source: any;
        quality: any;
        external: boolean;
        media_mid: any;
        songName: any;
        singerName: any;
        albumName: any;
        albummid: any;
        cover: any;
        duration: string;
        interval: number;
        payplay: any;
        msgid: any;
        raw: any;
    }[];
    raw: any;
}>;
export declare function comment(id: any, { pageNo, pageSize, biztype, userKey }?: {
    biztype?: number;
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
export declare function parseQQMusicExtendedIds(text?: string): {
    songmid: string;
    songid: string;
    albummid: string;
    media_mid: string;
};
export declare function recommendFeed(userKey?: string): Promise<{
    channelKind: string;
    channelLabel: string;
    sourceLabel: string;
    local: boolean;
    libraryId: string;
    version: string;
    versionLabel: string;
    index: number;
    songmid: any;
    songid: any;
    source: any;
    quality: any;
    external: boolean;
    media_mid: any;
    songName: any;
    singerName: any;
    albumName: any;
    albummid: any;
    cover: any;
    duration: string;
    interval: number;
    payplay: any;
    msgid: any;
    raw: any;
}[]>;
export declare function personalRadio(count?: number, userKey?: string): Promise<any>;
export declare function dailyRecommend({ songBegin, songNum, userKey }?: {
    songBegin?: number;
    songNum?: number;
    userKey?: string;
}): Promise<{
    songs: any;
    title: any;
    desc: any;
}>;
export declare function userFavorites({ songBegin, songNum, userKey }?: {
    songBegin?: number;
    songNum?: number;
    userKey?: string;
}): Promise<{
    songs: any;
    title: any;
    desc: any;
}>;
export declare function mvCategory(userKey?: string): Promise<{
    area: any;
    version: any;
    list: any;
}>;
export declare function mvByTag(tagId: any, { pageNo, pageSize, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<{
    list: any;
    total: any;
}>;
/** 搜索 MV（/search t=12） */
export declare function searchMv(keyword: any, { pageNo, pageSize, userKey }?: {
    pageNo?: number;
    pageSize?: number;
    userKey?: string;
}): Promise<any>;
/** 取 MV 视频流 URL（/mv/url 返回 mp4 变体数组），失败返回空串 */
export declare function mvUrl(vid: any, userKey?: string): Promise<string>;
export declare function newSongs(type?: number, { num, userKey }?: {
    num?: number;
    userKey?: string;
}): Promise<any>;
export declare function songInfoBatch(ids?: any[], { userKey }?: {
    userKey?: string;
}): Promise<any>;
/** 歌单：新建（POST /songlist/create） */
export declare function songlistCreate(name: any, userKey?: string): Promise<any>;
/** 歌单：删除（POST /songlist/delete，dirId 必填） */
export declare function songlistDelete(dirId: any, userKey?: string): Promise<any>;
/**
 * 歌单：加歌 / 删歌（POST /songlist/addSongs | /delSongs）
 * @param {Array<string>|string} songs `songId:songType` 数组或已经拼好的串
 */
export declare function songlistAddSongs(dirId: any, songs: any, { tid, userKey }?: {
    tid?: number;
    userKey?: string;
}): Promise<any>;
export declare function songlistDelSongs(dirId: any, songs: any, { tid, userKey }?: {
    tid?: number;
    userKey?: string;
}): Promise<any>;
/** 「我喜欢」收藏 / 取消（POST /songlist/like | /unlike，API 内部固定 dirId=201） */
export declare function songlistLike(songs: any, userKey?: string): Promise<any>;
export declare function songlistUnlike(songs: any, userKey?: string): Promise<any>;
/** 外部歌单收藏 / 取消收藏（POST /user/favSonglistWrite | /unfavSonglistWrite） */
export declare function userFavSonglistWrite(playlistIds: any, userKey?: string): Promise<any>;
export declare function userUnfavSonglistWrite(playlistIds: any, userKey?: string): Promise<any>;
/** 专辑收藏 / 取消收藏（POST /user/favAlbumWrite | /unfavAlbumWrite） */
export declare function userFavAlbumWrite(albumIds: any, userKey?: string): Promise<any>;
export declare function userUnfavAlbumWrite(albumIds: any, userKey?: string): Promise<any>;
/**
 * 不喜欢：添加 / 取消 / 清空（POST /user/addDislike | /cancelDislike | /cancelAllDislike）
 * @param {1|2|3} type 1=歌曲 2=歌手 3=风格
 */
export declare function userAddDislike(type: any, values: any, userKey?: string): Promise<any>;
export declare function userCancelDislike(type: any, values: any, userKey?: string): Promise<any>;
export declare function userCancelAllDislike(userKey?: string): Promise<any>;
/** 评论：发布 / 删除（POST /comment/add | /comment/delete） */
export declare function commentAdd(id: any, content: any, { biztype, replyCmId, bizSubType, userKey }?: {
    bizSubType?: string;
    biztype?: number;
    replyCmId?: string;
    userKey?: string;
}): Promise<any>;
export declare function commentDelete(cmId: any, userKey?: string): Promise<any>;
/** 音响力（好友听歌榜）：点赞 / 取消点赞 / 隐私（POST /soundpower/like | /privacy） */
export declare function soundpowerLike(uin: any, { cancel, userKey }?: {
    cancel?: boolean;
    userKey?: string;
}): Promise<any>;
export declare function soundpowerPrivacy(status: any, userKey?: string): Promise<any>;
/** 私信：发送（POST /privatemessage/send，starSend=1 走明星超级私信） */
export declare function privateMsgSend(userId: any, msgType: any, text: any, { sessionId, starSend, userKey }?: {
    sessionId?: string;
    starSend?: number;
    userKey?: string;
}): Promise<any>;
export declare function privateMsgDeleteSession(sessionId: any, userKey?: string): Promise<any>;
export declare function privateMsgDeleteMessage(sessionId: any, msgId: any, userKey?: string): Promise<any>;
export declare function privateMsgClearSession(sessionId: any, userKey?: string): Promise<any>;
export declare function privateMsgSetConfig(configType: any, configValue: any, userKey?: string): Promise<any>;
export declare function privateMsgMarkAllRead(encryptUin: any, { cmdFlag, userKey }?: {
    cmdFlag?: number;
    userKey?: string;
}): Promise<any>;
export declare function privateMsgCardAction(targetUserId: any, msgType: any, msgId: any, { value, userKey }?: {
    userKey?: string;
    value?: number;
}): Promise<any>;
declare const _default: {
    searchSongs: typeof searchSongs;
    searchPlatformSongs: typeof searchPlatformSongs;
    searchMultiSongs: typeof searchMultiSongs;
    songDetail: typeof songDetail;
    songUrl: typeof songUrl;
    songUrlBest: typeof songUrlBest;
    lyric: typeof lyric;
    hotKeys: typeof hotKeys;
    parseQQMusicIds: typeof parseQQMusicIds;
    parseQQMusicCard: typeof parseQQMusicCard;
    coverUrl: typeof coverUrl;
    request: typeof request;
    pullLoginMeta: typeof pullLoginMeta;
    refreshLogin: typeof refreshLogin;
    topCategory: typeof topCategory;
    topDetail: typeof topDetail;
    recommendHot: typeof recommendHot;
    searchSingers: typeof searchSingers;
    searchAlbums: typeof searchAlbums;
    searchSonglists: typeof searchSonglists;
    singerSongs: typeof singerSongs;
    singerDesc: typeof singerDesc;
    albumSongs: typeof albumSongs;
    songlistDetail: typeof songlistDetail;
    comment: typeof comment;
    parseQQMusicExtendedIds: typeof parseQQMusicExtendedIds;
    recommendFeed: typeof recommendFeed;
    personalRadio: typeof personalRadio;
    dailyRecommend: typeof dailyRecommend;
    userFavorites: typeof userFavorites;
    mvCategory: typeof mvCategory;
    mvByTag: typeof mvByTag;
    mvUrl: typeof mvUrl;
    searchMv: typeof searchMv;
    newSongs: typeof newSongs;
    songInfoBatch: typeof songInfoBatch;
};
export default _default;
