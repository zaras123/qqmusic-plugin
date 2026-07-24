/**
 * 配置读写
 * 默认: config/default_config/*.yaml
 * 用户: config/config/*.yaml（启动时 / 缺失时自动从默认复制）
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginName, pluginPath } from '../utils/path.js'

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
    const def = loadYaml(path.join(defDir, `${name}.yaml`))
    const userFile = ensureUserConfig(name)
    const user = loadYaml(userFile)
    return { ...def, ...user }
  }

  static setConfig(name, data) {
    const file = ensureUserConfig(name)
    fs.writeFileSync(file, YAML.stringify(data ?? {}), 'utf8')
  }

  static mergeConfig(name, patch) {
    const cur = this.getConfig(name)
    const next = { ...cur, ...patch }
    this.setConfig(name, next)
    return next
  }

  static get pluginName() {
    return pluginName
  }
}
