/**
 * QQ 音乐分享卡片 / 链接解析
 * 参考 rconsole-plugin apps/tools.js qqMusic
 */
declare const qqmusicResolve_base: any;
export declare class qqmusicResolve extends qqmusicResolve_base {
    constructor();
    cfg(): any;
    /**
     * accept 在 rule 之前执行（loader 优先 accept）。
     * 识别到 QQ 音乐分享时：本插件处理，并标记 e 阻止后续插件重复解析。
     */
    accept(e: any): Promise<string>;
    resolve(e: any): Promise<boolean>;
    handle(e: any, text: any, cfg: any): Promise<boolean>;
    cardToSong(card: any, userKey?: string): Promise<any>;
    idsToSong(ids: any, fallbackText?: string, userKey?: string): Promise<any>;
}
export {};
