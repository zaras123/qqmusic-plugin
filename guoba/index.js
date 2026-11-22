import pluginInfo from './pluginInfo.js'
import configInfo from './configInfo.js'
import { registerConsole } from './console-server.js'

export function supportGuoba() {
  try {
    registerConsole()
  } catch {
    // 页面注册失败不能影响原有锅巴配置页
  }
  return {
    pluginInfo,
    configInfo,
  }
}
