/** 点歌列表卡片 - 统一风格模板，用于歌手/专辑/歌单/排行 */
export declare function buildListCardData(keyword: any, songs: any, options?: {}): {
    keyword: any;
    sourceLabel: any;
    /**
     * 「多平台」主题用：按来源统计条数（列表头部那排彩色 chip）
     * 例：QQ 6 · 网易云 2 · B站 2 —— 一眼看出这次搜索里每家占了几条
     */
    sourceCounts: any[];
    hasExternal: any;
    total: any;
    logo: string;
    quality: string;
    apiHint: string;
    singerInfo: any;
    albumInfo: any;
    songs: any;
    hasMv: any;
    commands: {
        name: string;
        desc: any;
        example: string;
    }[];
};
/** 热搜卡片 */
export declare function buildHotCardData(items?: any[]): {
    title: string;
    subtitle: string;
    total: number;
    items: {
        index: number;
        word: string;
        hot: any;
    }[];
    apiHint: string;
    tip: string;
};
/** 清理评论正文：去掉 QQ音乐表情代码 / 换行 / 音频图片标记 */
export declare function cleanCommentText(text?: string): string;
/**
 * 评论卡片：每条评论一个格子（头像 + 昵称 + 时间 + 内容 + 赞数）
 * @param {object} opts
 * @param {Array<object>} opts.comments 原始评论对象（含 nick/avatarurl/praisenum/time/rootcommentcontent）
 */
export declare function buildCommentCardData({ songName, singerName, cover, albumName, comments, songmid, }?: {
    albumName?: string;
    comments?: any[];
    cover?: string;
    singerName?: string;
    songName?: string;
    songmid?: string;
}): {
    songName: string;
    singerName: string;
    cover: string;
    albumName: string;
    songmid: string;
    comments: {
        index: number;
        nick: string;
        avatar: any;
        time: string;
        likes: any;
        content: string;
        hot: boolean;
    }[];
    total: number;
    apiHint: string;
    tip: string;
};
/** 歌词卡片 */
export declare function buildLyricCardData({ songName, singerName, cover, albumName, lines, songmid, }?: {
    albumName?: string;
    cover?: string;
    lines?: any[];
    singerName?: string;
    songName?: string;
    songmid?: string;
}): {
    songName: string;
    singerName: string;
    cover: string;
    albumName: string;
    songmid: string;
    lines: string[];
    lineCount: number;
    apiHint: string;
    tip: string;
};
/**
 * 歌词海报卡（`#qqm海报 关键词`）
 *
 * 与歌词卡（qqmusic-lyric）的分工：歌词卡是"看整篇词"的实用卡；
 * 海报是"把副歌那几句 + 封面排成一张能转发的分享图"—— 行数少、字号大、有日期戳。
 * 选哪几句的口径在 utils/extras.js 的 pickLyricLines（副歌窗口，与试听片段一致）。
 */
export declare function buildPosterCardData({ songName, singerName, albumName, cover, lines, songmid, }?: {
    albumName?: string;
    cover?: string;
    lines?: any[];
    singerName?: string;
    songName?: string;
    songmid?: string;
}): {
    songName: string;
    singerName: string;
    albumName: string;
    cover: string;
    songmid: string;
    lines: string[];
    lineCount: number;
    dateText: string;
    apiHint: string;
    tip: string;
};
/**
 * **单平台**状态卡（`#qqm网易状态` / `#qqm酷狗状态` …）
 *
 * 与聚合卡（`#qqm平台状态`）同一份数据源 `GET /platforms`（10s 缓存），
 * 这里只挑出那一家，再把它的**命令清单**补齐 —— 卡的价值是"这一家怎么用、缺什么、下一步点哪"。
 */
export declare function buildPlatformCardData(status?: {}, platformId?: string): {
    title: string;
    subtitle: string;
    logo: string;
    apiHint: string;
    themeText: any;
    row: {
        name: any;
        label: any;
        short: any;
        color: string;
        kindText: any;
        ready: boolean;
        stateText: string;
        sourceText: any;
        quality: any;
        canQr: boolean;
        ownersCount: any;
        unreliable: any;
        note: any;
        action: string;
        detail: string;
    };
    commands: {
        name: string;
        example: string;
        desc: string;
    }[];
    qualities: {
        value: string;
        label: string;
    }[];
    tips: string[];
};
/** 单平台卡的纯文本兜底 */
export declare function formatPlatformCardText(data: any): string;
export declare function buildPlatformsCardData(status?: {}): {
    title: string;
    subtitle: string;
    logo: string;
    apiHint: string;
    total: any;
    readyCount: any;
    canQrCount: any;
    themeText: any;
    rows: any;
    tips: string[];
};
/** 平台状态卡的纯文本兜底（图渲染失败时用） */
export declare function formatPlatformsText(data?: {}): string;
/**
 * 设置卡片（含登录/适配器探测）
 * @param {object} e 消息事件（可选，用于适配器识别）
 */
export declare function buildSettingsCardData(e?: any): Promise<{
    title: string;
    subtitle: string;
    apiBase: string;
    apiHint: string;
    enable: string;
    enableRaw: boolean;
    song: string;
    resolve: string;
    listCard: string;
    quality: any;
    qualityKey: any;
    qualityFallback: string;
    maxList: number;
    sendVocal: string;
    uploadFile: string;
    sendNativeCard: string;
    sendCustomCard: string;
    loginOk: boolean;
    loginText: string;
    loginUin: string;
    loginNick: string;
    publicAccount: string;
    publicAccountText: string;
    adapterName: string;
    adapterKind: string;
    adapterId: string;
    togetherText: string;
    platformCount: number;
    platformText: string;
    themeText: string;
    tiles: {
        label: string;
        value: string;
        on: boolean;
    }[];
    rows: {
        k: string;
        v: string;
    }[];
    commands: {
        name: string;
        desc: string;
        example: string;
    }[];
    tip: string;
}>;
/** 纯文本兜底：热搜 */
export declare function formatHotText(items?: any[]): string;
/** 纯文本兜底：歌词 */
export declare function formatLyricText({ songName, singerName, lines }: {
    lines: any;
    singerName: any;
    songName: any;
}): string;
/** 纯文本兜底：设置 */
export declare function formatSettingsText(data: any): string;
/** 生成基于当前配置的动态提示文案：精准反映当前会发送什么（语音 / 群文件 / 原生卡 / 自定义卡） */
export declare function buildDeliveryTip(cfg?: {}, { qualityLabel, hasUrl, degradeNote, error }?: {
    degradeNote?: string;
    error?: string;
    hasUrl?: boolean;
    qualityLabel?: string;
}): string;
/** 歌曲详情卡片（解析后展示） */
export declare function buildDetailCardData(song: any, { qualityLabel, payplay, source, hasUrl, mvVid, tip, degradeNote, error, cfg }?: {
    cfg?: any;
    degradeNote?: string;
    error?: string;
    hasUrl?: boolean;
    mvVid?: string;
    payplay?: boolean;
    qualityLabel?: string;
    source?: string;
    tip?: string;
}): {
    title: any;
    songName: any;
    singerName: any;
    albumName: any;
    cover: any;
    songmid: any;
    duration: any;
    qualityLabel: string;
    payplay: boolean;
    showPay: boolean;
    payInfo: string;
    payIcon: string;
    urlStatus: string;
    urlIcon: string;
    source: string;
    sourceId: any;
    sourceColor: string;
    sourceShort: string;
    sourceIsExternal: boolean;
    tip: string;
    mvVid: string;
};
/** MV 详情卡片 - 复用 qqmusic-detail 模板；按 MV 语义映射（无专辑/无音质/显示时长） */
export declare function buildMvCardData(mv: any): {
    title: any;
    songName: any;
    singerName: any;
    albumName: string;
    cover: any;
    songmid: string;
    duration: string;
    qualityLabel: string;
    payplay: boolean;
    showPay: boolean;
    source: string;
    tip: string;
    vid: any;
    listennum: number;
};
/** 纯文本兜底：歌曲详情 */
export declare function formatDetailText(song: any, { qualityLabel, hasUrl }?: {
    hasUrl?: boolean;
    qualityLabel?: string;
}): string;
