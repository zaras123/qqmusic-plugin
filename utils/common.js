/**
 * 插件公共小工具：配置、命令识别、卡片「图失败→文本」回退
 */
import Config from '../components/Config.js'
import { logWarn } from './log.js'
import { formatSongList } from './format.js'

export function getCfg() {
  return Config.getConfig('qqmusic') || {}
}

/** 点歌/登录/管理等指令，解析模块应放行 */
export function isPluginCommandMsg(msg = '') {
  // #qms / #QMS 与 #QQ状态 也是本插件命令，但都不满足 `m\b`（后面跟的是字母/中文边界不同），
  // 必须单独列出来 —— 漏掉的话解析守卫会把它们当普通消息去抽链接
  return /^#?(qq|QQ)m\b|^#?(qq|QQ)音乐|^#?(qq|QQ)状态$|^#?(qms|QMS)$|^#听\s*[1-9]|^#qm帮助/i.test(
    String(msg || '').trim()
  )
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

/**
 * 列表卡（歌手 / 专辑 / 歌单 / 排行 / 新歌 / 点歌结果）的统一出口
 *
 * 收在这里的原因：这段「动态 import 卡片数据 + 渲染 → replyCardOrText → 文本兜底」
 * 原本在 6 个命令里各抄了一遍，差量只有标题、卡片选项和兜底文案。
 *
 * ⚠️ 卡片模块必须**动态 import**：utils/card-data.js 与 utils/render.js 会把
 *    art-template / Puppeteer 一并拉起来，不能在插件启动时就加载。
 * ⚠️ 热搜卡（buildHotCardData/renderHotCard）与评论卡（buildCommentCardData/
 *    renderCommentCard）虽然同样挂在 `renderListCard !== false` 闸门后面，
 *    但用的**不是**列表卡 —— 别顺手收进来。
 *
 * @param {object} e 消息事件
 * @param {{title: string, list: Array, options?: object, formatText?: Function, tag?: string}} args
 *   title 同时用作卡片标题与默认文本标题；options 透传给 buildListCardData
 * @returns {Promise<boolean>} 是否已回复（图或文）
 */
export async function replyListCardOrText(e, { title, list, options = {}, formatText, tag = '列表卡片' } = {}) {
  const { buildListCardData } = await import('./card-data.js')
  const { renderListCard } = await import('./render.js')
  return replyCardOrText(e, {
    render: renderListCard,
    data: buildListCardData(title, list, options),
    formatText: formatText || (() => formatSongList(list, title)),
    tag,
  })
}
