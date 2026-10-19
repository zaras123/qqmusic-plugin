declare const qqmusicChart_base: any;
export declare class qqmusicChart extends qqmusicChart_base {
    constructor();
    cfg(): any;
    chart(e: any): Promise<boolean>;
    recommend(e: any): Promise<boolean>;
    recommendListen(e: any): Promise<boolean>;
    randomSong(e: any): Promise<boolean>;
    radio(e: any): Promise<boolean>;
    daily(e: any): Promise<boolean>;
    favorites(e: any): Promise<boolean>;
    newSongs(e: any): Promise<boolean>;
    mv(e: any): Promise<boolean>;
}
export {};
