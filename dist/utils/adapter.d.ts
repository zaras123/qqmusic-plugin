/**
 * 适配器识别（Karin / node-karin）
 *
 * Karin 的事件带 `e.contact` + `e.bot.sendMsg`，协议族挂在 `e.bot.adapter.protocol`
 * （见 node-karin AdapterType）。本模块只做「这条事件走哪条发送路径」的判断，
 * 不依赖任何宿主全局 —— 拿不到就退到 unknown / 通用段。
 */
/**
 * @param {any} e
 * @returns {{
 *   id: string,
 *   name: string,
 *   kind: 'icqq' | 'onebot' | 'qqbot' | 'unknown',
 *   selfId: string|number|undefined,
 *   supportsNativeMusic: boolean,
 *   supportsRecord: boolean,
 *   supportsGroupFile: boolean,
 *   preferSegmentFile: boolean,
 * }}
 */
export declare function detectAdapter(e: any): {
    id: string;
    name: string;
    kind: string;
    selfId: any;
    supportsNativeMusic: boolean;
    supportsRecord: boolean;
    supportsGroupFile: boolean;
    preferSegmentFile: boolean;
};
/**
 * 取 Karin 的 segment 构造器。
 *
 * 只使用 node-karin 提供的 segment；离线测试 / 预览时给最小 stub。
 * 返回模块级缓存，不再挂到 global.segment。
 */
export declare function ensureSegment(): Promise<any>;
/**
 * 把本地路径规范成各适配器更易吃的 file 字段
 * - 绝对路径
 * - file://（部分 OneBot）
 * - 原样 http / base64
 */
export declare function normalizeMediaFile(fileOrUrl: any): any;
export declare function isLocalPath(file: any): boolean;
