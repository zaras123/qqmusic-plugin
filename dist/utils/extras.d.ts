/**
 * 新增功能的**纯函数**工具（试听 / 海报 / 订阅 / 定时点歌共用）
 *
 * ⚠️ 与 utils/command.js 同一条仓库纪律：apps 里只许导出插件类（index.js 把
 *    「第一个函数导出」当类），所以能测的逻辑一律放 utils —— 本文件不 import
 *    任何业务模块（连 log.js 都不碰），保证 test.mjs 在无框架环境里能直接跑。
 */
/**
 * 解析定时点歌的时间写法 → 归一成 `HH:MM`
 *
 * 认这些写法（中国用户最顺手的几种）：
 *   08:30 / 8:30 / 8：30（全角冒号）/ 8点30 / 8点30分 / 8点半 / 8点
 * 返回 null = 认不出（调用方回用法提示，别猜）。
 * @returns {{h:number, m:number, text:string}|null} text 是归一后的 `HH:MM`
 */
export declare function parseScheduleTime(raw?: string): {
    h: any;
    m: any;
    text: string;
};
/** 当天的本地日期键 `YYYY-MM-DD`（定时任务用它记「今天发过了没」） */
export declare function dayKey(d?: Date): string;
/** `HH:MM` → 当天的分钟数（0-1439）；格式不对返回 -1 */
export declare function minuteOfDay(hm?: string): number;
/**
 * 哪些定时任务**现在该响**
 *
 * 规则：`enabled !== false`、今天还没发过（lastDate !== 今天）、当前时间落在
 * `[time, time+grace]` 窗口里。留 grace 窗口的原因：ticker 是 30s 一跳、重启也可能
 * 错过整点 —— 只要还在「晚到 10 分钟」以内就照样补发，而不是干等明天。
 *
 * 纯函数：now 显式传入，test.mjs 喂假时间直接断言。
 * @param {Array<{time:string, enabled?:boolean, lastDate?:string}>} jobs
 * @param {Date} now
 * @param {{graceMin?:number}} [opts]
 */
export declare function dueSchedules(jobs: any, now?: Date, { graceMin }?: {
    graceMin?: number;
}): any[];
/**
 * 副歌试听该截哪一段
 *
 * 没有音频分析，用「流行歌副歌大多在 40% 进度之后」的土启发式：
 *   · interval（秒）已知 → start = 40%，片段超出歌长就往回收
 *   · interval 未知     → 固定从 60s 起（大多数歌这时已经进主歌/副歌了）
 * 纯函数，test.mjs 钉边界（短歌 / 长歌 / 未知时长）。
 * @returns {{start:number, dur:number}} 秒
 */
export declare function chorusSegment(intervalSec: any, { sec, from, unknownStart }?: {
    from?: number;
    sec?: number;
    unknownStart?: number;
}): {
    start: number;
    dur: number;
};
/**
 * LRC 文本 → {t(秒)|null, text}[]
 *
 * 处理三类真实脏数据：
 *   · 行首时间戳可能不止一个（`[00:12.0][01:45.0]副歌句`）→ 拆成两行
 *   · QRC 的字级标签（`词<00:12.30>字<…>`）→ 内联 `<...>` 全剥
 *   · 元数据行（作词/作曲…）保留 —— 要不要过滤是**调用方**的事
 */
export declare function parseLrcLines(text?: string): any[];
/**
 * 从歌词里挑出海报要的那几句（**副歌窗口**）
 *
 * 口径与 chorusSegment 一致：时长已知 → 取 40% 进度往后第一段连续非空句；
 * 时长未知（拿不到 interval）→ 按行数取中段。挑不出（纯音乐/歌词太短）回空数组，
 * 调用方回落「整段歌词头几行」或报"没有合适的词"。
 * @param {string} lrcText 原始 LRC
 * @param {number} intervalSec 歌曲时长（秒，可 0 = 未知）
 * @param {{max?:number, from?:number}} [opts]
 */
export declare function pickLyricLines(lrcText: any, intervalSec: any, { max, from }?: {
    from?: number;
    max?: number;
}): any[];
/**
 * 订阅扫描：这轮真的有新歌吗（按 songmid 对比已知集合）
 * @param {Array<{songmid:string}>} current 这次拉到的列表
 * @param {Array<{songmid:string}>} known 上次存的
 * @returns {Array} 出现在 current、不在 known 里的（保持 current 的顺序）
 */
export declare function diffNewSongs(current?: any[], known?: any[]): any[];
