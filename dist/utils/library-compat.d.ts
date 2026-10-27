/** Metadata from the API's local music library; no new provider or remote requests. */
export declare function searchLibraryFields(raw?: {}): {
    local: boolean;
    libraryId: string;
    version: string;
    versionLabel: string;
};
export declare function keepSearchSource(song: any, allowed: any): any;
export declare function audioFormatExtension(format?: string): string;
export declare function playLibraryFields(body?: {}, nested?: {}): {
    local: boolean;
    libraryId: string;
    matchedSongmid: string;
    matchedBy: string;
    version: string;
    versionLabel: string;
    ext: string;
    source: string;
    sourceLabel: string;
    qualityLabel: string;
    external: boolean;
};
