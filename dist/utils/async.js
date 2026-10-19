/**
 * 异步兼容层 —— 统一 Karin 事件补全、回复通道与异常护栏。
 *
 * 为什么需要（2026-09-24 对着两套框架源码实测）：
 *
 *  1. `e.reply` 在某些适配器事件上可能缺失，业务代码需要一条可用的发送兜底。
 *
 *  2. `e.reply` 的返回值形态不统一
 *     → 所以 `.then()` 不能直接挂上去，统一走 replySafe。
 *
 *  3. `setTimeout(async 回调)` 里的异常没人接 → unhandledRejection，
 *     只有框架 process 级的一行日志，业务侧既看不到也补不了（→ setSafeTimeout）。
 *
 *  4. 处理函数返回的 Promise 出错时，由插件自己的护栏记日志并返回 false。
 *
 * 本模块只做归一化，不改业务语义。
 */
import { logWarn, logError } from './log.js';
/** 是否 thenable：Promise / 类 Promise / 任何带可调用 then 的对象 */
export function isThenable(value) {
    return (value != null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof value.then === 'function');
}
/**
 * 把「同步返回值 / thenable / Promise」归一成 Promise
 *
 * 注意：调用方 `fn()` **自己同步抛出**的异常发生在调用点、不在本函数里，
 * 想连同步抛一起兜就用 invoke()。
 */
export function toPromise(value) {
    return Promise.resolve(value);
}
/**
 * 安全调用：函数不存在、或同步抛出，都变成 reject（而不是在调用点炸）
 * @param {Function} fn 目标函数
 * @param {any} thisArg
 * @param {...any} args
 * @returns {Promise<any>}
 */
export function invoke(fn, thisArg, ...args) {
    try {
        if (typeof fn !== 'function') {
            return Promise.reject(new TypeError(`不是可调用的函数：${String(fn)}`));
        }
        return Promise.resolve(fn.apply(thisArg, args));
    }
    catch (err) {
        return Promise.reject(err);
    }
}
/**
 * 归一后挂回调（等价于 `.then`，但同步值 / 同步抛都不会炸）
 */
export function thenSafe(value, onFulfilled, onRejected) {
    return toPromise(value).then(onFulfilled, onRejected);
}
/**
 * 定时器 + 异步回调：回调抛错自己接住，别让它变成 unhandledRejection
 * @returns {NodeJS.Timeout} 与 setTimeout 返回值一致，可直接 clearTimeout
 */
export function setSafeTimeout(fn, ms, tag = '定时任务') {
    return setTimeout(() => {
        invoke(fn, undefined).catch((err) => {
            logError(`${tag}异常: ${err?.message || err}`, err);
        });
    }, ms);
}
/** 打标记用：同一事件重复调用 ensureReply 不会重复包装 */
const REPLY_PATCHED = Symbol.for('qqmusic.replyPatched');
/**
 * 这是不是一个 Karin（node-karin）事件
 *
 * Karin 的回复签名是 `e.reply(elements, { reply?, at?, recallMsg? })`。
 * 判据取「Karin 事件一定有 contact + bot.sendMsg」，加上实例标记兜底。
 */
export function isKarinEvent(e) {
    if (!e || typeof e !== 'object')
        return false;
    if (e.__qqmKarin === true)
        return true;
    if (e.contact && typeof e.bot?.sendMsg === 'function')
        return true;
    return false;
}
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
export function normalizeEvent(e) {
    if (!e || typeof e !== 'object')
        return e;
    if (e.__qqmNormalized)
        return e;
    if (isKarinEvent(e)) {
        try {
            if (e.group_id == null && e.contact?.scene === 'group' && e.contact.peer != null) {
                Object.defineProperty(e, 'group_id', {
                    value: String(e.contact.peer),
                    writable: true,
                    configurable: true,
                    enumerable: false,
                });
            }
        }
        catch {
            /* 事件被冻结/密封：补不上就保持原样 */
        }
    }
    try {
        Object.defineProperty(e, '__qqmNormalized', { value: true, enumerable: false, configurable: true });
    }
    catch {
        /* ignore */
    }
    return e;
}
/**
 * 按适配器的实际能力，给「没有 reply」的事件退出一条可用通道
 *
 *   · e.bot.sendMsg(e.contact, elements) —— Karin（node-karin）原生
 *   · e.group.sendMsg / e.friend.sendMsg —— oicq / ICQQ 原生
 */
function buildFallbackReply(e) {
    const bot = e.bot || null;
    // Karin：bot.sendMsg(contact, elements)
    if (e.contact && typeof bot?.sendMsg === 'function') {
        return (msg) => bot.sendMsg(e.contact, msg);
    }
    if (typeof e.group?.sendMsg === 'function')
        return (msg) => e.group.sendMsg(msg);
    if (typeof e.friend?.sendMsg === 'function')
        return (msg) => e.friend.sendMsg(msg);
    return null;
}
/**
 * 幂等：只在 `e.reply` **缺失**时补一条通道
 *
 * 不动本来就有 reply 的事件 —— 免得影响同一条事件上后跑的其它插件。
 * 补完之后 `e.reply` 一定是 `async` 函数（一定返回 Promise），与两套框架装完后一致。
 */
export function ensureReply(e) {
    if (!e || typeof e !== 'object')
        return e;
    if (typeof e.reply === 'function' || e[REPLY_PATCHED])
        return e;
    const fallback = buildFallbackReply(e);
    if (!fallback)
        return e;
    try {
        Object.defineProperty(e, 'reply', {
            value: async (msg, quote = false, data = {}) => {
                if (!msg)
                    return false;
                return await fallback(msg, quote, data);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        });
        Object.defineProperty(e, REPLY_PATCHED, { value: true, enumerable: false });
    }
    catch {
        /* 事件被冻结/密封：补不上就保持原样，交给 replySafe 记日志 */
    }
    return e;
}
/**
 * 统一的「发消息」出口：永远返回 Promise，永远不抛
 * @param {any} e 事件
 * @param {any} msg 消息（空值直接 false，与框架的 reply 一致）
 * @returns {Promise<boolean>} 是否走通了发送通道（与框架「不抛就算发出去了」的口径一致）
 */
export async function replySafe(e, msg, { quote = false, data = {}, tag = '发送' } = {}) {
    if (!msg)
        return false;
    ensureReply(e);
    if (typeof e?.reply !== 'function') {
        logWarn(`${tag}失败：当前适配器没有可用的回复通道，消息未发出`);
        return false;
    }
    try {
        await e.reply(msg, { reply: Boolean(quote), ...data });
        return true;
    }
    catch (err) {
        logWarn(`${tag}失败: ${err?.message || err}`);
        return false;
    }
}
/** 护栏包装的标记：同一个方法不会被套两层（hardenInstance / hardenPlugin 共用） */
const GUARD_FLAG = '__qqmGuard';
/**
 * 把一个处理方法包成「同步抛 / 异步 reject 都记日志并返回 false」
 * @param {Function} fn 原始方法
 * @param {string} label 日志用插件名
 * @param {string} name 方法名
 */
function wrapGuard(fn, label, name) {
    const guarded = function hardenedHandler(...args) {
        try {
            normalizeEvent(args[0]);
            ensureReply(args[0]);
        }
        catch {
            /* 归一/补通道失败不影响主流程 */
        }
        let ret;
        try {
            ret = fn.apply(this, args);
        }
        catch (err) {
            logError(`[${label}.${name}] 同步异常: ${err?.message || err}`, err);
            return false;
        }
        if (!isThenable(ret))
            return ret;
        return Promise.resolve(ret).catch((err) => {
            logError(`[${label}.${name}] 异步异常: ${err?.message || err}`, err);
            return false;
        });
    };
    Object.defineProperty(guarded, GUARD_FLAG, { value: true, enumerable: false });
    return guarded;
}
/** 收集实例 rule/task 里声明的方法名（accept 总是收） */
function handlerNamesOf(inst) {
    const names = new Set(['accept']);
    const declared = new Set();
    try {
        for (const r of inst?.rule || []) {
            if (r?.fnc) {
                names.add(r.fnc);
                declared.add(r.fnc);
            }
        }
        for (const t of [].concat(inst?.task || [])) {
            if (t?.fnc) {
                names.add(t.fnc);
                declared.add(t.fnc);
            }
        }
    }
    catch {
        /* rule/task 形状不标准就只覆盖 accept */
    }
    return { names, declared };
}
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
export function hardenInstance(instance, label = 'plugin') {
    if (!instance || typeof instance !== 'object')
        return instance;
    if (instance.__qqmHardenedInstance)
        return instance;
    const { names, declared } = handlerNamesOf(instance);
    for (const n of names) {
        if (!n)
            continue;
        const fn = instance[n];
        if (typeof fn !== 'function') {
            if (declared.has(n))
                logWarn(`[${label}] rule/task 指向的方法不存在，护栏跳过: ${n}`);
            continue;
        }
        // 原型层已经套过（hardenPlugin 先跑）就不要再套一层
        if (fn[GUARD_FLAG])
            continue;
        try {
            Object.defineProperty(instance, n, {
                value: wrapGuard(fn, label, n),
                writable: true,
                configurable: true,
                enumerable: false,
            });
        }
        catch {
            /* 实例被冻结/密封：保持原方法，交给调用点自己兜 */
        }
    }
    try {
        Object.defineProperty(instance, '__qqmHardenedInstance', { value: true, enumerable: false });
    }
    catch {
        /* ignore */
    }
    return instance;
}
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
export function hardenPlugin(cls, label = 'plugin') {
    if (typeof cls !== 'function' || !cls.prototype)
        return cls;
    if (cls.__qqmHardened)
        return cls;
    const proto = cls.prototype;
    let names = new Set(['accept']);
    let declaredFnc = new Set();
    try {
        const inst = new cls();
        const got = handlerNamesOf(inst);
        names = got.names;
        declaredFnc = got.declared;
    }
    catch (err) {
        logWarn(`[${label}] 读取 rule 失败，异步护栏只覆盖 accept: ${err?.message || err}`);
    }
    const overrides = {};
    for (const n of names) {
        if (!n)
            continue;
        const fn = proto[n];
        if (typeof fn !== 'function') {
            if (declaredFnc.has(n))
                logWarn(`[${label}] rule/task 指向的方法不存在，护栏跳过: ${n}`);
            continue;
        }
        // 原型上已经套过（比如类本身又被包了一次）就跳过，避免重复套娃
        if (fn[GUARD_FLAG])
            continue;
        overrides[n] = wrapGuard(fn, label, n);
    }
    const Hardened = class extends cls {
    };
    for (const [n, fn] of Object.entries(overrides)) {
        Object.defineProperty(Hardened.prototype, n, {
            value: fn,
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    Object.defineProperty(Hardened, '__qqmHardened', { value: true, enumerable: false });
    Object.defineProperty(Hardened, '__qqmBase', { value: cls, enumerable: false });
    return Hardened;
}
//# sourceMappingURL=async.js.map