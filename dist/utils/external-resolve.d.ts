export declare const EXTERNAL_LIMIT = 30;
type ExternalPlatform = 'spotify' | 'apple' | 'bilibili';
type ExternalRef = {
    platform: ExternalPlatform;
    kind: string;
    id: string;
    url: string;
};
export declare function detectExternalRef(text?: string): ExternalRef | null;
export declare function isExternalMusicMessage(text?: string): boolean;
export declare function platformLabelOf(platform?: string): string;
export declare function externalCandidateToSong(candidate?: Record<string, any>, metadata?: Record<string, any>, ref?: Partial<ExternalRef>): {
    songmid: string;
    songid: any;
    media_mid: any;
    songName: any;
    singerName: any;
    albumName: any;
    cover: any;
    interval: number;
    duration: number;
    source: any;
    sourceLabel: any;
    quality: any;
    qualityLabel: any;
    local: boolean;
    channelKind: any;
    channelLabel: any;
    libraryId: any;
    version: any;
    versionLabel: any;
    external: boolean;
    matchedBy: any;
    _detailFetched: boolean;
    _externalResolve: {
        platform: string;
        kind: string;
        url: string;
        externalId: string;
        matchedSource: any;
        local: boolean;
    };
};
export declare function resolveExternalRef(ref: ExternalRef, { userKey, limit, local }?: {
    userKey?: string;
    limit?: number;
    local?: boolean;
}): Promise<{
    platform: ExternalPlatform;
    label: string;
    kind: string;
    url: string;
    id: string;
    songs: ReturnType<typeof externalCandidateToSong>[];
    matched: number;
    total: number;
    note: string;
}>;
export {};
