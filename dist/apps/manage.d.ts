declare const qqmusicManage_base: any;
export declare class qqmusicManage extends qqmusicManage_base {
    constructor();
    cfg(): any;
    /** 总用法提示 */
    usage(e: any): Promise<boolean>;
    playlistWrite(e: any): Promise<boolean>;
    dislikeWrite(e: any): Promise<boolean>;
    commentWrite(e: any): Promise<boolean>;
    soundpowerWrite(e: any): Promise<boolean>;
    privateWrite(e: any): Promise<boolean>;
}
export {};
