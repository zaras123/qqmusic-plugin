/**
 * 扫码登录
 */
declare const qqmusicLogin_base: any;
export declare class qqmusicLogin extends qqmusicLogin_base {
    constructor();
    /**
     * 2.0：外部平台扫码登录（网易云 / 酷狗 / 汽水）
     *
     * 流程三段，与 QQ 的扫码完全同构，只是上游换成 API 的 `/x/login/qrcode`：
     *   ① 取码 → 直接把 data URL 当图片发出去（三家上游都直接给图片，不用本地生成）
     *   ② 轮询 → 只看**状态变化**才回话（待扫 → 已扫码待确认 → 成功/过期），不刷屏
     *   ③ 成功 → 凭据由 **API 侧**写进存储（发命令那个人的槽位；扫码只限主人），这里只回执
     *      想让**全站**都用这一份 → 开「一律走主人账号」（① 基础设置）：之后所有请求都按
     *      主人槽位取凭据（回执里的 scope 说明由 API 给，插件不自己编）
     *
     * 未解锁时静默放行（return false）：这些命令在 1.9 里不存在。
     * 权限在 rule 上标了 master（扫码 = 账号级操作，扫完全站音源就换成那个号）。
     */
    platformQrLogin(e: any): Promise<boolean>;
    /**
     * 2.0：**粘贴凭据**（`#qqm网易ck <cookie>` / `#qqm酷我ck …` / `#qqmappleck <Netscape 全文>`）
     *
     * 为什么必须有这条通道：**不是每家都能扫码**（酷我 / Apple 只有这一条路），
     * 汽水的扫码还会被上游风控（error_code 2046）掐掉。以前这些情况只能让用户自己去
     * `curl -X POST /<平台>/cookies` —— 群里没人干得了，等于"这家的账号态配不了"。
     *
     * 凭据是**一人一份**（API 按 userKey 存：发命令的 QQ 号），所以：
     *   · 一律拒收群聊 —— 群里贴 cookie 等于把账号交给全群（还会留在群消息历史里）
     *   · 私聊里人人可配**自己那份**，互不覆盖；回执里**绝不复述 cookie 内容**
     *
     * 未解锁（？？？关着）时静默放行：1.9 里没有这条命令。
     */
    platformSetCookie(e: any): Promise<boolean>;
    /** 2.0：清掉**自己那份**凭据（`#qqm网易清ck`）—— 共享那份与别人的都不动 */
    platformClearCookie(e: any): Promise<boolean>;
    startQrLogin(e: any): Promise<boolean>;
    startPoll(e: any, qrcodeID: any, expiresIn: any): void;
    stopPoll(userId: any): void;
    /**
     * 浏览器无感扫码（**现在只剩 `#qqm登录`**）
     *
     * 2026-09-16：`#qqm登录微信` 已改走 `startQrLogin`（QQ音乐 App 扫码），
     * 因为浏览器换码通道拿不到「播放票据」（psrf_*）与 wid，播放链恒 104003。
     * 本方法保留作为回退路径：把上面那条规则的 fnc 改回 startWebQrLogin 即可，
     * 消息里带「微信」二字仍会触发下面的 PC 形状分支（wantWxMsg）。
     */
    startWebQrLogin(e: any): Promise<boolean>;
    /** webqr 会话轮询 */
    startWebQrPoll(e: any, sessionId: any, expiresIn: any, isWx?: boolean, apiMode?: string): void;
    loginStatus(e: any): Promise<boolean>;
    logout(e: any): Promise<boolean>;
    syncFromApi(e: any): Promise<boolean>;
    /** 主动续期 key */
    refreshKey(e: any): Promise<boolean>;
    bindManual(e: any): Promise<boolean>;
    importDeepLink(e: any): Promise<boolean>;
}
export {};
