declare const qqmusicExtras_base: any;
export declare class qqmusicExtras extends qqmusicExtras_base {
    constructor();
    cfg(): any;
    previewCmd(e: any): Promise<boolean>;
    posterCmd(e: any): Promise<boolean>;
    subAdd(e: any): Promise<boolean>;
    subDel(e: any): Promise<boolean>;
    subList(e: any): Promise<boolean>;
    schedAdd(e: any): Promise<boolean>;
    schedList(e: any): Promise<boolean>;
    schedDel(e: any): Promise<boolean>;
}
export {};
