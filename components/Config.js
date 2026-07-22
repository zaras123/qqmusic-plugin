/**
 * 配置读写
 * 默认: config/default_config/*.yaml
 * 用户: config/config/*.yaml（首次自动复制）
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginName, pluginPath } from '../utils/path.js'

const defDir = path.join(pluginPath, 'config/default_config')
const cfgDir = path.join(pluginPath, 'config/config')

function ensureUserConfig(name) {
  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })
  const dst = path.join(cfgDir, `${name}.yaml`)
  const src = path.join(defDir, `${name}.yaml`)
  if (!fs.existsSync(dst) && fs.existsSync(src)) {
    fs.copyFileSync(src, dst)
  }
  // 合并缺省字段：用户配置缺少新 key 时补全
  if (fs.existsSync(dst) && fs.existsSync(src)) {
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
    } catch {
      /* ignore */
    }
  }
  return dst
}

function loadYaml(file) {
  if (!fs.existsSync(file)) return {}
  return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
}

export default class Config {
  static getConfig(name = 'qqmusic') {
    const def = loadYaml(path.join(defDir, `${name}.yaml`))
    const userFile = ensureUserConfig(name)
    const user = loadYaml(userFile)
    return { ...def, ...user }
  }

  static setConfig(name, data) {
    const file = ensureUserConfig(name)
    fs.writeFileSync(file, YAML.stringify(data), 'utf8')
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
