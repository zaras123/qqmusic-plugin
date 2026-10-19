export declare const THEMES_DIR: string;
export declare const DEFAULT_THEME = "classic";
/** 2.0（？？？打开后）的默认主题：「星云」版（multi 仍可选） */
export declare const DEFAULT_THEME_V2 = "nebula";
/** 插件全部卡片（模板文件名 = 卡片名） */
export declare const CARDS: string[];
/** 一天里的四个时段（底色跟着时段走，卡片颜色一天里是活的） */
export declare const TIME_PERIODS: string[];
export declare const TIME_LABEL: {
    dawn: string;
    day: string;
    dusk: string;
    night: string;
};
/**
 * 当前时段（纯函数，便于测试固定时间）
 *   清晨 5-8 / 白天 8-17 / 黄昏 17-20 / 夜晚 20-5
 */
export declare function timePeriodOf(date?: Date): "dawn" | "day" | "dusk" | "night";
export declare function listThemeIds(): any[];
/** 把缺字段的 theme.json 补成完整契约；坏值一律给安全默认，别让渲染炸掉 */
export declare function normalizeManifest(id: any, raw?: {}): {
    id: any;
    name: string;
    desc: string;
    dark: boolean;
    bg: boolean;
    pageBg: {
        light: string;
        dark?: string;
    };
    viewportWidth: number;
    cardWidth: any;
};
/** 读某个主题的 manifest（按 mtime 缓存） */
export declare function loadManifest(id: any): any;
/**
 * 卡片图片格式（2026-09-25 性能优化）
 *
 * 实测（本机 Chrome，2064×6030 的 2.0 帮助卡，同一热页面只换格式）：
 *   PNG        **4.98 s**  **9.75 MB**
 *   JPEG q92    0.56 s       1.44 MB     ← 快 8.9×、小 6.8×
 * 1:1 局部对比（文字 + 品牌色轨 + pill）看不出差别；而这张图**每发一次都要上传给 QQ**，
 * 慢网下"卡片半天发不出去"多半就是它。
 *
 * ⚠️ 放在 theme.js（而不是 render.js）是因为它要**同时被**渲染、设置卡、Karin WebUI 三处读：
 *    card-data / Karin WebUI schema 引 render.js 会把 Puppeteer 拽进启动路径（有条测试钉着
 *    "别把卡片模块静态引进来"）。归一函数只此一份，别再各写一遍。
 * ⚠️ 二维码那条路永远是 PNG（`saveQrImage`）：JPEG 的振铃会让码扫不出来。
 */
export declare const DEFAULT_IMAGE_FORMAT = "jpeg";
export declare const IMAGE_QUALITY = 92;
/** 归一配置里的图片格式：认不出一律回 jpeg（默认档） */
export declare function imageFormatOf(cfg?: {}): "jpeg" | "png";
/** uiDark 归一：true=深色 / false=浅色 / 'auto'=跟随时间（夜晚自动深色） */
export declare function darkPrefOf(v: any): "auto" | "dark" | "light";
/**
 * 解析出本次要用的主题
 * @param {object} cfg 插件配置（读 uiTheme / uiDark）
 * @param {{now?: number|Date}} [opts] now 用于测试固定时间
 * @returns {{id, requested, fallback, dir, manifest, period, darkPref, dark}}
 */
export declare function resolveTheme(cfg?: {}, opts?: {}): {
    id: string;
    requested: string;
    fallback: boolean;
    dir: string;
    manifest: any;
    period: string;
    useTimeColor: boolean;
    darkPref: string;
    dark: boolean;
};
/**
 * 某张卡在该主题下的模板文件；该主题没实现这张卡就回落到 classic。
 * @returns {{file: string|null, from: string|null, fallback: boolean}}
 */
export declare function templateFile(theme: any, card: any): {
    file: string;
    from: any;
    fallback: boolean;
};
export declare function pageBgOf(theme: any): any;
export declare function viewportWidthOf(theme: any, card: any): number;
/**
 * 模板文件是否变化过（变了 = 需要让 art-template 重新编译）
 * 首次调用必然返回 true —— 反正第一次也要编译。
 */
export declare function fileChanged(file: any): boolean;
/** 一键清空所有缓存（#qqm界面 重载 用） */
export declare function invalidateAll(): void;
/** 给命令用的主题清单 */
export declare function describeThemes(): {
    id: any;
    name: any;
    desc: any;
    dark: boolean;
    bg: boolean;
    cards: number;
    cardsTotal: number;
}[];
