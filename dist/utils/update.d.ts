export declare function isGitRepo(): boolean;
/**
 * 判定插件是怎么装的。git 优先，因为源码目录也可能同时存在于 Karin 的 plugins/ 下；
 * 没有 .git 时，再看插件是否来自 Karin 根目录的 node_modules。
 */
export declare function classifyUpdateMode({ hasGit, pluginDir, karinDir, packageName, rootPackage, }?: {
    hasGit?: boolean;
    karinDir?: string;
    packageName?: string;
    pluginDir?: string;
    rootPackage?: any;
}): "git" | "npm" | "unknown";
export declare function getUpdateMode(): "git" | "npm" | "unknown";
export declare function getLocalVersion(): string;
/**
 * 2.0 占位版本号（**只在"发版前 + 解锁"这一格里用**）
 *
 * 需求原话：「版本也变，这个是 2.0 专属的，没开？？？之前和 2.0 之前一样」。
 * 那说的是**发版前**：包版本还在 1.x，但解锁的人应该先看到 2.0。
 *
 * ⚠️ 2026-09-24 改：**发版之后版本号就照实显示**（见 pickDisplayVersion）。
 *    原来"发版后 + 没解锁 → 顶一个冻结的 1.10.5"是为了假装还停在 2.0 之前，
 *    但 2.0 已经发出去了 —— 再冻结等于对自己撒谎（主人自己就撞上过
 *    "更新完了、帮助卡右上角版本号却没动"，还以为没更新成功）。
 *    闸门管的是**功能**（新命令、新帮助卡、Karin WebUI 分组），版本号照实说。
 */
export declare const V2_DISPLAY_VERSION = "2.0.0";
/**
 * 展示版本的计算（纯函数，四个象限都可测）
 *
 *   发版前 → 解锁 = V2_DISPLAY_VERSION；没解锁 = 真实包版本（那时它就是 1.x）
 *   发版后 → **一律真实包版本**（解锁与否都一样：装成 1.x 只会骗到主人自己）
 *
 * 为什么不直接拿 package.json 的 version 当展示版本（发版前那一格）：那个 version 是
 * **更新器**的判据（git pull 前后比对包版本），而"发版前解锁的人先看到 2.0"是产品口径 ——
 * 两者只在发版前那一段不同，别合并。
 *
 * @param {string} local package.json 里的版本
 * @param {boolean} unlocked 闸门是否打开
 * @returns {string} 不带 `v` 前缀的版本号
 */
export declare function pickDisplayVersion(local: any, unlocked: any): string;
/**
 * 对外展示的版本号（发版后 = 真实包版本；发版前解锁 = 2.0 占位号）
 *
 * @param {object} [cfg] 配置（不给就现读 qqmusic 配置）
 * @returns {string} 形如 `v2.0.0` / `v1.10.5`
 */
export declare function displayVersion(cfg?: any): string;
/**
 * 更新插件
 * @param {{ force?: boolean }} opts
 */
export declare function updatePlugin({ force }?: {
    force?: boolean;
}): Promise<{
    ok: boolean;
    mode: string;
    oldVersion: string;
    message: string;
    already?: undefined;
    changed?: undefined;
    newVersion?: undefined;
    remoteVersion?: undefined;
} | {
    ok: boolean;
    already: boolean;
    changed: boolean;
    mode: string;
    oldVersion: string;
    newVersion: string;
    remoteVersion: string;
    message: string;
} | {
    already?: undefined;
    changed?: undefined;
    newVersion?: undefined;
    ok: boolean;
    mode: string;
    oldVersion: string;
    remoteVersion: string;
    message: string;
} | {
    already?: undefined;
    changed?: undefined;
    newVersion?: undefined;
    ok: boolean;
    updating: boolean;
    message: string;
    oldCommit?: undefined;
    newCommit?: undefined;
    oldVersion?: undefined;
    time?: undefined;
    branch?: undefined;
    remoteUrl?: undefined;
    dep?: undefined;
} | {
    already?: undefined;
    changed?: undefined;
    newVersion?: undefined;
    updating?: undefined;
    ok: boolean;
    message: string;
    oldCommit?: undefined;
    newCommit?: undefined;
    oldVersion?: undefined;
    time?: undefined;
    branch?: undefined;
    remoteUrl?: undefined;
    dep?: undefined;
} | {
    already?: undefined;
    changed?: undefined;
    newVersion?: undefined;
    updating?: undefined;
    ok: boolean;
    message: string;
    remoteUrl: string;
    branch: string;
    oldCommit: string;
    oldVersion: string;
    newCommit?: undefined;
    time?: undefined;
    dep?: undefined;
} | {
    already?: undefined;
    changed?: undefined;
    updating?: undefined;
    ok: boolean;
    message: string;
    remoteUrl: string;
    branch: string;
    oldCommit: string;
    newCommit: string;
    oldVersion: string;
    newVersion: string;
    time?: undefined;
    dep?: undefined;
} | {
    updating?: undefined;
    ok: boolean;
    already: boolean;
    changed: boolean;
    message: string;
    oldCommit: string;
    newCommit: string;
    oldVersion: string;
    newVersion: string;
    time: string;
    branch: string;
    remoteUrl: string;
    dep: {
        ran: boolean;
        ok: boolean;
        message: string;
    };
}>;
/**
 * 更新日志
 * @param {{ since?: string, limit?: number }} opts
 */
export declare function getUpdateLog({ since, limit }?: {
    limit?: number;
    since?: string;
}): Promise<{
    ok: boolean;
    mode: string;
    lines: any[];
    message: string;
} | {
    mode?: undefined;
    ok: boolean;
    lines: any[];
    message: string;
}>;
