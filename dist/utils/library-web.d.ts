export declare function hasApiToken(): boolean;
export declare function assertApiToken(): void;
export declare function getLibraryItem(id: string): any;
export declare function rememberLibraryItems(items: any[]): void;
export declare function mapLibraryItem(raw?: any): {
    id: string;
    songmid: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    quality: string;
    source: string;
    cover: string;
    bytes: number;
    available: boolean;
    status: string;
};
export declare function normalizeTargets(raw: any): {
    platform: string;
    uin: string;
    group_id: string;
    name: string;
}[];
export declare function normalizeGroupIds(raw: any): string[];
export declare function normalizePick(raw: any, count?: number): number;
export declare function formatSearchMessage(result: any): string;
export declare function formatSendStatus(job?: any): string;
export declare function searchLocalLibrary({ query, limit, userKey }?: any): Promise<{
    q: string;
    items: any[];
    total: number;
    at: number;
}>;
export declare function startLibrarySend({ groups, targets, pick, items, userId, }?: any): any;
export declare function runLibraryWebAction(action: string, fields?: any): Promise<string>;
