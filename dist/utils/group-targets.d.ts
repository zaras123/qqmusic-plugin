export interface KarinGroupOption {
    label: string;
    value: string;
}
export interface KarinPlatformGroup {
    platform: string;
    name: string;
    uin: string;
    groups: Array<{
        group_id: string;
        name: string;
        bot: string;
    }>;
    error?: string;
}
/**
 * 返回 WebUI 直接可用的「适配器 → 群」结构。
 *
 * platform 里带账号，避免同一个适配器挂多个 bot 时 tab/选中状态互相覆盖；
 * uin 单独给出，发送时传回后端用于优先选择对应 bot。
 */
export declare function listKarinPlatformGroups(): Promise<KarinPlatformGroup[]>;
export declare function listKarinGroupOptions(): Promise<KarinGroupOption[]>;
