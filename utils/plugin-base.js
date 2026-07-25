/**
 * 加载 Yunzai 插件基类（兼容旧版 Node.js，无顶层 await）
 */
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let cached

export function loadPluginBaseSync() {
  if (cached) return cached
  const candidates = [
    path.join(process.cwd(), 'lib/plugins/plugin.js'),
    path.join(process.cwd(), 'lib/plugins/plugin.ts'),
  ]
  for (const p of candidates) {
    try {
      const mod = require(p)
      cached = mod.default || mod.plugin || mod
      return cached
    } catch {}
  }
  // 回退相对路径
  try {
    const mod = require('../../../lib/plugins/plugin.js')
    cached = mod.default
    return cached
  } catch (e) {
    throw new Error(`无法加载 Yunzai plugin 基类: ${e.message}`)
  }
}

// 保持向后兼容
export async function loadPluginBase() {
  return loadPluginBaseSync()
}
