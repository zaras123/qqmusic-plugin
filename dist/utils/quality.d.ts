/**
 * QQ 音乐音质档位（标签与阶梯顺序）
 *
 * ⚠️ 这里**只保留标签和阶梯顺序**（界面展示、请求档位排序用）。
 * 「这首歌到底有没有这一档」的元数据判定（size_* / size_new）已收归 API：
 *   qqmusic-api-enhanced/util/quality.js → qualitySizeOk()
 *
 * 插件侧原先那份 isQualitySizeOk / pickBestAvailableQuality 是旧实现，语义已与 API 分叉
 * —— 少了「元数据里连一个 size 字段都没有就不拦」这层守卫，会把整首歌逐档误杀成
 * 「没音质可选」。已于 2026-09 删除；需要判档请调 API，别在这里再加一份。
 */
export declare const QQMUSIC_QUALITY_LIST: readonly {
    label: string;
    value: string;
}[];
/** 从高到低完整阶梯（与 API 侧 util/quality.js 的 LADDER 保持一致，已核对） */
export declare const QUALITY_LADDER: readonly string[];
export declare const QUALITY_LABEL: Readonly<{
    auto: "自动适配";
}>;
/** 调试：摘要 size_new 与经典字段（仅用于日志） */
export declare function summarizeFileSizes(file?: {}): {
    flac?: undefined;
    hires?: undefined;
    dolby?: undefined;
    s320?: undefined;
    s128?: undefined;
    new0?: undefined;
    new2?: undefined;
    new10?: undefined;
} | {
    flac: number;
    hires: number;
    dolby: number;
    s320: number;
    s128: number;
    new0: any;
    new2: any;
    new10: any;
};
