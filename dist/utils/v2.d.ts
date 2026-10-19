/** 开关字段名（Karin WebUI UI 上显示为 `？？？`） */
export declare const V2_FIELD = "unlockV2";
/** 2.0 是否解锁（现读配置；任何异常都当作"没开"，绝不误放行） */
export declare function isV2Unlocked(cfg?: any): boolean;
/**
 * 2.0 命令的统一前置守卫
 * @returns {boolean} true = 已解锁，可以继续；false = 未解锁（调用方必须**直接 return false**）
 */
export declare function v2Ready(): boolean;
/** 单平台开关：`platforms: { netease: { enabled: false } }`；缺省 = 开 */
export declare function platformEnabled(cfg: any, id: any): boolean;
/** 该平台可点歌的最大列表条数（缺省用全局 maxList） */
export declare function platformMaxList(cfg: any, id: any): number;
/**
 * 该平台的音质档位偏好（`platforms.<平台>.quality`）
 *
 * ⚠️ 与 `utils/platforms.js` 的 `platformQualities()` 同源：值必须在那家的档位清单里，
 * 不在（或没配）就回 `'auto'`，交给 API 用"该平台最高可用"。
 * API 侧还会再核一遍"现在能不能兑现"（比如网易云的无损要账号），
 * 拿不到会**如实回落**并在响应里给 `qualityNote` —— 所以这里不用替它兜底。
 */
export declare function platformQualityPref(cfg: any, id: any): string;
/**
 * 这家平台参与「跨平台补歌」吗（`platforms.<平台>.fill`，缺省 = 参与）
 *
 * 关掉的表现：#qqm点歌 的结果尾部不会再出现这家的候选（只在 #qqm<平台>点歌 里出现）
 */
export declare function platformFillEnabled(cfg: any, id: any): boolean;
/**
 * 参与「跨平台补歌」的平台 id 集合
 *
 * ⚠️ 这里用 **SEARCH_PLATFORMS**（含隐藏平台，如 JioSaavn），而
 * `standaloneSourceIds()`（QQ 关掉时的跨平台点歌）用 **VISIBLE_PLATFORMS**（排除隐藏）。
 * **两处口径不同是有意的**：
 *   · 补歌只在 QQ 结果尾部加几条，冷门/外语曲多一家源是净赚，不该因为"界面上不展示"
 *     就把它的免费曲挡在外面；
 *   · 反过来，`#qqm<平台>点歌` 是要**教用户去用**的入口，隐藏平台不该出现在
 *     帮助 / Karin WebUI / 点歌清单里，所以不进去。
 * 曾有人想把这两处统一成一个——别改，改了要么少一家免费源、要么把隐藏平台推到台前。
 */
export declare function fillSourceIds(cfg: any): string[];
/**
 * QQ 音乐音源开关（`qqEnabled`，默认开）
 *
 * 关掉它 = 这个机器人**只用其它平台**（曲库仍能用免费曲点歌）：
 *   · `#qqm点歌` 直接搜「开着的那几家外部平台」，不再打 QQ
 *   · 曲库/收藏/日推这些**依赖 QQ 账号**的功能照旧存在，只是没有歌词/无损那一套
 * 需求原话：「QQ 也不是主营」—— 所以它必须能被关掉，而不是写死的唯一主干。
 */
export declare function qqSourceEnabled(cfg: any): boolean;
/** 可单独点歌的外部平台 id（按注册表顺序，QQ 关掉时就是"全部音源"） */
export declare function standaloneSourceIds(cfg: any): string[];
/**
 * 当前**可用**的平台清单（2.0 未解锁 = 空数组）
 *
 * 帮助卡、`#qqm平台` 列表、Karin WebUI 预览都从它取，保证三处一致。
 */
export declare function enabledPlatforms(cfg: any): ({
    id: string;
    label: string;
    aliases: string[];
    icon: string;
    color: string;
    quality: string;
    own: boolean;
    auth: {
        mode: string;
        qr: {
            app: string;
        };
        deeplink: boolean;
        cookie?: undefined;
        note?: undefined;
    };
    qualities?: undefined;
    short?: undefined;
    needsCredential?: undefined;
    prefix?: undefined;
    hidden?: undefined;
} | {
    own?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    icon: string;
    color: string;
    quality: string;
    auth: {
        deeplink?: undefined;
        mode: string;
        qr: {
            app: string;
        };
        cookie: {
            where: string;
            keys: string;
            file?: undefined;
            field?: undefined;
            clear?: undefined;
        };
        note?: undefined;
    };
    qualities: {
        value: string;
        label: string;
    }[];
    needsCredential?: undefined;
    hidden?: undefined;
} | {
    own?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    icon: string;
    color: string;
    quality: string;
    auth: {
        deeplink?: undefined;
        mode: string;
        cookie: {
            where: string;
            keys: string;
            file?: undefined;
            field?: undefined;
            clear?: undefined;
        };
        qr?: undefined;
        note?: undefined;
    };
    qualities?: undefined;
    needsCredential?: undefined;
    hidden?: undefined;
} | {
    own?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    icon: string;
    color: string;
    quality: string;
    qualities: {
        value: string;
        label: string;
    }[];
    needsCredential: boolean;
    auth: {
        deeplink?: undefined;
        mode: string;
        qr: {
            app: string;
        };
        cookie: {
            where: string;
            keys: string;
            file?: undefined;
            field?: undefined;
            clear?: undefined;
        };
        note?: undefined;
    };
    hidden?: undefined;
} | {
    own?: undefined;
    icon?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    color: string;
    quality: string;
    auth: {
        deeplink?: undefined;
        mode: string;
        qr: {
            app: string;
        };
        cookie: {
            where: string;
            keys: string;
            file?: undefined;
            field?: undefined;
            clear?: undefined;
        };
        note?: undefined;
    };
    qualities: {
        value: string;
        label: string;
    }[];
    needsCredential: boolean;
    hidden?: undefined;
} | {
    own?: undefined;
    icon?: undefined;
    qualities?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    color: string;
    quality: string;
    auth: {
        deeplink?: undefined;
        qr?: undefined;
        mode: string;
        note: string;
        cookie?: undefined;
    };
    needsCredential?: undefined;
    hidden?: undefined;
} | {
    own?: undefined;
    icon?: undefined;
    qualities?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    color: string;
    quality: string;
    needsCredential: boolean;
    auth: {
        deeplink?: undefined;
        qr?: undefined;
        mode: string;
        cookie: {
            where: string;
            keys: string;
            file?: undefined;
            field?: undefined;
            clear?: undefined;
        };
        note: string;
    };
    hidden?: undefined;
} | {
    own?: undefined;
    icon?: undefined;
    qualities?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    short: string;
    color: string;
    quality: string;
    needsCredential: boolean;
    auth: {
        deeplink?: undefined;
        qr?: undefined;
        mode: string;
        cookie: {
            where: string;
            keys: string;
            file: boolean;
            field: string;
            clear: {
                path: string;
                method: string;
            };
        };
        note?: undefined;
    };
    hidden?: undefined;
} | {
    own?: undefined;
    icon?: undefined;
    qualities?: undefined;
    short?: undefined;
    needsCredential?: undefined;
    id: string;
    prefix: string;
    label: string;
    aliases: string[];
    color: string;
    quality: string;
    hidden: boolean;
    auth: {
        deeplink?: undefined;
        qr?: undefined;
        cookie?: undefined;
        mode: string;
        note: string;
    };
})[];
/** 全部平台 id（含隐藏的），给测试与排障用 */
export declare function allPlatformIds(): string[];
declare const _default: {
    V2_FIELD: string;
    isV2Unlocked: typeof isV2Unlocked;
    v2Ready: typeof v2Ready;
    platformEnabled: typeof platformEnabled;
    platformMaxList: typeof platformMaxList;
    platformQualityPref: typeof platformQualityPref;
    platformFillEnabled: typeof platformFillEnabled;
    fillSourceIds: typeof fillSourceIds;
    qqSourceEnabled: typeof qqSourceEnabled;
    standaloneSourceIds: typeof standaloneSourceIds;
    enabledPlatforms: typeof enabledPlatforms;
    allPlatformIds: typeof allPlatformIds;
};
export default _default;
