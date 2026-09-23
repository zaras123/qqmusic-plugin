/**
 * 异步兼容层 —— 把「两套框架对异步的约定不一致」这件事收在一个模块里。
 *
 * 为什么需要（2026-09-24 对着两套框架源码实测）：
 *
 *  1. `e.reply` 不是永远存在
 *     · TRSS `lib/plugins/loader.js:415` 的 reply 包装有前置判断 `if (!e.reply?.bind) return`
 *       —— **适配器没提供 reply 时它根本不装**，于是 `e.reply` 是 undefined，
 *       业务侧 `await e.reply(...)` 直接抛 `TypeError: e.reply is not a function`，
 *       用户端一条反馈都收不到，只在框架日志里留一行。
 *     · Miao（`lib/plugins/loader.js:474/538`）两个分支都会装上，所以只在 TRSS 侧暴露。
 *
 *  2. `e.reply` 的返回值形态不统一
 *     · 装上之后两边都是 `async` 函数 → 返回 Promise；
 *     · 但插件基类的 `reply()`（Miao `lib/plugins/plugin.js:72`）在 `!this.e?.reply`
 *       或 msg 为空时**同步**返回 `false`。
 *     → 所以 `.then()` 不能直接挂上去（apps/chart.js 的 MV 发送踩过，已换成 replySafe）。
 *       静态闸：scripts/check-async.mjs（接在 test.mjs 的语法检查段之后）。
 *
 *  3. `setTimeout(async 回调)` 里的异常没人接 → unhandledRejection，
 *     只有框架 process 级的一行日志，业务侧既看不到也补不了（→ setSafeTimeout）。
 *
 *  4. 处理函数返回的 Promise，框架**不一定** await（老 Yunzai 分支 / 第三方加载器）
 *     → 同样掉进 unhandledRejection。兜底应该在插件自己这边（→ hardenPlugin）。
 *
 * 本模块只做归一化，不改业务语义。
 */
import { logWarn, logError } from './log.js'

/** 是否 thenable：Promise / 类 Promise / 任何带可调用 then 的对象 */
export function isThenable(value) {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
  )
}

/**
 * 把「同步返回值 / thenable / Promise」归一成 Promise
 *
 * 注意：调用方 `fn()` **自己同步抛出**的异常发生在调用点、不在本函数里，
 * 想连同步抛一起兜就用 invoke()。
 */
export function toPromise(value) {
  return Promise.resolve(value)
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
      return Promise.reject(new TypeError(`不是可调用的函数：${String(fn)}`))
    }
    return Promise.resolve(fn.apply(thisArg, args))
  } catch (err) {
    return Promise.reject(err)
  }
}

/**
 * 归一后挂回调（等价于 `.then`，但同步值 / 同步抛都不会炸）
 */
export function thenSafe(value, onFulfilled, onRejected) {
  return toPromise(value).then(onFulfilled, onRejected)
}

/**
 * 定时器 + 异步回调：回调抛错自己接住，别让它变成 unhandledRejection
 * @returns {NodeJS.Timeout} 与 setTimeout 返回值一致，可直接 clearTimeout
 */
export function setSafeTimeout(fn, ms, tag = '定时任务') {
  return setTimeout(() => {
    invoke(fn, undefined).catch((err) => {
      logError(`${tag}异常: ${err?.message || err}`, err)
    })
  }, ms)
}

/** 打标记用：同一事件重复调用 ensureReply 不会重复包装 */
const REPLY_PATCHED = Symbol.for('qqmusic.replyPatched')

/**
 * 按适配器的实际能力，给「没有 reply」的事件退出一条可用通道
 *
 *   · e.group.sendMsg / e.friend.sendMsg —— oicq / ICQQ 原生
 *   · bot.sendApi('send_group_msg' | 'send_private_msg') —— OneBot 反向 WS
 *     （复用 utils/send.js 的 botSendApi，那里已经处理了 TRSS 的绑定差异；
 *       动态 import 是为了避开 send.js → async.js 的循环依赖）
 */
function buildFallbackReply(e) {
  if (typeof e.group?.sendMsg === 'function') return (msg) => e.group.sendMsg(msg)
  if (typeof e.friend?.sendMsg === 'function') return (msg) => e.friend.sendMsg(msg)

  const bot = e.bot || (e.self_id != null ? global.Bot?.[e.self_id] : null)
  const id = e.group_id || e.user_id
  if (typeof bot?.sendApi === 'function' && id != null) {
    const action = e.group_id ? 'send_group_msg' : 'send_private_msg'
    const key = e.group_id ? 'group_id' : 'user_id'
    return async (msg) => {
      const { botSendApi } = await import('./send.js')
      return botSendApi(e, action, {
        [key]: String(id),
        message: Array.isArray(msg) ? msg : String(msg),
      })
    }
  }
  return null
}

/**
 * 幂等：只在 `e.reply` **缺失**时补一条通道
 *
 * 不动本来就有 reply 的事件 —— 免得影响同一条事件上后跑的其它插件。
 * 补完之后 `e.reply` 一定是 `async` 函数（一定返回 Promise），与两套框架装完后一致。
 */
export function ensureReply(e) {
  if (!e || typeof e !== 'object') return e
  if (typeof e.reply === 'function' || e[REPLY_PATCHED]) return e

  const fallback = buildFallbackReply(e)
  if (!fallback) return e

  try {
    Object.defineProperty(e, 'reply', {
      value: async (msg, quote = false, data = {}) => {
        if (!msg) return false
        return await fallback(msg, quote, data)
      },
      writable: true,
      configurable: true,
      enumerable: false,
    })
    Object.defineProperty(e, REPLY_PATCHED, { value: true, enumerable: false })
  } catch {
    /* 事件被冻结/密封：补不上就保持原样，交给 replySafe 记日志 */
  }
  return e
}

/**
 * 统一的「发消息」出口：永远返回 Promise，永远不抛
 * @param {any} e 事件
 * @param {any} msg 消息（空值直接 false，与框架的 reply 一致）
 * @returns {Promise<boolean>} 是否走通了发送通道（与框架「不抛就算发出去了」的口径一致）
 */
export async function replySafe(e, msg, { quote = false, data = {}, tag = '发送' } = {}) {
  if (!msg) return false
  ensureReply(e)
  if (typeof e?.reply !== 'function') {
    logWarn(`${tag}失败：当前适配器没有可用的回复通道，消息未发出`)
    return false
  }
  try {
    await e.reply(msg, quote, data)
    return true
  } catch (err) {
    logWarn(`${tag}失败: ${err?.message || err}`)
    return false
  }
}

/**
 * 给插件类套异步护栏（返回子类，语义不变）
 *
 *   · 事件进处理函数前先 ensureReply(e) —— 让所有已有 `e.reply` 调用点都有一条可用通道
 *   · 处理函数的返回值统一成 Promise，并且**永不 reject**：错误在本插件侧记日志后返回 false
 *     → 框架 await 也好、不 await 也好，都不会漏出 unhandledRejection
 *
 * 为什么能在这里一处上锁：两套框架的加载器都**优先**拿 `plugins/<名>/index.js` 当入口
 *（TRSS `lib/plugins/loader.js:55`、Miao `lib/plugins/loader.js:61`），本插件的 index.js
 * 是所有 app 类汇合的唯一出口 —— 一处上锁，两边同时生效。
 *
 * @param {Function} cls 插件类
 * @param {string} label 日志用名字
 */
export function hardenPlugin(cls, label = 'plugin') {
  if (typeof cls !== 'function' || !cls.prototype) return cls
  if (cls.__qqmHardened) return cls

  const proto = cls.prototype
  const names = new Set(['accept'])
  /** 只记「插件自己声明的」方法名 —— accept 是可选的（只有 resolve.js 实现），
   *  没实现就静默跳过，别拿它去报警告刷日志 */
  const declaredFnc = new Set()

  // 规则/定时任务的方法名：从实例的 rule / task 里读，别手抄
  try {
    const inst = new cls()
    for (const r of inst.rule || []) if (r?.fnc) { names.add(r.fnc); declaredFnc.add(r.fnc) }
    for (const t of [].concat(inst.task || [])) if (t?.fnc) { names.add(t.fnc); declaredFnc.add(t.fnc) }
  } catch (err) {
    logWarn(`[${label}] 读取 rule 失败，异步护栏只覆盖 accept: ${err?.message || err}`)
  }

  const overrides = {}
  for (const n of names) {
    if (!n) continue
    const fn = proto[n]
    if (typeof fn !== 'function') {
      if (declaredFnc.has(n)) logWarn(`[${label}] rule/task 指向的方法不存在，护栏跳过: ${n}`)
      continue
    }
    overrides[n] = function hardenedHandler(...args) {
      try {
        ensureReply(args[0])
      } catch {
        /* 补通道失败不影响主流程 */
      }
      let ret
      try {
        ret = fn.apply(this, args)
      } catch (err) {
        logError(`[${label}.${n}] 同步异常: ${err?.message || err}`, err)
        return false
      }
      if (!isThenable(ret)) return ret
      return Promise.resolve(ret).catch((err) => {
        logError(`[${label}.${n}] 异步异常: ${err?.message || err}`, err)
        return false
      })
    }
  }

  const Hardened = class extends cls {}
  for (const [n, fn] of Object.entries(overrides)) {
    Object.defineProperty(Hardened.prototype, n, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    })
  }
  Object.defineProperty(Hardened, '__qqmHardened', { value: true, enumerable: false })
  Object.defineProperty(Hardened, '__qqmBase', { value: cls, enumerable: false })
  return Hardened
}
