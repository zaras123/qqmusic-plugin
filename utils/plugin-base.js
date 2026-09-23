/**
 * 加载 Yunzai 插件基类（兼容 ESM + top-level await）
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let cached = null
/** 进行中/已完成的加载 Promise —— 并发调用共享同一个（见下方注释） */
let pending = null

async function doLoad() {
  const candidates = [
    path.join(process.cwd(), 'lib/plugins/plugin.js'),
    path.join(process.cwd(), 'lib/plugins/plugin.ts'),
    path.join(process.cwd(), 'lib/plugins/plugin.mjs'),
  ]

  for (const p of candidates) {
    try {
      // 必须转成 file:// URL：Windows 下绝对路径（D:\...）会被 ESM 当成 URL，
      // 报「不支持 d: 协议」而全部加载失败（Linux 上恰好能过，所以只在本地测试时暴露）
      const mod = await import(pathToFileURL(p).href)
      return mod.default || mod.plugin || mod
    } catch {
      // 继续尝试下一个
    }
  }

  // 回退相对路径
  try {
    const mod = await import('../../../lib/plugins/plugin.js')
    return mod.default || mod.plugin || mod
  } catch (e) {
    throw new Error(`无法加载 Yunzai plugin 基类: ${e.message}`)
  }
}

/**
 * 异步加载插件基类（使用 import() 兼容 ESM）
 *
 * ⚠️ 必须做并发去重：7 个 app 模块是被 index.js 用 `Promise.allSettled(import(...))`
 * **同时**拉起来的，每个模块顶层都 `await loadPluginBase()`，于是 7 个调用会在
 * `cached` 还没写上的那一瞬间一起进来，各自把候选路径 walk 一遍（最坏情况
 * 7 × (3 次失败的 import + 1 次回退)）。这里把它们收敛成同一次加载。
 *
 * 顺带一个可断言的性质：不管调用多少次、什么时候调，都返回**同一个 Promise 对象**
 * （test.mjs 的异步段就是拿这个钉去重有没有生效）。
 * 加载失败时清掉 pending，允许后续重试。
 */
export function loadPluginBase() {
  if (pending) return pending
  pending = doLoad().then(
    (base) => {
      cached = base
      return base
    },
    (err) => {
      pending = null
      throw err
    }
  )
  return pending
}

/** 同步读已加载的基类（没加载完就返回 null） */
export function pluginBaseSync() {
  return cached
}

// 立即开始异步加载
loadPluginBase().catch(() => {})
