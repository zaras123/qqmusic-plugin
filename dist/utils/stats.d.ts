export declare const DEFAULT_KEEP_DAYS = 60;
export declare const DEFAULT_MAX_USERS = 100;
export declare function statsFilePath(): string;
/** 时间戳 → 东八区的 YYYY-MM-DD */
export declare function dayKeyOf(ts?: number): string;
/** YYYY-MM-DD → 天序号（差值就是天数，闰年自动正确） */
export declare function dayIndexOf(key: any): number;
/** 天序号 → YYYY-MM-DD */
export declare function dayKeyFromIndex(index: any): string;
/** 立即落盘（测试与"关机前"用；平时走 scheduleSave） */
export declare function flushStats(): void;
/** 把插件配置里的三个键归一成统计模块认识的形状（默认全开、60 天、每群 100 人） */
export declare function statsConfig(cfg?: {}): {
    enable: boolean;
    keepDays: any;
    maxUsersPerGroup: any;
};
/**
 * 这条消息该记到哪个账本
 *
 * 群聊记到群账本（`g<群号>`），私聊记到个人账本（`p<QQ号>`）—— 两类分开，
 * 免得私聊点歌冒进群榜里。前缀只为让两种 scope 在同一个 groups 表里不打架。
 */
export declare function scopeOf(e: any): string;
/**
 * 这一首按多少秒计
 *
 * `interval`（秒）是本插件各条搜索/详情路径都在用的规范字段，优先它；
 * 拿不到再试 durationSec、最后才解析 `duration`（"mm:ss" / "h:mm:ss"）。
 * 全都拿不到就计 0 秒 —— 播放**次数**照记，不编一个假时长出来。
 */
export declare function durationSecOf(song?: {}): number;
/** 这首歌来自哪家（QQ 本体没有 source 字段 → 记成 qq） */
export declare function platformOf(song?: {}): string;
/**
 * 记一次播放。**永不抛**：统计失败绝不该把发歌流程带崩。
 * @returns {boolean} 有没有真的记上
 */
export declare function recordPlay(payload?: {}, options?: {}): boolean;
/**
 * 连续听歌天数
 *
 * 今天还没听**不算断**（从昨天往回数）—— 否则每天早上一睁眼，所有人的连续天数
 * 都归零，看着就像功能坏了。
 */
export declare function streakOf(days: {}, todayIndex: any): number;
/** 个人统计；没有记录返回 null（调用方据此给"先点一首"的提示） */
export declare function statsOf(groupId: any, userId: any, { now }?: {
    now?: number;
}): {
    groupId: string;
    userId: string;
    name: any;
    sec: any;
    plays: any;
    todaySec: any;
    todayPlays: any;
    weekSec: number;
    weekPlays: number;
    activeDays: number;
    streak: number;
    topSingers: {
        name: string;
        value: unknown;
    }[];
    platforms: {
        name: string;
        value: unknown;
    }[];
    firstAt: any;
    lastAt: any;
};
/**
 * 群排行
 * @param {'today'|'week'|'total'} range
 */
export declare function groupBoard(groupId: any, range?: string, { limit, now }?: {
    limit?: number;
    now?: number;
}): any[];
/**
 * 时长的人话写法
 *
 * 分档写：小数字带秒（"3 分 20 秒"），上了小时就只到分（"12 小时 7 分"）——
 * 排行榜里一排"12 小时 7 分 33 秒"是读不下去的。
 */
export declare function formatDuration(sec: any): string;
/** 平台 id → 展示名（QQ 本体没有 source 字段，别让它显示成光秃秃的 "qq"） */
export declare function platformLabelOf(id: any): any;
/**
 * 个人统计文案（一条数字为主的短回执，不发图 —— 渲染成卡反而更慢）
 * @param {object} s statsOf() 的返回值
 */
export declare function formatPersonalStats(s?: {}): string;
/** 群榜文案 */
export declare function formatBoardText(rows?: any[], rangeLabel?: string): string;
/**
 * 丢掉内存态，下次读取时重新从文件加载
 *
 * 先把没落盘的改动写下去再丢 —— 否则调它等于把最近 5 秒的账悄悄抹了。
 */
export declare function reloadStats(): void;
/** 测试用：丢掉内存态并把文件删掉，从零开始 */
export declare function resetStats(): void;
declare const _default: {
    statsFilePath: typeof statsFilePath;
    statsConfig: typeof statsConfig;
    scopeOf: typeof scopeOf;
    recordPlay: typeof recordPlay;
    statsOf: typeof statsOf;
    groupBoard: typeof groupBoard;
    streakOf: typeof streakOf;
    durationSecOf: typeof durationSecOf;
    platformOf: typeof platformOf;
    formatDuration: typeof formatDuration;
    platformLabelOf: typeof platformLabelOf;
    formatPersonalStats: typeof formatPersonalStats;
    formatBoardText: typeof formatBoardText;
    dayKeyOf: typeof dayKeyOf;
    dayIndexOf: typeof dayIndexOf;
    dayKeyFromIndex: typeof dayKeyFromIndex;
    flushStats: typeof flushStats;
    reloadStats: typeof reloadStats;
    resetStats: typeof resetStats;
};
export default _default;
