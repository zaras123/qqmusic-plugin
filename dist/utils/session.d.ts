export declare function getSession(scope: any): Promise<any>;
/** 取某人自己的会话（千人群里各点各的歌，互不干扰） */
export declare function getUserSession(scope: any, userId: any): Promise<any>;
export declare function setSession(scope: any, session: any, ttlSec?: number): Promise<any>;
/**
 * 取「与我相关」的会话：自己的优先，自己没有才退回群里最近一份。
 * @param {*} scope  群号（私聊为 QQ 号）
 * @param {*} userId 发送者
 * @param {(s: object|null) => any} has 会话是否可用，如 s => s?.data?.length
 * @returns {Promise<{ session: object|null, fallback: boolean }>} fallback=用的是别人的列表
 */
export declare function pickSession(scope: any, userId: any, has?: (s: any) => any): Promise<{
    session: any;
    fallback: boolean;
}>;
