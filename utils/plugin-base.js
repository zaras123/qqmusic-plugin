/**
 * 加载 Yunzai 插件基类（兼容 ESM + top-level await）
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let cached = null

/**
 * 异步加载插件基类（使用 import() 兼容 ESM）
 */
export async function loadPluginBase() {
  if (cached) return cached

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
      cached = mod.default || mod.plugin || mod
      return cached
    } catch {
      // 继续尝试下一个
    }
  }

  // 回退相对路径
  try {
    const mod = await import('../../../lib/plugins/plugin.js')
    cached = mod.default || mod.plugin || mod
    return cached
  } catch (e) {
    throw new Error(`无法加载 Yunzai plugin 基类: ${e.message}`)
  }
}

// 立即开始异步加载
loadPluginBase().catch(() => {})
