/**
 * 加载 Yunzai 插件基类（兼容目录联接 / 软链导致的相对路径错位）
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let cached

export async function loadPluginBase() {
  if (cached) return cached
  const candidates = [
    path.join(process.cwd(), 'lib/plugins/plugin.js'),
    path.join(process.cwd(), 'lib/plugins/plugin.ts'),
  ]
  for (const p of candidates) {
    try {
      const mod = await import(pathToFileURL(p).href)
      cached = mod.default || mod.plugin || mod
      return cached
    } catch {}
  }
  // 回退相对路径（物理位于 plugins/xxx/apps 时）
  try {
    const mod = await import('../../../lib/plugins/plugin.js')
    cached = mod.default
    return cached
  } catch (e) {
    throw new Error(`无法加载 Yunzai plugin 基类，请确认在 Yunzai 根目录启动。${e.message}`)
  }
}
