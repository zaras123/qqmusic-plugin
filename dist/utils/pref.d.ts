/** 读偏好（认不出就是 {}，调用方用默认值兜） */
export declare function getPref(scope: any): Promise<any>;
/** 合并写偏好 */
export declare function setPref(scope: any, patch?: {}): Promise<any>;
/** 显式清一个键（`#qqm源 默认` 用；不写空对象，免得留个空壳进 Redis） */
export declare function clearPref(scope: any, name: any): Promise<any>;
