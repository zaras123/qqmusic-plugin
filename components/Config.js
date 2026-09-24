/**
 * 配置读写
 * 默认: config/default_config/*.yaml
 * 用户: config/config/*.yaml（启动时 / 缺失时自动从默认复制）
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginPath } from '../utils/path.js'

const defDir = path.join(pluginPath, 'config/default_config')
const cfgDir = path.join(pluginPath, 'config/config')
const log = global.logger || console

function isMissingOrEmpty(file) {
  if (!fs.existsSync(file)) return true
  try {
    return fs.statSync(file).size === 0
  } catch {
    return true
  }
}

/**
 * 确保用户配置存在：目录缺失、文件删除、空文件时，均从 default 复制
 * 启动时与 get/set 都会走这里，避免「删了重启不再生」
 */
function ensureUserConfig(name) {
  try {
    if (!fs.existsSync(cfgDir)) {
      fs.mkdirSync(cfgDir, { recursive: true })
    }
  } catch (e) {
    log.error?.(`[qqmusic-plugin] 创建配置目录失败: ${cfgDir} — ${e.message}`)
    throw e
  }

  const dst = path.join(cfgDir, `${name}.yaml`)
  const src = path.join(defDir, `${name}.yaml`)

  if (!fs.existsSync(src)) {
    log.warn?.(`[qqmusic-plugin] 缺少默认配置: ${src}`)
    return dst
  }

  if (isMissingOrEmpty(dst)) {
    try {
      fs.copyFileSync(src, dst)
      log.info?.(`[qqmusic-plugin] 已生成用户配置: config/config/${name}.yaml`)
    } catch (e) {
      log.error?.(`[qqmusic-plugin] 生成用户配置失败: ${dst} — ${e.message}`)
      throw e
    }
  }

  // 合并缺省字段：用户配置缺少新 key 时补全
  if (fs.existsSync(dst)) {
    try {
      const def = YAML.parse(fs.readFileSync(src, 'utf8')) || {}
      const user = YAML.parse(fs.readFileSync(dst, 'utf8')) || {}
      let changed = false
      for (const [k, v] of Object.entries(def)) {
        if (!(k in user)) {
          user[k] = v
          changed = true
        }
      }
      if (changed) fs.writeFileSync(dst, YAML.stringify(user), 'utf8')
    } catch (e) {
      log.warn?.(`[qqmusic-plugin] 合并配置字段失败（${name}）: ${e.message}`)
    }
  }
  return dst
}

function loadYaml(file) {
  if (!fs.existsSync(file)) return {}
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch {
    return {}
  }
}

/**
 * 合并结果缓存（name -> { key, cfg }）
 *
 * 为什么必须有：getConfig 每次都要读+解析**两份** yaml（默认 + 用户），实测单次
 * ~4.2ms 且是**同步**的 —— 一条命令里 getCfg() 会被叫好几次，而所有插件共用同一条
 * 事件循环，这段解析拖的是整个机器人的响应。
 *
 * 失效靠**文件指纹**（mtime + size），不是靠"读一次写死"：
 *   · 锅巴保存 / 用户手改 yaml / 插件更新覆盖 default_config → 指纹变 → 下一次立刻读到新的
 *   · 所以不违反 utils/v2.js 那条「判定必须每次现读配置」的红线 —— 缓存的是**文件内容**，
 *     不是判定结果；判定函数照旧每次现算
 * 返回的是**浅拷贝**，调用方照旧可以随便改自己那份，不会污染缓存。
 * （全仓没有"改配置里的嵌套对象"的写法，浅拷贝够用；将来若要有，得改成深拷贝。）
 */
const mergedCache = new Map()

/**
 * 文件指纹：mtime + 大小；不存在 / 读不到 → '-'（删了文件也能触发失效）
 *
 * ⚠️ 2026-09-25 试过给这里加"200ms 指纹记忆"（每次省 2 次 statSync，单次 80µs→8µs），
 * **被测试打回来了**：`手改 yaml → 立刻生效`是这套配置系统的明码保证
 * （test.mjs 的"配置：手改 yaml → 立刻生效"三条断言钉着），200ms 的窗口会让它变假。
 * 结论：这点开销换那个保证不划算 —— 别再往这儿加 TTL。
 */
function fileKey(file) {
  try {
    const s = fs.statSync(file)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return '-'
  }
}

export default class Config {
  /** 启动时调用：扫描 default_config，缺失的用户配置全部补齐 */
  static init() {
    try {
      if (!fs.existsSync(defDir)) return
      const files = fs.readdirSync(defDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      for (const f of files) {
        const name = f.replace(/\.ya?ml$/i, '')
        ensureUserConfig(name)
      }
    } catch (e) {
      log.error?.(`[qqmusic-plugin] 初始化配置失败: ${e.message}`)
    }
  }

  static getConfig(name = 'qqmusic') {
    const defFile = path.join(defDir, `${name}.yaml`)
    const cacheKey = `${fileKey(defFile)}|${fileKey(path.join(cfgDir, `${name}.yaml`))}`
    const hit = mergedCache.get(name)
    if (hit && hit.key === cacheKey) return { ...hit.cfg }

    // 未命中：先补齐用户配置（可能新建 / 合并缺省字段并落盘），再合并读取
    const userFile = ensureUserConfig(name)
    const cfg = { ...loadYaml(defFile), ...loadYaml(userFile) }
    // 落盘后再取一次指纹 —— 否则 ensureUserConfig 刚写的那一版会被下一次调用判成未命中
    mergedCache.set(name, { key: `${fileKey(defFile)}|${fileKey(userFile)}`, cfg })
    return { ...cfg }
  }

  static setConfig(name, data) {
    const file = ensureUserConfig(name)
    fs.writeFileSync(file, YAML.stringify(data ?? {}), 'utf8')
    mergedCache.delete(name)
  }

  static mergeConfig(name, patch) {
    const cur = this.getConfig(name)
    const next = { ...cur, ...patch }
    this.setConfig(name, next)
    return next
  }
}
