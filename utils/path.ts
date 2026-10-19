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

const moduleRoot = real(path.join(__dirname, '..'))
export const pluginPath =
  path.basename(moduleRoot).toLowerCase() === 'dist' ? real(path.join(moduleRoot, '..')) : moduleRoot

/** 插件文件夹名 */
export const pluginName = path.basename(pluginPath)

/**
 * 插件 logo 的绝对 file URL。
 * 卡片有两条渲染路径（直连截图 / Karin 渲染器），绝对路径在两条里都有效。
 */
export const logoUrl = pathToFileURL(path.join(pluginPath, 'resources/img/logo.png')).href

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Karin（node-karin）根目录
 *
 * 判定：目录里有 `plugins/`，且 `index.mjs`（`import('node-karin/start')`）或
 * `package.json` 里依赖了 `node-karin`。找不到就返回空串 —— 非 Karin 宿主下
 * 这不是错误，只是「没有这个宿主」。
 * 可用 QQMUSIC_KARIN_PATH 显式指定（脱离框架的脚本 / 本地预览）。
 */
function resolveKarinPath() {
  const fromEnv = String(process.env.QQMUSIC_KARIN_PATH || '').trim()
  if (fromEnv && fs.existsSync(fromEnv)) return real(fromEnv)

  const roots = [
    process.cwd(),
    path.resolve(pluginPath, '..'),
    path.resolve(pluginPath, '..', '..'),
    path.resolve(pluginPath, '..', '..', '..'),
  ]
  for (const cand of roots) {
    const r = real(cand)
    if (!fs.existsSync(path.join(r, 'plugins'))) continue
    if (fs.existsSync(path.join(r, 'index.mjs'))) return r
    const pkg = safeReadJson(path.join(r, 'package.json'))
    if (pkg && (pkg.dependencies?.['node-karin'] || pkg.devDependencies?.['node-karin'])) {
      return r
    }
  }
  return ''
}

export const karinPath = resolveKarinPath()

/**
 * 运行期临时目录
 *
 * 优先 QQMUSIC_TEMP_PATH（脚本 / 预览指定）→ Karin 的 `@karinjs/temp`。
 * KARIN_PLUGIN_INIT 拿到 `node-karin` 的 `tempPath` 后会用 setTempPath()
 * 覆盖成框架真正认的那个目录。
 */
function resolveTempPath() {
  const fromEnv = String(process.env.QQMUSIC_TEMP_PATH || '').trim()
  if (fromEnv) return real(fromEnv)
  if (karinPath) {
    for (const rel of ['@karinjs/temp', 'temp', 'data/temp']) {
      const p = path.join(karinPath, rel)
      if (fs.existsSync(p)) return real(p)
    }
    return path.join(karinPath, '@karinjs/temp')
  }
  return path.join(pluginPath, 'temp')
}

/** 运行期临时目录 */
export let tempPath = resolveTempPath()

/** 运行期目录（缓存 / 截图产物 / 下载落盘都挂这里）—— 与 tempPath 同步 */
export let runtimePath = tempPath

/** 由 KARIN_PLUGIN_INIT 用 node-karin.tempPath 覆盖（拿不到就保持启发式结果） */
export function setTempPath(p) {
  const v = String(p || '').trim()
  if (!v) return tempPath
  tempPath = real(v)
  runtimePath = tempPath
  return tempPath
}
