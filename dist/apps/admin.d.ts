declare const qqmusicAdmin_base: any;
export declare class qqmusicAdmin extends qqmusicAdmin_base {
    constructor();
    showConfig(e: any): Promise<boolean>;
    setApi(e: any): Promise<boolean>;
    toggle(e: any): Promise<boolean>;
    /** #qqm 默认点歌 开/关 ；#qqm 补充曲 开/关 ；#qqm 一起听 开/关 ；#qqm 一起听同步 开/关 */
    toggleExtra(e: any): Promise<boolean>;
    /**
     * #qqm界面            查看当前主题 + 列出可用主题
     * #qqm界面 apple      切换主题（热更新，立即生效）
     * #qqm界面 深色/浅色   深浅切换（仅对支持深色的主题有效）
     * #qqm界面 重载        强制重载全部模板（改了一批模板文件后用）
     */
    themeCmd(e: any): Promise<boolean>;
    setQuality(e: any): Promise<boolean>;
    ping(e: any): Promise<boolean>;
    listAccounts(e: any): Promise<boolean>;
    update(e: any): Promise<boolean>;
    forceUpdate(e: any): Promise<boolean>;
    updateLog(e: any): Promise<boolean>;
}
export {};
