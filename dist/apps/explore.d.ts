declare const qqmusicExplore_base: any;
export declare class qqmusicExplore extends qqmusicExplore_base {
    constructor();
    cfg(): any;
    artist(e: any): Promise<boolean>;
    album(e: any): Promise<boolean>;
    playlist(e: any): Promise<boolean>;
    getComment(e: any): Promise<boolean>;
}
export {};
