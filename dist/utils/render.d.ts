/**
 * 编译模板并落盘成可直接截图的 HTML
 * 导出给 scripts/preview-cards.mjs 复用 —— 本地预览必须走**同一条**路径变换，
 * 否则预览看到的和真机发出去的会不一致。
 * @returns {{outFile:string, tpl:{file:string, from:string, fallback:boolean}}}
 */
export declare function renderHtmlFile(data: any, card: any, theme: any, { bgUrl }?: {
    bgUrl?: string;
}): {
    outFile: string;
    tpl: {
        file: string;
        from: any;
        fallback: boolean;
    };
};
/**
 * 通用卡片渲染：直连 puppeteer → Karin 宿主渲染器
 * @param {object} e
 * @param {object} data 模板数据
 * @param {string} tplName 模板目录名（与 html 文件同名）
 */
export declare function renderCard(e: any, data: any, card?: string): Promise<any>;
/**
 * 清掉全部模板编译缓存 + 主题缓存（#qqm界面 重载）
 * 平时靠 mtime 自动失效；这条用于一次改了一批文件后强制重来。
 */
export declare function reloadTemplates(): void;
/** 直连 Chrome 截图（导出给本地预览复用，保证与真机同一套参数） */
export { DEFAULT_IMAGE_FORMAT, IMAGE_QUALITY, imageFormatOf } from './theme.js';
/**
 * 卡片的 devicePixelRatio：按**像素预算**定，不再对每张卡一律 3
 *
 * 实测（2026-09-30 本机 Chrome，2.0 帮助卡 648×2115 CSS，见 temp/bench-dpr.mjs）：
 *   dpr3 = 1944×6345 = **1230 万像素** → 单张 JPEG 897KB，截图 344ms
 *   dpr2 = 1296×4230 = **548 万像素** → 单张 JPEG 494KB，截图 152ms（≈ 像素比的 2.26×）
 * 像素数直接决定光栅与 JPEG 编码的耗时 —— 在**性能不高的服务器**上（尤其缺 GPU 的容器，
 * 光栅走 SwiftShader 软件合成）这是最贵的一步；而这**张图每发一次都要上传给 QQ**，
 * 体积减半就是上传时间减半（"卡片半天发不出去"多半就是它）。
 *
 * 观感上 2 倍足够：卡片显示宽度约 400~600 CSS px，1296px 的源图在手机上已接近 1:1。
 *
 * 预算 8M 的取法（对着现有真卡片高度逐张算过，数据见 temp/preview/*.png）：
 *   · 超预算 → 降 2：2.0 帮助卡 12.3M、2.0 设置卡 9.0M、`#qqm帮助 全部` ≈20M
 *   · 不超   → 保持 3（小字更锐）：状态 3.9M、详情 4.8M、热搜 5.9M、列表 6.2M、平台 ≈6.5M
 */
export declare const CARD_PIXEL_BUDGET = 8000000;
/** 纯函数，便于单测：给定卡片 CSS 宽高，返回该用几倍（1/2/3） */
export declare function deviceScaleFor(cssWidth: any, cssHeight: any, budget?: number): 2 | 3;
export declare function screenshotDirect(htmlFile: any, { viewportWidth, pageBg, format, quality }?: {
    format?: string;
    pageBg?: string;
    quality?: number;
    viewportWidth?: number;
}): Promise<Buffer<any>>;
/** 关掉共用的 Chrome（预览脚本这类「跑完就退」的场景用；机器人运行时不需要调） */
export declare function closeDirectBrowser(): Promise<void>;
export declare function renderStatusCard(e: any, data: any): Promise<any>;
/**
 * 缓存键（导出给单测断言"配置变了键就变"）
 *
 * **数据整体进键**，不再逐字段手抄一份 —— 手抄必然漏，原来就漏了三处：
 *   · `data.full`：nebula / multi 的帮助模板用它决定"每段只列 8 条"（`{{if data.full || index < 8}}`）
 *     → `#qqm帮助 全部` 紧跟在 `#qqm帮助` 后面会拿到**被截断的那张图**；
 *   · `data.currentSource`：nebula / multi 顶部那颗 pill 显示的就是它（按群/按人变）；
 *   · `data.apiHint`：页脚那行 API 提示。
 * 判据很简单：**模板能看到的，键里就得有**。JSON.stringify 一份 data 只要几十微秒，
 * 而它挡掉的是一次上千毫秒的重截 —— 这点成本不用省。
 */
export declare function guideCacheKey(data: any, themeId?: string): string;
/** 1.x 老帮助卡（未解锁时走这张；改动前它没有缓存 → 每次都要重新截图） */
export declare function renderHelpCard(e: any, data: any): Promise<any>;
/** 2.0 帮助卡（解锁后走这里；未解锁时老帮助卡一个字都不变） */
export declare function renderGuideCard(e: any, data: any): Promise<any>;
/** 清帮助图缓存（改主题 / 热重载模板时调用） */
export declare function clearGuideCache(): void;
export declare function renderListCard(e: any, data: any): Promise<any>;
export declare function renderHotCard(e: any, data: any): Promise<any>;
export declare function renderLyricCard(e: any, data: any): Promise<any>;
/** 歌词海报卡（`#qqm海报`） */
export declare function renderPosterCard(e: any, data: any): Promise<any>;
export declare function renderCommentCard(e: any, data: any): Promise<any>;
/** 单平台状态卡（`#qqm<平台>状态`） */
export declare function renderPlatformCard(e: any, data: any): Promise<any>;
export declare function renderSettingsCard(e: any, data: any): Promise<any>;
/** 平台登录状态卡（`#qqm平台状态`） */
export declare function renderPlatformsCard(e: any, data: any): Promise<any>;
export declare function renderDetailCard(e: any, data: any): Promise<any>;
/** 勋章进度卡（`#qqm勋章`，只读） */
export declare function renderMedalCard(e: any, data: any): Promise<any>;
export declare function formatStatusText(data: any): string;
