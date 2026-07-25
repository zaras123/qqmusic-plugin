/**
 * 加载 Yunzai 插件基类（兼容 ESM + top-level await）
 */
import path from 'node:path'

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
      const mod = await import(p)
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

/**
 * 同步获取已加载的插件基类
 * 注意：必须在所有 import 完成后使用
 */
export function getPluginBase() {
  if (!cached) {
    throw new Error('Plugin base not loaded yet')
  }
  return cached
}

// 立即开始异步加载
loadPluginBase().catch(() => {})
