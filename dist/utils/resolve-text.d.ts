/**
 * QQ 音乐分享消息的文本提取与识别。
 *
 * Karin 的 JSON/XML 卡片通常只放在 `e.elements` 里，`e.msg` 和
 * `e.rawMessage` 可能都是空串；因此不能只看消息文本字段。
 */
export declare function collectMessageText(e: any): string;
export declare function isQQMusicMessage(text: any): boolean;
