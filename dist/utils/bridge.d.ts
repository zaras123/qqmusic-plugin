/**
 * 主动发消息桥：定时点歌 / 订阅推送在没有原始消息事件时，按群号找 Karin
 * 的 bot + contact，并合成一个够下游链路使用的群事件。
 */
/** 列出当前在线的全部 bot：[selfId, bot]。 */
export declare function botsListAsync(): Promise<any[]>;
/**
 * 找群发送通道。
 * @returns {Promise<{bot:object, contact:object, selfId:string}|null>}
 */
export declare function pickChannelForGroup(groupId: any, preferUin?: string): Promise<{
    bot: any;
    contact: import("node-karin").GroupContact;
    selfId: string;
}>;
/**
 * 合成群事件：下游读 selfId / contact / bot / groupId / userId 与 reply。
 */
export declare function groupEventOf({ groupId, preferUin, userId }?: {
    preferUin?: string;
    userId?: string;
}): Promise<{
    selfId: string;
    contact: import("node-karin").GroupContact;
    bot: any;
    userId: string;
    groupId: string;
    isGroup: boolean;
    isPrivate: boolean;
    isMaster: boolean;
    self_id: string;
    user_id: string;
    group_id: string;
    reply: (msg: any) => Promise<boolean>;
}>;
/** 把任意消息（文本 / segment / 数组）发进群。 */
export declare function sendToGroup(groupId: any, msg: any, preferUin?: string): Promise<boolean>;
