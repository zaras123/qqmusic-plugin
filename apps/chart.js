/**
 * 排行榜 + 推荐 + 电台 + 日推 + 收藏
 * 命令：#qqm排行 / #qqm推荐 / #qqm来首歌 / #qqm电台 / #qqm日推 / #qqm收藏
 */
import { loadPluginBaseSync } from '../utils/plugin-base.js'

const Plugin = loadPluginBaseSync()

import { topCategory, topDetail, recommendHot, recommendFeed, personalRadio, dailyRecommend, userFavorites, songUrlBest } from '../utils/api.js'
import { getSession, setSession } from '../utils/session.js'
import { deliverSong } from '../utils/send.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logError } from '../utils/log.js'
import { formatSongList } from '../utils/format.js'

function normalizeSong(item, idx = 0) {
  const singer = Array.isArray(item.singer)
    ? item.singer.map(s => s.name || s.title).filter(Boolean).join(' / ')
    : item.singername || item.singerName || item.singer || ''
  const albummid = item.albummid || item.album?.mid || ''
  const interval = Number(item.interval || item.songTime || 0)
  const duration = interval > 0
    ? `${String(Math.floor(interval / 60)).padStart(2, '0')}:${String(interval % 60).padStart(2, '0')}`
    : ''
  return {
    index: idx + 1,
    songmid: item.songmid || item.mid || '',
    songid: item.songid || item.id || 0,
    media_mid: item.media_mid || item.strMediaMid || item.songmid || '',
    songName: item.songname || item.songname_hilight?.replace(/<[^>]+>/g, '') || item.title || item.name || '',
    singerName: singer,
    albumName: item.albumname || item.album?.name || '',
    albummid,
    cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '',
    duration,
    interval,
    payplay: item.pay?.payplay ?? item.pay?.pay_play ?? item.payplay,
    raw: item,
  }
}

export class qqmusicChart extends Plugin {
  constructor() {
    super({
      name: 'QQ音乐-排行榜',
      dsc: '排行榜、推荐、电台、日推、收藏',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#?(qq|QQ)m\s*排行\s*(.*)$/, fnc: 'chart' },
        { reg: /^#?(qq|QQ)m\s*推荐$/, fnc: 'recommend' },
        { reg: /^#?(qq|QQ)m\s*(来首歌|随机|放一首|来一首)$/, fnc: 'randomSong' },
        { reg: /^#?(qq|QQ)m\s*电台$/, fnc: 'radio' },
        { reg: /^#?(qq|QQ)m\s*(日推|每日推荐)$/, fnc: 'daily' },
        { reg: /^#?(qq|QQ)m\s*收藏$/, fnc: 'favorites' },
      ],
    })
  }

  cfg() { return getCfg() }

  async chart(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').trim().match(/^#?(qq|QQ)m\s*排行\s*(.*)$/)
    const keyword = (m?.[2] || '').trim()
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    if (!keyword) {
      try {
        const groups = await topCategory(userKey)
        if (!groups.length) { await e.reply('获取排行榜失败'); return true }
        const allTops = groups.flatMap(g => (g.list || []).map(t => ({ ...t, group: g.title })))
        await setSession(scope, { type: 'topCategory', data: allTops, user_id: e.user_id })
        const lines = ['♫ QQ音乐排行榜']
        for (const g of groups) {
          lines.push(`【${g.title}】`)
          for (const t of g.list || []) lines.push(`  ${t.label}（#qqm排行 ${t.label}）`)
        }
        lines.push('\n发送 #qqm排行 榜单名 查看具体榜单')
        await e.reply(lines.join('\n'))
      } catch (err) {
        logError(`排行失败: ${err.message}`)
        await e.reply('排行失败，请稍后重试')
      }
      return true
    }

    try {
      const groups = await topCategory(userKey)
      const allTops = groups.flatMap(g => (g.list || []).map(t => ({ ...t, group: g.title })))
      const match = allTops.find(t => t.label && t.label.includes(keyword)) ||
                    allTops.find(t => keyword.includes(t.label)) ||
                    allTops.find(t => t.topId && String(t.topId) === keyword)
      if (!match) {
        const names = allTops.map(t => t.label).filter(Boolean).slice(0, 15).join('、')
        await e.reply(`未找到「${keyword}」\n可用榜单：${names}`)
        return true
      }

      await e.reply(`正在获取 ${match.label}...`)
      const detail = await topDetail(match.topId, { userKey })
      const songs = (detail.list || detail.data?.list || []).map((item, idx) => normalizeSong(item, idx)).filter(Boolean)
      if (!songs.length) { await e.reply('该榜单暂无数据'); return true }

      await setSession(scope, { type: 'top', data: songs, user_id: e.user_id, title: match.label })

      // 渲染列表卡片
      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: buildListCardData(match.label, songs),
          formatText: () => formatSongList(songs, match.label),
          tag: '排行卡片',
        })
        if (ok) return true
      }

      await e.reply(formatSongList(songs, match.label))
    } catch (err) {
      logError(`排行失败: ${err.message}`)
      await e.reply('排行失败，请稍后重试')
    }
    return true
  }

  async recommend(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在获取推荐歌单...')
      const list = await recommendHot(userKey)
      if (!list.length) { await e.reply('获取推荐失败'); return true }

      const lines = ['♫ 热门推荐歌单']
      for (let i = 0; i < Math.min(list.length, 15); i++) {
        const p = list[i]
        lines.push(`${i + 1}. ${p.title || p.dissname || '未知'} (${p.listenNum || p.listennum || 0}次播放)`)
      }
      lines.push('\n发送 #qqm推荐听序号 查看歌单歌曲')

      await setSession(scope, { type: 'recommend', data: list, user_id: e.user_id })

      // 渲染热搜卡片样式的推荐卡片
      if (cfg.renderListCard !== false) {
        const { buildHotCardData } = await import('../utils/card-data.js')
        const { renderHotCard } = await import('../utils/render.js')
        const hotItems = list.slice(0, 15).map(p => ({
          k: p.title || p.dissname || '',
          n: p.listenNum || p.listennum || 0,
        }))
        const ok = await replyCardOrText(e, {
          render: renderHotCard,
          data: buildHotCardData(hotItems),
          formatText: () => lines.join('\n'),
          tag: '推荐卡片',
        })
        if (ok) return true
      }

      await e.reply(lines.join('\n'))
    } catch (err) {
      logError(`推荐失败: ${err.message}`)
      await e.reply('推荐失败，请稍后重试')
    }
    return true
  }

  // ──────────── 来首歌（随机推荐一首） ────────────

  async randomSong(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在为你推荐...')
      const songs = await recommendFeed(userKey)
      if (!songs.length) { await e.reply('获取推荐失败，请重试'); return true }

      const song = songs[Math.floor(Math.random() * songs.length)]
      await e.reply(`♪ ${song.songName} - ${song.singerName}`)

      const play = await songUrlBest(song.songmid, {
        quality: cfg.quality || 'flac',
        mediaId: song.media_mid || song.songmid,
        fallback: cfg.qualityFallback !== false,
        userKey,
      })
      if (!play.url) {
        await e.reply('获取播放链失败，请 #qqm登录')
        return true
      }
      await deliverSong(e, song, play)
    } catch (err) {
      logError(`推荐失败: ${err.message}`)
      await e.reply('推荐失败，请稍后重试')
    }
    return true
  }

  // ──────────── 个性电台 ────────────

  async radio(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在获取个性电台...')
      const songs = await personalRadio(5, userKey)
      if (!songs.length) { await e.reply('获取电台失败，请重试'); return true }

      await setSession(scope, { type: 'radio', data: songs, user_id: e.user_id, title: '个性电台' })
      await e.reply(formatSongList(songs, '个性电台'))
    } catch (err) {
      logError(`电台失败: ${err.message}`)
      await e.reply('电台失败，请稍后重试')
    }
    return true
  }

  // ──────────── 每日推荐 ────────────

  async daily(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在获取每日推荐...')
      const { songs, title } = await dailyRecommend({ songNum: 30, userKey })
      if (!songs.length) {
        await e.reply('📭 每日推荐为空\n可能原因：\n1. 今日已获取过，请明天再试\n2. 账号无听歌记录，无法生成推荐\n请先 #qqm登录 绑定有听歌记录的账号')
        return true
      }

      await setSession(scope, { type: 'daily', data: songs, user_id: e.user_id, title: title || '每日推荐' })
      await e.reply(formatSongList(songs, title || '每日推荐'))
    } catch (err) {
      logError(`日推失败: ${err.message}`)
      if (err.message?.includes('登录') || err.message?.includes('login') || err.code === -1) {
        await e.reply('日推失败，请先 #qqm登录 后重试')
      } else {
        await e.reply(`日推失败：${err.message || '未知错误'}`)
      }
    }
    return true
  }

  // ──────────── 我的收藏 ────────────

  async favorites(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const scope = e.group_id || e.user_id
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在获取收藏...')
      const { songs, title } = await userFavorites({ songNum: 30, userKey })
      if (!songs.length) {
        await e.reply('📭 我的收藏为空\n你的 QQ 音乐「我喜欢」歌单还没有收藏任何歌曲\n\n💡 你可以在 QQ 音乐 App 中收藏歌曲后再来查看')
        return true
      }

      await setSession(scope, { type: 'favorites', data: songs, user_id: e.user_id, title: title || '我的收藏' })
      await e.reply(formatSongList(songs, title || '我的收藏'))
    } catch (err) {
      logError(`收藏失败: ${err.message}`)
      if (err.message?.includes('登录') || err.message?.includes('login') || err.code === -1) {
        await e.reply('收藏失败，请先 #qqm登录 后重试')
      } else {
        await e.reply(`收藏失败：${err.message || '未知错误'}`)
      }
    }
    return true
  }
}
