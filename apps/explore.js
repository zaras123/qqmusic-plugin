/**
 * 歌手 + 专辑 + 歌单 + 评论
 * 命令：#qqm歌手 关键词  /  #qqm专辑 关键词  /  #qqm歌单 关键词  / #qqm评论 关键词
 */
import { loadPluginBaseSync } from '../utils/plugin-base.js'

import {
  searchSingers, searchAlbums, searchSonglists, searchSongs,
  singerSongs, singerDesc,
  albumSongs,
  songlistDetail,
  comment,
} from '../utils/api.js'
import { setSession } from '../utils/session.js'
import { formatSongList } from '../utils/format.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logError } from '../utils/log.js'

export class qqmusicExplore extends Plugin {
  constructor() {
    super({
      name: 'QQ音乐-探索',
      dsc: '歌手、专辑、歌单、评论',
      event: 'message',
      priority: 510,
      rule: [
        { reg: /^#?(qq|QQ)m\s*歌手\s+(.+)$/, fnc: 'artist' },
        { reg: /^#?(qq|QQ)m\s*专辑\s+(.+)$/, fnc: 'album' },
        { reg: /^#?(qq|QQ)m\s*歌单\s+(.+)$/, fnc: 'playlist' },
        { reg: /^#?(qq|QQ)m\s*评论\s+(.+)$/, fnc: 'getComment' },
      ],
    })
  }

  cfg() { return getCfg() }

  // ──────────── 歌手 ────────────

  async artist(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').match(/^#?(qq|QQ)m\s*歌手\s+(.+)$/)
    const keyword = m?.[2]?.trim()
    if (!keyword) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply(`正在搜索歌手：${keyword}`)
      const singers = await searchSingers(keyword, { pageSize: 5, userKey })
      if (!singers.length) { await e.reply('没有找到相关歌手'); return true }

      // 取第一个匹配的歌手
      const singer = singers[0]
      const result = await singerSongs(singer.singermid, { pageSize: 30, userKey })
      if (!result?.list?.length) { await e.reply('该歌手暂无歌曲'); return true }

      const title = `${singer.singerName} 热门歌曲`
      await setSession(scope, { type: 'singer', data: result.list, user_id: e.user_id, title, singer })

      // 渲染列表卡片（统一风格）
      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const cardData = buildListCardData(title, result.list, {
          singerInfo: singer.singerName || '',
          tip: `发送 #qqm听序号 播放「${singer.singerName}」的歌曲`,
        })
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: cardData,
          formatText: () => formatSongList(result.list, title),
          tag: '歌手卡片',
        })
        if (ok) {
          // 歌手信息放在卡片后面
          try {
            const desc = await singerDesc(singer.singermid, userKey)
            if (desc?.desc) {
              const brief = String(desc.desc).slice(0, 200)
              await e.reply(`【${singer.singerName}】${brief}${desc.desc.length > 200 ? '...' : ''}`)
            }
          } catch { /* 忽略 */ }
          return true
        }
      }

      await e.reply(formatSongList(result.list, title))
      // 额外展示歌手信息
      try {
        const desc = await singerDesc(singer.singermid, userKey)
        if (desc?.desc) {
          const brief = String(desc.desc).slice(0, 200)
          await e.reply(`【${singer.singerName}】${brief}${desc.desc.length > 200 ? '...' : ''}`)
        }
      } catch { /* 忽略 */ }
    } catch (err) {
      logError(`歌手搜索失败: ${err.message}`)
      await e.reply('歌手搜索失败，请稍后重试')
    }
    return true
  }

  // ──────────── 专辑 ────────────

  async album(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').match(/^#?(qq|QQ)m\s*专辑\s+(.+)$/)
    const keyword = m?.[2]?.trim()
    if (!keyword) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply(`正在搜索专辑：${keyword}`)
      const albums = await searchAlbums(keyword, { pageSize: 5, userKey })
      if (!albums.length) { await e.reply('没有找到相关专辑'); return true }

      const alb = albums[0]
      const result = await albumSongs(alb.albummid, { userKey })
      if (!result?.list?.length) { await e.reply('该专辑暂无曲目'); return true }

      const title = `${alb.singerName} - ${alb.albumName}`
      await setSession(scope, { type: 'album', data: result.list, user_id: e.user_id, title, album: alb })

      // 渲染卡片（统一风格）
      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: buildListCardData(title, result.list, {
            albumInfo: alb.publicTime ? `发行时间：${alb.publicTime}` : '',
            tip: `发送 #qqm听序号 播放「${alb.albumName}」`,
          }),
          formatText: () => formatSongList(result.list, title),
          tag: '专辑卡片',
        })
        if (ok) {
          if (alb.publicTime) await e.reply(`发行时间：${alb.publicTime}`)
          return true
        }
      }

      await e.reply(formatSongList(result.list, title))
      if (alb.publicTime) {
        await e.reply(`发行时间：${alb.publicTime}`)
      }
    } catch (err) {
      logError(`专辑搜索失败: ${err.message}`)
      await e.reply('专辑搜索失败，请稍后重试')
    }
    return true
  }

  // ──────────── 歌单 ────────────

  async playlist(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').match(/^#?(qq|QQ)m\s*歌单\s+(.+)$/)
    const keyword = m?.[2]?.trim()
    if (!keyword) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply(`正在搜索歌单：${keyword}`)
      const lists = await searchSonglists(keyword, { pageSize: 5, userKey })
      if (!lists.length) { await e.reply('没有找到相关歌单'); return true }

      const pl = lists[0]
      const detail = await songlistDetail(pl.disstid, userKey)
      const songs = detail.songlist || []
      if (!songs.length) { await e.reply('该歌单暂无歌曲'); return true }

      const title = detail.dissname || pl.dissname || '歌单'
      await setSession(scope, { type: 'playlist', data: songs, user_id: e.user_id, title, playlist: pl })

      // 渲染卡片
      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: buildListCardData(title, songs),
          formatText: () => formatSongList(songs, title),
          tag: '歌单卡片',
        })
        if (ok) return true
      }

      await e.reply(formatSongList(songs, title))
    } catch (err) {
      logError(`歌单搜索失败: ${err.message}`)
      await e.reply('歌单搜索失败，请稍后重试')
    }
    return true
  }

  // ──────────── 评论 ────────────

  async getComment(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').match(/^#?(qq|QQ)m\s*评论\s+(.+)$/)
    const keyword = m?.[2]?.trim()
    if (!keyword) return false
    const userKey = String(e.user_id || '')

    try {
      await e.reply(`正在搜索：${keyword}`)
      const list = await searchSongs(keyword, { pageSize: 3, userKey })
      if (!list.length) { await e.reply('没有找到相关歌曲'); return true }

      // 尝试匹配最佳结果
      const song = list.find(s => s.songid) || list[0]
      if (!song.songid) {
        await e.reply('未能获取歌曲ID，无法查询评论')
        return true
      }

      const result = await comment(song.songid, { pageSize: 20, userKey })
      const hot = result.hot_comment?.commentlist || result.hot_comment || []
      const normal = result.comment?.commentlist || result.comment || []

      const allComments = [...(Array.isArray(hot) ? hot : []), ...(Array.isArray(normal) ? normal : [])]
      if (!allComments.length) {
        await e.reply(`【${song.songName} - ${song.singerName}】\n暂无评论`)
        return true
      }

      // 渲染歌词卡片样式的评论卡片
      const commentLines = allComments.slice(0, 10).map((c, i) => {
        const nick = c.nick || c.nickname || '匿名'
        const text = c.rootcommentcontent || c.content || c.comment || ''
        const likes = c.praisenum || c.likeCount || 0
        return `${i + 1}. ${nick}（${likes}赞）：${text.slice(0, 80)}`
      }).filter(Boolean)

      if (cfg.renderListCard !== false) {
        const { buildLyricCardData } = await import('../utils/card-data.js')
        const { renderLyricCard } = await import('../utils/render.js')
        const cardData = buildLyricCardData({
          songName: song.songName,
          singerName: song.singerName,
          cover: song.cover || '',
          albumName: song.albumName || '',
          lines: commentLines,
        })
        cardData.tip = '发送 #qqm点歌 关键词 可以搜索播放'
        const ok = await replyCardOrText(e, {
          render: renderLyricCard,
          data: cardData,
          formatText: () => [`♫ ${song.songName} - ${song.singerName} 热门评论`, '', ...commentLines].join('\n'),
          tag: '评论卡片',
        })
        if (ok) return true
      }

      await e.reply([`♫ ${song.songName} - ${song.singerName} 热门评论`, '', ...commentLines].join('\n'))
    } catch (err) {
      logError(`评论失败: ${err.message}`)
      await e.reply('评论获取失败，请稍后重试')
    }
    return true
  }
      await e.reply('评论获取失败，请稍后重试')
    }
    return true
  }
}
