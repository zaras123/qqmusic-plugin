/**
 * 平台注册表（**单一事实来源**）
 *
 * 为什么要有这个文件：平台信息原先散在四处 ——
 *   · `utils/api.js` 的 SOURCE_META（卡片上的名字/图标/颜色）
 *   · `utils/quality.js` / 各 provider 的音质口径
 *   · Karin WebUI schema 里手写的下拉项
 *   · 帮助卡里手抄的一行行文案
 * 加一家平台就得改四处，漏一处的表现是"卡片上显示 ne_xxxx 这种原始 id"。
 * 现在只在这里定义，其余地方**一律引用**。
 *
 * ⚠️ 本文件必须**保持纯净**（不 import Config、不读磁盘、不联网）：
 *   · Karin WebUI schema 会在配置界面打开时 import 它（要能独立跑）
 *   · 单测直接 import 它做静态断言
 * 「这家平台现在开没开、用什么音质」属于**配置**，在 utils/v2.js 里解析。
 *
 * `apiSource` = 调 API 时 `?source=` 用的名字，与 API 端 `util/providers/*` 的 name 一一对应；
 * 只有 API 注册过的平台才填（填错的表现是"点了这家但返回 400 不支持的平台"）。
 */
/**
 * 平台清单。顺序 = 帮助卡/Karin WebUI 里的展示顺序（QQ 在最前，其余按普及度排）。
 *
 * @typedef {object} Platform
 * @property {string} id          内部 id（= API 的 source 名）
 * @property {string} label       展示名（卡片、帮助、Karin WebUI 统一用它）
 * @property {string[]} aliases   命令别名（`#qqm<别名>点歌`，大小写不敏感）
 * @property {string} [short]     最短写法（帮助 / Karin WebUI 里给用户抄的那个，如「网易」「B站」「yt」）
 * @property {string} [icon]      来源图标（没有就用文字标签，别留空 src）
 * @property {string} color       品牌色（卡片角标用）
 * @property {string} quality     该平台**免登录**能拿到的档位（展示口径，与 API 一致）
 * @property {Array}  [qualities] 这家平台可点名要的档位（与 API `util/providers/index.js`
 *                                的 `QUALITY_OPTIONS` **一一对应**，Karin WebUI 的"音质档位"用它）
 * @property {boolean} [hidden]   true = 不在帮助 / Karin WebUI 里展示（但别名仍可解析）
 * @property {boolean} [own]      true = QQ 音乐本体
 * @property {object}  [auth]      凭据能力（**单一事实来源**：帮助卡 / Karin WebUI / 命令 / 状态卡都读它）
 *   · `mode`：`qr`（可扫码）| `cookie`（只能粘贴）| `file`（粘贴的是一份文件全文，如 Apple）| `none`（匿名，不需要凭据）
 *   · `qr`：`{ app }` —— 扫码用哪个 App；**有它才允许** `#qqm<平台>登录`
 *   · `cookie`：`{ where, keys, file?, post?, field?, clear? }` —— 粘贴入口的出处与关键字段；
 *     **有它才允许** `#qqm<平台>ck <cookie>`。API 侧的路径与字段名都有默认值
 *     （`POST /<id>/cookies` + `cookie` 字段），只有 Apple 例外（字段叫 `cookies`、清除走 DELETE）——
 *     默认值只在 platformCookieOf() 里算一次，**调用方不许再手写路径**
 *   · `deeplink`：true = 另有 deep link 导入通道（目前只有 QQ 本体）
 *   · `note`：给用户的一句人话（匿名平台用它说明"为什么不需要配"）
 */
export declare const PLATFORMS: readonly ({
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
/** id → 平台 */
export declare const PLATFORM_MAP: Readonly<{
    [k: string]: {
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
        /**
         * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
         * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
         *
         *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
         *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
         *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
         *
         * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
         * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
         */
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
    };
}>;
/** 帮助卡 / Karin WebUI 里展示的平台（hidden 的除外） */
export declare const VISIBLE_PLATFORMS: readonly ({
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
/** 真正能吃 `#qqm<平台>点歌` 的平台（QQ 本体走原有的 `#qqm点歌`，不在这里） */
export declare const SEARCH_PLATFORMS: readonly ({
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
/** 别名 → id；认不出返回空串（大小写不敏感） */
export declare function platformIdOf(name?: string): any;
/** 取平台对象（认不出返回 null） */
export declare function platformOf(name?: string): {
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
};
/**
 * 按 songmid 的**前缀**认平台（`ne_123` → netease）
 *
 * ⚠️ 别再手写 `^(ne|kw|bi)_`：那种写死清单在加平台时必漏（汽水 qs_/酷狗 ku_/咪咕 mg_/
 * YouTube yt_/Apple ap_/JioSaavn js_ 全都不在里面），漏掉的后果是**外源曲被当成 QQ 曲**
 * ——多打一次详情请求、还会拿 QQ 的档位阶梯去套它。
 */
export declare function platformOfMid(songmid?: string): {
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
};
/** 是不是外部平台曲目（前缀能认出来就算） */
export declare function isExternalMid(songmid?: string): boolean;
/** 展示名：认不出的**原样返回**（卡片上宁可显示 id 也别显示空白） */
export declare function platformLabel(name?: string): string;
/** 来源图标；没有图标的平台返回空串（模板据此走文字标签，别渲染空的 <img src="">） */
export declare function platformIcon(name?: string): string;
/** 品牌色（卡片角标/描边用）；未知平台给中性灰 */
export declare function platformColor(name?: string): string;
/** 该平台免登录能拿到的档位（未知平台空串） */
export declare function platformQuality(name?: string): string;
/** 最短写法（帮助 / Karin WebUI 里给用户抄的那个；没登记就退回 label） */
export declare function platformShort(name?: string): string;
/**
 * 该平台**可点名要**的档位（Karin WebUI"音质档位"下拉用它）
 *
 * ⚠️ 只有真能生效的才给多项 —— 数据源是 API 侧 `util/providers/index.js` 的
 * `QUALITY_OPTIONS`，两边要一起改。给一个点了没用的选择器比不给更糟。
 */
export declare function platformQualities(name?: string): {
    value: string;
    label: string;
}[];
/** 这家除了"自动"还有别的档位可选吗（没有就干脆不显示选择器） */
export declare function platformHasQualityChoice(name?: string): boolean;
/**
 * 归一化后的**凭据能力**（认不出的平台 = 匿名、什么都不能配）
 *
 * 单一事实来源：帮助卡 / Karin WebUI / 命令行 / 卡片文案都读它 —— 别再各自判断 `p.qrLogin`。
 * 形状固定，所以调用方不用到处写 `?.` 兜底。
 */
export declare function platformAuthOf(name?: string): {
    mode: any;
    qr: any;
    cookie: any;
    deeplink: boolean;
    note: any;
    anonymous: boolean;
};
/** 这家支持扫码登录吗（帮助/平台清单/登录命令共用这一份事实） */
export declare function platformCanQrLogin(name?: string): boolean;
/** 这家支持粘贴 cookie 吗（`#qqm<平台>ck <cookie>`） */
export declare function platformCanCookie(name?: string): boolean;
/**
 * 这家**没配凭据就用不了**吗（`needsCredential`）
 *
 * 与"能不能配凭据"是两件事，别混：
 *   · 酷狗/汽水/YouTube/Apple —— true：没配好整个音源就是关的（状态卡给红牌"未配置"）
 *   · B站/网易云/酷我 —— false：**不配也能用**（匿名档），配了只是拿到更高的档
 * 状态卡据此决定"红牌未配置"还是"免登录可用"，所以必须是一份事实、一个函数。
 */
export declare function platformNeedsCredential(name?: string): boolean;
/**
 * 凭据通道的**一句话标签**（帮助卡/状态卡的"这家怎么配"小标）
 *
 * 三种取值正好回答"哪几家能扫码、哪几家不能"：
 *   · `qr`     → 可扫码（有 `auth.qr`，命令是 `#qqm<平台>登录`）
 *   · `cookie` → 仅粘贴（只能粘，Apple 粘的是一整份文件 → 文案分开）
 *   · `none`   → 免凭据（没有账号体系，配了也没用）
 *
 * ⚠️ 色值的字段名是 `toneColor` 而**不是** `color`：这组字段会被 `...` 展开进
 *    平台条数据里，而那里已经有一个 `color`（**品牌色**）。叫 color 会把它覆盖掉，
 *    表现是"平台条的品牌色突然变成灰/绿"（这个 bug 就是这么写出来又抓回来的）。
 *
 * @returns {{tag:string, tone:'qr'|'cookie'|'none', toneColor:string}}
 */
export declare function platformAuthTag(name?: string): {
    tag: string;
    tone: string;
    toneColor: string;
};
/**
 * 扫码通道的元信息 —— 认不出/不能扫码回 null
 *
 * @returns {{app:string, command:string}|null} command = 给用户抄的那条命令（用**最短平台名**）
 */
export declare function platformQrOf(name?: string): {
    app: string;
    command: string;
};
/**
 * 粘贴凭据通道的元信息 —— 认不出/这家不收 cookie 回 null
 *
 * 命令 / 上传路径 / 字段名 / 清除方式**都在这里算一次**（以前散在 login.js、card-data.js、
 * Karin WebUI schema 三处，Apple 那个"字段叫 cookies、清除用 DELETE"的例外就漏过一次）。
 *
 * @returns {{command:string, clearCommand:string, where:string, keys:string, file:boolean,
 *            post:string, field:string, clear:{path:string, method:string}}|null}
 */
export declare function platformCookieOf(name?: string): {
    command: string;
    clearCommand: string;
    where: string;
    keys: string;
    file: boolean;
    post: any;
    field: string;
    clear: {
        path: string;
        method: string;
    };
};
/**
 * 粘贴 cookie 的说明（Karin WebUI 的 help 文案与命令的用法提示共用同一份文字）
 *
 * ⚠️ 结尾特意写明"私聊发"：凭据是**一人一份**存的（按发命令的 QQ 号），
 *    群里发等于把自己的账号凭据贴给全群看 —— 命令侧也会拒收（见 apps/login.js）。
 */
export declare function platformCookieHelp(name?: string): string;
/**
 * 粘贴凭据时"该贴什么"的**占位说明**（命令提示、Karin WebUI 文案共用一份）
 *
 * ⚠️ Apple 是 `file` 型，但**不等于"必须整份文件"**（2026-09-25 用户问"这个凭证我怎么拿"时发现）：
 *    API 侧现在也认 `media-user-token` 的**值**（DevTools 里复制的那一行/那一格），
 *    见 module/apple.js 的 toNetscapeCookieFile。所以提示要写"值（或整份文件）"，
 *    否则用户以为非得去装个导出扩展 —— 门槛比拿 cookie 本身还高。
 */
export declare function platformCookieValueHint(name?: string): string;
/** 能扫码的平台（帮助卡文案 + 测试断言用） */
export declare function qrPlatforms(): ({
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
/** 能粘贴 cookie 的平台（帮助卡文案 + 测试断言用） */
export declare function cookiePlatforms(): ({
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
    /**
     * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
     * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
     *
     *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
     *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
     *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
     *
     * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
     * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
     */
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
/**
 * 别名正则片段（拼进 `#qqm(…)点歌` 用）
 *
 * ⚠️ 长别名排前面：正则交替是"先匹配先赢"，`网易` 排在 `网易云` 前面时
 * 「#qqm网易云点歌」会被切成长度为 2 的平台名 + 关键词"云点歌"。
 */
export declare function platformAliasPattern({ includeOwn }?: {
    includeOwn?: boolean;
}): string;
/** 卡片/响应里用的元信息（与旧 `SOURCE_META` 同形状，保持兼容） */
export declare const SOURCE_META: Readonly<{
    [k: string]: {
        label: string;
        icon: string;
        color: string;
    };
}>;
/** id → 展示名（旧导出，保持兼容） */
export declare const SOURCE_LABEL: Readonly<{
    [k: string]: string;
}>;
declare const _default: {
    PLATFORMS: readonly ({
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
        /**
         * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
         * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
         *
         *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
         *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
         *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
         *
         * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
         * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
         */
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
    PLATFORM_MAP: Readonly<{
        [k: string]: {
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
            /**
             * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
             * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
             *
             *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
             *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
             *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
             *
             * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
             * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
             */
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
        };
    }>;
    VISIBLE_PLATFORMS: readonly ({
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
        /**
         * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
         * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
         *
         *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
         *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
         *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
         *
         * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
         * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
         */
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
    SEARCH_PLATFORMS: readonly ({
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
        /**
         * ⚠️ 这里以前写的是 `needsCredential: true` + `mode: 'none'`（"卡的是网络不是凭据，
         * 配 cookie 没用"）—— **后半句是错的**，2026-09-24 纠正：
         *
         *   · 必须配的是**出网代理** `YOUTUBE_PROXY`（国内直连是网络层封锁）—— 这一条不变；
         *   · 但 yt-dlp 支持 `--cookies`，带一份登录后的 cookies 能过三类以前**完全没办法**的情况：
         *     出口 IP 被风控（`Sign in to confirm you're not a bot`）、年龄限制、会员（Premium）曲目。
         *
         * 所以它是"配了更强"（needsCredential=false，状态卡显示"免登录可用"），
         * 而不是"没配用不了" —— 代理那件事由 API 侧的 unreliable 提示，别混成一个字段。
         */
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
    SOURCE_META: Readonly<{
        [k: string]: {
            label: string;
            icon: string;
            color: string;
        };
    }>;
    SOURCE_LABEL: Readonly<{
        [k: string]: string;
    }>;
    platformIdOf: typeof platformIdOf;
    platformOf: typeof platformOf;
    platformOfMid: typeof platformOfMid;
    isExternalMid: typeof isExternalMid;
    platformLabel: typeof platformLabel;
    platformIcon: typeof platformIcon;
    platformColor: typeof platformColor;
    platformQuality: typeof platformQuality;
    platformShort: typeof platformShort;
    platformQualities: typeof platformQualities;
    platformHasQualityChoice: typeof platformHasQualityChoice;
    platformAuthOf: typeof platformAuthOf;
    platformCanQrLogin: typeof platformCanQrLogin;
    platformQrOf: typeof platformQrOf;
    platformCanCookie: typeof platformCanCookie;
    platformCookieOf: typeof platformCookieOf;
    platformCookieValueHint: typeof platformCookieValueHint;
    platformNeedsCredential: typeof platformNeedsCredential;
    platformAuthTag: typeof platformAuthTag;
    platformCookieHelp: typeof platformCookieHelp;
    qrPlatforms: typeof qrPlatforms;
    cookiePlatforms: typeof cookiePlatforms;
    platformAliasPattern: typeof platformAliasPattern;
};
export default _default;
