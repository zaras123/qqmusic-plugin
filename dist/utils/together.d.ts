/** 能发原始 SSO 包的协议端；返回空串表示不支持（API 侧据此决定 via） */
export declare function togetherAdapter(e: any): "" | "icqq" | "onebot";
/** 能不能用一起听（只做本地能力/开关判断，业务判定在 API） */
export declare function togetherGate(e: any, cfg?: {}): {
    ok: boolean;
    reason: string;
} | {
    reason?: undefined;
    ok: boolean;
};
/**
 * 跑一轮一起听操作：插件驱动「API 算包 → 我发包 → 回报」的乒乓
 * @param {'manual'|'auto'|'probe'|'state'} action
 * @param {object} [song] action=manual/auto 时必填
 * @returns {Promise<{ok: boolean, message: string, silent?: boolean}>}
 */
export declare function runTogether(e: any, action: any, song: any): Promise<{
    ok: boolean;
    message: any;
    silent: boolean;
}>;
/**
 * 自动同步入口（deliverSong 收尾调用）
 *
 * 必须**同时**满足两个开关：togetherEnable（功能总开关）+ togetherAuto（点歌后自动同步）。
 * 总开关关着就不该有任何动作 —— 只看 togetherAuto 会让「总开关关、单独开了自动同步」
 * 的配置仍然发歌进房间。
 */
export declare function autoSyncTogether(e: any, song: any, cfg: any): Promise<{
    ok: boolean;
    message: any;
    silent: boolean;
}>;
