/** 判断配置值是本地路径还是远端地址（纯函数） */
export declare function classifyBgInput(value: any): "" | "file" | "remote";
/**
 * 从图片 API 的返回里挑出图片地址（纯函数）
 * 覆盖常见形状：{url} / {data:{url}} / {data:[{url}]} / {imgurl} / {images:[…]} / 纯 URL 字符串
 */
export declare function pickImageUrl(payload: any, depth?: number): any;
/**
 * 缓存是否该刷新（纯函数）
 * ttlMin 为 0 或负数 → 每次都刷新；meta 缺失 → 刷新
 */
export declare function shouldRefresh(meta: any, ttlMin: any, now?: number): boolean;
/**
 * 解析出本次要用的背景
 * @param {object} cfg 插件配置（读 uiBgEnable / uiBgValue / uiBgCacheMin）
 * @returns {Promise<{url:string, source:'file'|'remote', from:string, path:string}|null>}
 *   任何失败都返回 null —— 由调用方回落到主题自带的时段底色，绝不影响发卡
 */
export declare function resolveBackground(cfg?: {}): Promise<{
    url: string;
    source: string;
    from: string;
    path: string;
}>;
/** 给命令/设置页显示用的一句话状态（不触发网络） */
export declare function describeBackground(cfg?: {}): string;
