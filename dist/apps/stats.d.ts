declare const qqmusicStats_base: any;
export declare class qqmusicStats extends qqmusicStats_base {
    constructor();
    cfg(): any;
    /** 关着就直说（静默不响应会让人以为命令写错了） */
    disabled(e: any): Promise<boolean>;
    /** #qqm听歌：我自己的账 */
    myStats(e: any): Promise<boolean>;
    /** #qqm听歌榜 [今日|本周|总]：本群的账 */
    board(e: any): Promise<boolean>;
}
export {};
