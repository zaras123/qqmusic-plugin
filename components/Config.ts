/**
 * 配置读写
 * 默认: <插件包>/config/default_config/*.yaml
 * 用户: @karinjs/<插件名>/config/*.yaml（启动时 / 缺失时自动从默认复制）
 * 非 Karin 环境仍回落到插件目录 config/config。
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginPath, pluginConfigPath, resolvePluginStateFile } from '../utils/path.js'
import { logInfo, logWarn, logError } from '../utils/log.js'

const defDir = path.join(pluginPath, 'config/default_config')
const cfgDir = pluginConfigPath

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}

function isMissingOrEmpty(file) {
  if (!fs.existsSync(file)) return true
  try {
    return fs.statSync(file).size === 0
  } catch {
    return true
  }
}

/**
 * 读取 YAML 并校验根节点。
 * 配置文件损坏时保留原文件，运行时退回默认值；不能把标量/数组当成对象展开。
 */
function readYaml(file) {
  if (!fs.existsSync(file)) return { ok: true, value: {} }
  try {
    const parsed = YAML.parse(fs.readFileSync(file, 'utf8'))
    if (parsed == null) return { ok: true, value: {} }
    if (!isPlainObject(parsed)) {
      logWarn(`配置文件根节点必须是对象: ${file}`)
      return { ok: false, value: {} }
    }
    return { ok: true, value: parsed }
  } catch (e) {
    logWarn(`配置文件解析失败: ${file} — ${e.message}`)
    return { ok: false, value: {} }
  }
}

/**
 * 合并缺省字段。对象递归合并，用户已有值永远优先。
 * 同时把历史上被写成 "platforms.x.y" 的字面量键迁回嵌套对象。
 */
function normalizeStoredValue(value) {
  if (Array.isArray(value)) return value.map(normalizeStoredValue)
  if (!isPlainObject(value)) return value

  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (!key.includes('.')) {
      out[key] = normalizeStoredValue(item)
      continue
    }
    const parts = key.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i]
      if (!isPlainObject(node[part])) node[part] = {}
      node = node[part]
    }
    node[parts[parts.length - 1]] = normalizeStoredValue(item)
  }
  return out
}

function mergeMissing(defaults, user) {
  const source = isPlainObject(user) ? user : {}
  const out = {}
  let changed = false
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in source)) {
      out[key] = cloneValue(value)
      changed = true
      continue
    }
    if (isPlainObject(value) && isPlainObject(source[key])) {
      const merged = mergeMissing(value, source[key])
      out[key] = merged.value
      changed ||= merged.changed
    } else {
      out[key] = cloneValue(source[key])
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (!(key in out)) out[key] = cloneValue(value)
  }
  return { value: out, changed }
}

function writeYaml(file, data) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temp, YAML.stringify(data), 'utf8')
    fs.renameSync(temp, file)
  } catch (e) {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
    } catch {}
    throw e
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
    logError(`创建配置目录失败: ${cfgDir} — ${e.message}`)
    throw e
  }

  const dst = resolvePluginStateFile('config', `${name}.yaml`)
  const src = path.join(defDir, `${name}.yaml`)

  if (!fs.existsSync(src)) {
    logWarn(`缺少默认配置: ${src}`)
    return dst
  }

  if (isMissingOrEmpty(dst)) {
    try {
      fs.copyFileSync(src, dst)
      logInfo(`已生成用户配置: ${dst}`)
    } catch (e) {
      logError(`生成用户配置失败: ${dst} — ${e.message}`)
      throw e
    }
  }

  // 合并缺省字段：用户配置缺少新 key 时补全
  if (fs.existsSync(dst)) {
    try {
      const defResult = readYaml(src)
      const userResult = readYaml(dst)
      // 用户文件损坏时保留现场，不静默覆盖；运行时由 getConfig 回落默认值。
      if (!defResult.ok || !userResult.ok) return dst

      const normalizedUser = normalizeStoredValue(userResult.value)
      const merged = mergeMissing(defResult.value, normalizedUser)
      if (merged.changed || JSON.stringify(normalizedUser) !== JSON.stringify(userResult.value)) {
        writeYaml(dst, merged.value)
      }
    } catch (e) {
      logWarn(`合并配置字段失败（${name}）: ${e.message}`)
    }
  }
  return dst
}

function loadYaml(file) {
  return readYaml(file).value
}

/**
 * 合并结果缓存（name -> { key, cfg }）
 *
 * 为什么必须有：getConfig 每次都要读+解析**两份** yaml（默认 + 用户），实测单次
 * ~4.2ms 且是**同步**的 —— 一条命令里 getCfg() 会被叫好几次，而所有插件共用同一条
 * 事件循环，这段解析拖的是整个机器人的响应。
 *
 * 失效靠**文件指纹**（mtime + size），不是靠"读一次写死"：
 *   · Karin WebUI 保存 / 用户手改 yaml / 插件更新覆盖 default_config → 指纹变 → 下一次立刻读到新的
 *   · 所以不违反 utils/v2.js 那条「判定必须每次现读配置」的红线 —— 缓存的是**文件内容**，
 *     不是判定结果；判定函数照旧每次现算
 * 返回的是**深层副本**，调用方改嵌套对象也不会污染缓存。
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
      logError(`初始化配置失败: ${e.message}`)
    }
  }

  static getConfig(name = 'qqmusic') {
    const defFile = path.join(defDir, `${name}.yaml`)
    const cacheKey = `${fileKey(defFile)}|${fileKey(path.join(cfgDir, `${name}.yaml`))}`
    const hit = mergedCache.get(name)
    if (hit && hit.key === cacheKey) return cloneValue(hit.cfg)

    // 未命中：先补齐用户配置（可能新建 / 合并缺省字段并落盘），再合并读取
    const userFile = ensureUserConfig(name)
    const def = normalizeStoredValue(loadYaml(defFile))
    const user = normalizeStoredValue(loadYaml(userFile))
    const cfg = mergeMissing(def, user).value
    // 落盘后再取一次指纹 —— 否则 ensureUserConfig 刚写的那一版会被下一次调用判成未命中
    mergedCache.set(name, { key: `${fileKey(defFile)}|${fileKey(userFile)}`, cfg })
    return cloneValue(cfg)
  }

  static setConfig(name, data) {
    const file = ensureUserConfig(name)
    const next = isPlainObject(data) ? normalizeStoredValue(data) : {}
    writeYaml(file, next)
    mergedCache.delete(name)
  }

  static mergeConfig(name, patch) {
    const cur = this.getConfig(name)
    const next = { ...cur, ...patch }
    this.setConfig(name, next)
    return next
  }
}
