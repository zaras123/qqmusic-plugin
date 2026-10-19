export declare function loadStore(): {
    version: number;
    schedules: any;
    subs: any;
    lastSubScanAt: number;
};
/** 原子落盘：先写临时文件再 rename，半路断电也不会留半个 JSON */
export declare function saveStore(data: any): {
    version: number;
    schedules: any;
    subs: any;
    lastSubScanAt: number;
};
/** 生一个短 id（同一条命令里够用；不需要全局唯一） */
export declare function newId(prefix?: string): string;
