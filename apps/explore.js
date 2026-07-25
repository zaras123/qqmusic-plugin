/**
 * 歌手 + 专辑 + 歌单 + 评论
 * 命令：#qqm歌手 关键词  /  #qqm专辑 关键词  /  #qqm歌单 关键词  /  #qqm评论 关键词
 */
import { loadPluginBase } from '../utils/plugin-base.js'
import {
  searchSingers, searchAlbums, searchSonglists, searchSongs,
  singerSongs, singerDesc,
  albumSongs,
  songlistDetail,
  comment,
} from '../utils/api.js'
import { setSession } from '../utils/session.js'
import { formatSongList } from '../utils/format.js'
import { getCfg } from '../utils/common.js'
import { logError } from '../utils/log.js'

const plugin = await loadPluginBase()

export class qqmusicExplore extends plugin {
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
      const songs = await singerSongs(singer.singermid, { pageSize: 30, userKey })
      if (!songs.list.length) { await e.reply('该歌手暂无歌曲'); return true }

      const title = `${singer.singerName} 热门歌曲`
      await setSession(scope, { type: 'singer', data: songs.list, user_id: e.user_id, title, singer })
      await e.reply(formatSongList(songs.list, title))

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
      if (!result.list.length) { await e.reply('该专辑暂无曲目'); return true }

      const title = `${alb.singerName} - ${alb.albumName}`
      await setSession(scope, { type: 'album', data: result.list, user_id: e.user_id, title, album: alb })
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
      const raw = detail.songlist || []
      const songs = raw.map((item, idx) => {
        const singer = Array.isArray(item.singer)
          ? item.singer.map(s => s.name).filter(Boolean).join(' / ')
          : item.singername || ''
        const albummid = item.albummid || item.album?.mid || ''
        return {
          index: idx + 1,
          songmid: item.songmid || item.mid || '',
          songid: item.songid || item.id || 0,
          media_mid: item.media_mid || item.songmid || '',
          songName: item.songname || item.title || item.name || '',
          singerName: singer,
          albumName: item.albumname || item.album?.name || '',
          albummid,
          cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '',
          payplay: item.pay?.pay_play ?? item.payplay,
        }
      })
      if (!songs.length) { await e.reply('该歌单暂无歌曲'); return true }

      const title = pl.dissname || '歌单'
      await setSession(scope, { type: 'playlist', data: songs, user_id: e.user_id, title, playlist: pl })
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

      const lines = [`♫ ${song.songName} - ${song.singerName} 热门评论\n`]
      for (let i = 0; i < Math.min(allComments.length, 10); i++) {
        const c = allComments[i]
        const nick = c.nick || c.nickname || '匿名'
        const text = c.rootcommentcontent || c.content || c.comment || ''
        const likes = c.praisenum || c.likeCount || 0
        if (text) {
          lines.push(`${i + 1}. ${nick}（${likes}赞）：${text.slice(0, 100)}`)
        }
      }
      await e.reply(lines.join('\n'))
    } catch (err) {
      logError(`评论失败: ${err.message}`)
      await e.reply('评论获取失败，请稍后重试')
    }
    return true
  }
}
