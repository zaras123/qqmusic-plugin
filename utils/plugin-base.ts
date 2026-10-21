/**
 * Karin 插件基类加载器。
 *
 * 运行在 Karin 时直接使用 `node-karin` 的 Plugin；离线测试 / 预览脚本拿不到
 * node-karin 时退到本地 stub。这里不依赖其它框架的插件基类路径。
 */
import { hardenInstance } from './async.js'

let cached = null
let pending = null
let karinHost = false

function makeStub() {
  class PluginStub {
    constructor(options = {}) {
      Object.assign(this, options)
      this.rule ||= []
      this.priority ??= 10000
      this.event ??= 'message'
      this.e ||= {}
      this.next ||= () => {}
    }

    async reply(msg, ...rest) {
      return { ok: false, stub: true, msg, rest }
    }
  }
  Object.defineProperty(PluginStub, '__qqmStub', { value: true, enumerable: false })
  return PluginStub
}

async function doLoad() {
  try {
    const karin = await import('node-karin')
    if (karin?.Plugin) {
      karinHost = true
      return karin.Plugin
    }
  } catch {
    /* 离线测试 / 预览 */
  }
  return makeStub()
}

function wrapBase(Base) {
  const isStub = Boolean(Base?.__qqmStub)

  class QQMusicPluginBase extends Base {
    constructor(...args) {
      super(...args)
      try {
        Object.defineProperty(this, '__qqmKarin', {
          value: karinHost,
          enumerable: false,
          configurable: true,
        })
      } catch {
        /* 实例被冻结时不影响业务 */
      }
      hardenInstance(this, this.constructor?.name || 'plugin')
    }
  }

  // node-karin 的 Plugin 原型不带 reply；旧的 Yunzai 基类带。
  // 业务 handler 主要用 e.reply，但插件实例上保留同一个调用形状，
  // 既兼容测试/旧代码，也不会在 Karin 下变成一个 undefined。
  if (typeof QQMusicPluginBase.prototype.reply !== 'function') {
    Object.defineProperty(QQMusicPluginBase.prototype, 'reply', {
      value: async function reply(msg, ...rest) {
        const replyFn = this?.e?.reply
        if (typeof replyFn !== 'function' || !msg) return false
        return replyFn.call(this.e, msg, ...rest)
      },
      writable: true,
      configurable: true,
      enumerable: false,
    })
  }

  Object.defineProperty(QQMusicPluginBase, '__qqmKarin', {
    value: karinHost,
    enumerable: false,
  })
  if (isStub) {
    Object.defineProperty(QQMusicPluginBase, '__qqmStub', {
      value: true,
      enumerable: false,
    })
  }
  return QQMusicPluginBase
}

/** 异步加载插件基类；并发调用共享同一个 Promise。 */
export function loadPluginBase() {
  if (pending) return pending
  pending = doLoad().then(
    (base) => {
      cached = wrapBase(base)
      return cached
    },
    (err) => {
      pending = null
      throw err
    }
  )
  return pending
}

/** 同步读取已加载的基类。 */
export function pluginBaseSync() {
  return cached
}

/** 当前基类是否是离线 stub。 */
export function isStubBase() {
  return Boolean(cached?.__qqmStub)
}

loadPluginBase().catch(() => {})
