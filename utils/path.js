import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** 插件根目录（真实路径，解开 junction/symlink） */
function real(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export const pluginPath = real(path.join(__dirname, '..'))

/** 插件文件夹名 */
export const pluginName = path.basename(pluginPath)

/**
 * 插件 logo 的绝对 file URL。
 * 卡片有两条渲染路径（直连截图 / Yunzai puppeteer 回退），绝对路径在两条里都有效，
 * 相对路径只在其中一条能被子路径改写规则正确处理。
 */
export const logoUrl = pathToFileURL(path.join(pluginPath, 'resources/img/logo.png')).href

/**
 * Yunzai 根目录
 * 优先 process.cwd()（Bot 从 Yunzai 根启动），否则从插件路径向上找
 */
function resolveYunzaiPath() {
  const cwd = process.cwd()
  if (
    fs.existsSync(path.join(cwd, 'plugins')) &&
    (fs.existsSync(path.join(cwd, 'lib/plugins/plugin.js')) ||
      fs.existsSync(path.join(cwd, 'package.json')))
  ) {
    return real(cwd)
  }
  // 插件在 Yunzai/plugins/xxx
  const up1 = path.join(pluginPath, '..')
  const up2 = path.join(pluginPath, '../..')
  for (const cand of [up1, up2, path.join(pluginPath, '../../..')]) {
    const r = real(cand)
    if (
      fs.existsSync(path.join(r, 'plugins')) &&
      fs.existsSync(path.join(r, 'lib'))
    ) {
      return r
    }
  }
  return real(cwd)
}

export const yunzaiPath = resolveYunzaiPath()
