/** 是否 thenable：Promise / 类 Promise / 任何带可调用 then 的对象 */
export declare function isThenable(value: any): boolean;
/**
 * 把「同步返回值 / thenable / Promise」归一成 Promise
 *
 * 注意：调用方 `fn()` **自己同步抛出**的异常发生在调用点、不在本函数里，
 * 想连同步抛一起兜就用 invoke()。
 */
export declare function toPromise(value: any): Promise<any>;
/**
 * 安全调用：函数不存在、或同步抛出，都变成 reject（而不是在调用点炸）
 * @param {Function} fn 目标函数
 * @param {any} thisArg
 * @param {...any} args
 * @returns {Promise<any>}
 */
export declare function invoke(fn: any, thisArg: any, ...args: any[]): Promise<any>;
/**
 * 归一后挂回调（等价于 `.then`，但同步值 / 同步抛都不会炸）
 */
export declare function thenSafe(value: any, onFulfilled: any, onRejected: any): Promise<any>;
/**
 * 定时器 + 异步回调：回调抛错自己接住，别让它变成 unhandledRejection
 * @returns {NodeJS.Timeout} 与 setTimeout 返回值一致，可直接 clearTimeout
 */
export declare function setSafeTimeout(fn: any, ms: any, tag?: string): NodeJS.Timeout;
/**
 * 这是不是一个 Karin（node-karin）事件
 *
 * Karin 的回复签名是 `e.reply(elements, { reply?, at?, recallMsg? })`。
 * 判据取「Karin 事件一定有 contact + bot.sendMsg」，加上实例标记兜底。
 */
export declare function isKarinEvent(e: any): boolean;
/**
 * 把 Karin 事件补成业务代码认识的样子
 *
 * Karin（node-karin）的事件自带 `user_id` / `self_id`（deprecated getter）、`msg`、
 * `isGroup`、`isMaster`，**但没有 `group_id`** —— 群号藏在 `e.contact.peer`（且只有
 * `contact.scene === 'group'` 时才是群）。插件里到处用 `e.group_id` 判群/私聊，
 * 这里在事件进业务代码前补一个只读 `group_id`，避免改一箩筐调用点。
 *
 * 幂等、不覆盖已有值、不碰非 Karin 事件。
 */
export declare function normalizeEvent(e: any): any;
/**
 * 幂等：只在 `e.reply` **缺失**时补一条通道
 *
 * 不动本来就有 reply 的事件 —— 免得影响同一条事件上后跑的其它插件。
 * 补完之后 `e.reply` 一定是 `async` 函数（一定返回 Promise），与两套框架装完后一致。
 */
export declare function ensureReply(e: any): any;
/**
 * 统一的「发消息」出口：永远返回 Promise，永远不抛
 * @param {any} e 事件
 * @param {any} msg 消息（空值直接 false，与框架的 reply 一致）
 * @returns {Promise<boolean>} 是否走通了发送通道（与框架「不抛就算发出去了」的口径一致）
 */
export declare function replySafe(e: any, msg: any, { quote, data, tag }?: {
    data?: {};
    quote?: boolean;
    tag?: string;
}): Promise<boolean>;
/**
 * 给**实例**套异步护栏（Karin 下唯一的入口：框架直接 `new` app 类，不走 index.js）
 *
 * 与 hardenPlugin 的差别：这里把包装定义成实例的**自有属性**，覆盖原型上的方法。
 * 因为 Karin 只 `new` 一次并直接调用 rule[].fnc，原型层改不改它不关心；
 * 实例层包住同样能保证「同步抛 / 异步 reject → 记日志 + false」。
 *
 * 幂等：已经套过的实例 / 已经带护栏标记的方法都跳过。
 * @param {object} instance 插件实例
 * @param {string} label 日志用名字（默认取类名）
 */
export declare function hardenInstance(instance: any, label?: string): any;
/**
 * 给插件类套异步护栏（返回子类，语义不变）
 *
 *   · 事件进处理函数前先 ensureReply(e) —— 让所有已有 `e.reply` 调用点都有一条可用通道
 *   · 处理函数的返回值统一成 Promise，并且**永不 reject**：错误在本插件侧记日志后返回 false
 *     → 框架 await 也好、不 await 也好，都不会漏出 unhandledRejection
 *
 * 生产入口主要走 `hardenInstance`；这个导出保留给离线测试与显式包装场景。
 *
 * @param {Function} cls 插件类
 * @param {string} label 日志用名字
 */
export declare function hardenPlugin(cls: any, label?: string): any;
