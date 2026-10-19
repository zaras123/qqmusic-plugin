export declare function ticketArchive(filters: any, userKey?: string, { timeout }?: {
    timeout?: number;
}): Promise<any>;
export declare function ticketShow(key: any, userKey?: string): Promise<any>;
export declare function ticketOptions(kind: any, userKey?: string): Promise<any[]>;
export declare function ticketSync(city: any, userKey?: string, { detailLimit }?: {
    detailLimit?: number;
}): Promise<any>;
