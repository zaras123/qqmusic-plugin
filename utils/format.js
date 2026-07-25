/**
 * 格式化工具函数
 */

/**
 * 格式化歌曲列表为文本
 * @param {Array} list - 歌曲列表
 * @param {string} title - 列表标题
 * @param {number} startIdx - 起始索引（用于分页）
 * @returns {string} 格式化后的文本
 */
export function formatSongList(list, title, startIdx = 0) {
  const lines = [`♫ ${title}`]
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    const idx = startIdx + i + 1
    const isVip = Boolean(s.payplay) || s.pay?.pay_play
    const isPaid = s.pay?.pay_down && !isVip
    const tag = isVip ? ' [会员]' : (isPaid ? ' [付费]' : '')
    const dur = s.duration ? ` (${s.duration})` : ''
    lines.push(`${idx}. ${s.songName || s.title || s.name || '未知'} - ${s.singerName || s.singer || '未知'}${tag}${dur}`)
  }
  lines.push(`\n发送 #qqm听序号 播放（共${list.length}首）`)
  return lines.join('\n')
}
