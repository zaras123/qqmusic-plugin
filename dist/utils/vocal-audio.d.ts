export declare function validateAndPrepareVocal(filePath: any, { directExt, maxBytes, lowQuality, expectedSeconds, }?: {
    expectedSeconds?: number;
    lowQuality?: boolean;
}): Promise<{
    filePath: string;
    converted: boolean;
    nativeSilk: boolean;
    sourceSeconds?: undefined;
    outputSeconds?: undefined;
    bitrate?: undefined;
} | {
    nativeSilk?: undefined;
    filePath: string;
    converted: boolean;
    sourceSeconds: number;
    outputSeconds: number;
    bitrate: string;
}>;
