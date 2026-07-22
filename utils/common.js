/**
 * 插件公共小工具：配置、命令识别、卡片「图失败→文本」回退
 */
import Config from '../components/Config.js'
import { logWarn } from './log.js'

export function getCfg() {
  return Config.getConfig('qqmusic') || {}
}

/** 点歌/登录/管理等指令，解析模块应放行 */
export function isPluginCommandMsg(msg = '') {
  return /^#?(qq|QQ)m\b|^#?(qq|QQ)音乐|^#听\s*[1-9]|^#qm帮助/i.test(String(msg || '').trim())
}

/**
 * 优先渲染图片卡；失败则 formatText / 自定义 onFallback
 * @returns {Promise<boolean>} 是否已成功回复（图或文）
 */
export async function replyCardOrText(e, { render, data, formatText, onFallback, tag = '卡片' }) {
  try {
    if (typeof render === 'function' && data) {
      const img = await render(e, data)
      if (img) {
        await e.reply(img)
        return true
      }
    }
  } catch (err) {
    logWarn(`${tag}渲染失败，回退文本: ${err.message}`)
  }

  try {
    if (typeof formatText === 'function' && data) {
      await e.reply(formatText(data))
      return true
    }
    if (typeof onFallback === 'function') {
      await onFallback()
      return true
    }
  } catch (err) {
    logWarn(`${tag}文本回退失败: ${err.message}`)
  }
  return false
}
