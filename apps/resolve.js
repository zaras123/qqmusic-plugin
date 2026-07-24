/**
 * QQ 音乐分享卡片 / 链接解析
 * 参考 rconsole-plugin apps/tools.js qqMusic
 */
import { loadPluginBase } from '../utils/plugin-base.js'
import {
  parseQQMusicCard,
  parseQQMusicIds,
  searchSongs,
  songUrlBest,
  songDetail,
  parseQQMusicExtendedIds,
  albumSongs,
  songlistDetail,
  singerSongs,
} from '../utils/api.js'
import { deliverSong, QUALITY_LABEL } from '../utils/send.js'
import { setSession } from '../utils/session.js'
import { getCfg, isPluginCommandMsg, replyCardOrText } from '../utils/common.js'
import { logError, logInfo, logWarn } from '../utils/log.js'

const plugin = await loadPluginBase()

function collectMessageText(e) {
  const parts = []
  const push = (v) => {
    if (v == null) return
    if (typeof v === 'string') {
      if (v) parts.push(v)
      return
    }
    if (typeof v === 'object') {
      try {
        parts.push(JSON.stringify(v))
      } catch {}
    }
  }

  push(e.msg)
  push(e.raw_message)
  push(e.raw)
  push(e.message_id && e.message)
  // QQBot / TRSS 常见字段
  push(e.toString?.())
  push(e.raw?.content)
  push(e.raw?.message)
  push(e.raw?.d?.content)
  push(e.raw?.d?.message)
  if (e.raw?.d?.attachments) push(e.raw.d.attachments)
  if (Array.isArray(e.attachments)) push(e.attachments)

  const walkSeg = (seg) => {
    if (!seg) return
    if (typeof seg === 'string') {
      push(seg)
      return
    }
    if (Array.isArray(seg)) {
      for (const s of seg) walkSeg(s)
      return
    }
    if (typeof seg !== 'object') return
    if (seg.type === 'text') push(seg.text ?? seg.data?.text)
    if (seg.type === 'json') push(seg.data)
    if (seg.type === 'xml') push(seg.data)
    if (seg.type === 'share' || seg.type === 'music' || seg.type === 'ark') {
      push(seg)
      push(seg.data)
    }
    // QQBot markdown / 链接按钮
    if (seg.type === 'markdown') push(seg.content ?? seg.data)
    if (seg.url) push(seg.url)
    if (seg.data) {
      push(seg.data)
      if (typeof seg.data === 'object') {
        push(seg.data.data)
        push(seg.data.text)
        push(seg.data.content)
        push(seg.data.url)
        push(seg.data.jumpUrl)
        push(seg.data.jump_url)
        push(seg.data.preview)
      }
    }
  }

  if (Array.isArray(e.message)) {
    for (const seg of e.message) walkSeg(seg)
  } else {
    walkSeg(e.message)
  }

  // 部分协议把分享放在 e.msg 已是 JSON 字符串
  return parts.join('\n')
}

function isQQMusicMessage(text) {
  if (!text) return false
  if (/y\.qq\.com|c6\.y\.qq\.com|i\.y\.qq\.com|qqmusic|QQ音乐/i.test(text)) return true
  if (/100497308/.test(text)) return true
  if (/com\.tencent\.(structmsg|music\.lua)/.test(text)) return true
  if (/sdkshare_music|songmid=|playsong\.html/i.test(text)) return true
  return false
}

export class qqmusicResolve extends plugin {
  constructor() {
    super({
      name: 'QQ音乐-解析',
      dsc: '解析 QQ 音乐分享卡片与链接',
      event: 'message',
      // 数值越小越先匹配。R 插件 qqMusic 常为 500~1500，这里用 50 抢先处理
      priority: 50,
      rule: [
        {
          // 尽量只匹配 QQ 音乐相关，避免全量 .* 抢其它命令
          reg: '(y\\.qq\\.com|c6\\.y\\.qq\\.com|i\\.y\\.qq\\.com|qqmusic|QQ音乐|100497308|music\\.lua|structmsg|songmid|sdkshare_music)',
          fnc: 'resolve',
          log: false,
        },
      ],
    })
  }

  cfg() {
    return getCfg()
  }

  /**
   * accept 在 rule 之前执行（loader 优先 accept）。
   * 识别到 QQ 音乐分享时：本插件处理，并标记 e 阻止后续插件重复解析。
   */
  async accept(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableResolve === false) return

    const text = collectMessageText(e)
    if (!isQQMusicMessage(text)) return
    if (isPluginCommandMsg(e.msg)) return

    try {
      const ok = await this.handle(e, text, cfg)
      if (ok) {
        e.msg = `#qqmusic_resolved_${Date.now()}`
        e._qqmusicResolved = true
        return 'return'
      }
    } catch (err) {
      logError(`accept 解析失败: ${err.message}`)
    }
  }

  async resolve(e) {
    if (e._qqmusicResolved) return true

    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableResolve === false) return false

    const text = collectMessageText(e)
    if (!isQQMusicMessage(text)) return false
    if (isPluginCommandMsg(e.msg)) return false

    try {
      return await this.handle(e, text, cfg)
    } catch (err) {
      logError(`解析失败: ${err.message}`)
      return false
    }
  }

  async handle(e, text, cfg) {
    const userKey = String(e.user_id || '')
    let song = null
    let fromCard = false

    if (cfg.resolveCards !== false) {
      const card = parseQQMusicCard(text)
      if (card) {
        fromCard = true
        logInfo(`识别卡片: ${card.title} - ${card.desc}`)
        song = await this.cardToSong(card, userKey)
      }
    }

    if (!song && cfg.resolveLinks !== false) {
      const urlMatch = text.match(
        /https?:\/\/(?:[a-z0-9-]+\.)?(?:y\.qq\.com|c6\.y\.qq\.com)[^\s一-龥]*/i
      )
      if (urlMatch) {
        const url = urlMatch[0]
        logInfo(`识别链接: ${url}`)

        // 优先识别专辑/歌单/歌手链接
        const extIds = parseQQMusicExtendedIds(url)

        if (extIds.albummid) {
          try {
            const result = await albumSongs(extIds.albummid, { userKey })
            const songs = (result.list || []).map((item, idx) => ({
              songmid: item.songmid || item.mid || '',
              songid: item.songid || item.id || 0,
              media_mid: item.media_mid || item.songmid || '',
              songName: item.songname || item.title || item.name || '',
              singerName: Array.isArray(item.singer) ? item.singer.map(s => s.name).join(' / ') : item.singername || '',
              albumName: item.albumname || item.album?.name || '',
              albummid: extIds.albummid,
              cover: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${extIds.albummid}.jpg`,
            }))
            if (songs.length) {
              const scope = e.group_id || e.user_id
              await setSession(scope, { type: 'album', data: songs, user_id: e.user_id, title: '专辑' })
              await e.reply(`识别到专辑链接，共${songs.length}首。发送 #qqm听序号 播放`)
              return true
            }
          } catch (err) { logWarn(`专辑解析失败: ${err.message}`) }
        }

        if (extIds.disstid) {
          try {
            const detail = await songlistDetail(extIds.disstid, userKey)
            const raw = detail.songlist || []
            const songs = raw.map((item, idx) => ({
              songmid: item.songmid || item.mid || '',
              songid: item.songid || item.id || 0,
              media_mid: item.media_mid || item.songmid || '',
              songName: item.songname || item.title || item.name || '',
              singerName: Array.isArray(item.singer) ? item.singer.map(s => s.name).join(' / ') : item.singername || '',
              albumName: item.albumname || item.album?.name || '',
              albummid: item.albummid || item.album?.mid || '',
              cover: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
            }))
            if (songs.length) {
              const scope = e.group_id || e.user_id
              const title = detail.dissname || detail.title || '歌单'
              await setSession(scope, { type: 'playlist', data: songs, user_id: e.user_id, title })
              await e.reply(`识别到歌单「${title}」，共${songs.length}首。发送 #qqm听序号 播放`)
              return true
            }
          } catch (err) { logWarn(`歌单解析失败: ${err.message}`) }
        }

        if (extIds.singermid) {
          try {
            const result = await singerSongs(extIds.singermid, { pageSize: 30, userKey })
            if (result.list?.length) {
              const scope = e.group_id || e.user_id
              const title = '歌手热门歌曲'
              await setSession(scope, { type: 'singer', data: result.list, user_id: e.user_id, title })
              await e.reply(`识别到歌手链接，热门歌曲${result.list.length}首。发送 #qqm听序号 播放`)
              return true
            }
          } catch (err) { logWarn(`歌手解析失败: ${err.message}`) }
        }

        // 原有：单曲链接解析
        const ids = parseQQMusicIds(url)
        song = await this.idsToSong(ids, text, userKey)
      }
    }

    if (!song) {
      if (fromCard) {
        await e.reply('识别到 QQ 音乐分享，但未能提取歌曲信息')
        return true
      }
      return false
    }

    // 取最高可用音质并下载发送
    let play = {
      url: '',
      quality: cfg.quality || 'flac',
      qualityLabel: QUALITY_LABEL[cfg.quality] || cfg.quality || '',
    }
    if (song.songmid) {
      try {
        // 详情补 media_mid（部分曲 songmid != media_mid）
        if (!song.media_mid || song.media_mid === song.songmid) {
          try {
            const detail = await songDetail(song.songmid, userKey)
            const file = detail?.track_info?.file || {}
            if (file.media_mid) song.media_mid = file.media_mid
            if (!song.songid && detail?.track_info?.id) song.songid = detail.track_info.id
            if (!song.albummid && detail?.track_info?.album?.mid) {
              song.albummid = detail.track_info.album.mid
            }
          } catch {
            /* ignore */
          }
        }
        play = await songUrlBest(song.songmid, {
          quality: cfg.quality || 'flac',
          mediaId: song.media_mid || song.songmid,
          fallback: cfg.qualityFallback !== false,
          userKey,
        })
      } catch (err) {
        logWarn(`播放链: ${err.message}`)
        play.error = err.message
      }
    }

    // 尝试渲染详情卡片，失败则纯文本
    const qLabel = play.qualityLabel || QUALITY_LABEL[play.quality] || play.quality || ''
    const prefix = cfg.identifyPrefix || '识别：'
    let failHint = ''
    if (!play.url) {
      const errText = String(play.error || '').slice(0, 220)
      const pay = play.raw?.pay || play.pay
      if (errText) {
        failHint = `⚠ ${errText}`
      } else if (pay && Number(pay.pay_play) === 1) {
        failHint = '⚠ 该曲需会员播放，请 #qqm登录'
      } else {
        failHint = '⚠ 未获取到播放链（请 #qqm登录 重新扫码；或 #qqm刷新 后重试）'
      }
    }

    // 渲染详情卡片
    try {
      const { buildDetailCardData } = await import('../utils/card-data.js')
      const { renderDetailCard } = await import('../utils/render.js')
      const cardData = buildDetailCardData(song, {
        qualityLabel: qLabel,
        payplay: Boolean(song.payplay),
        source: fromCard ? '卡片' : '链接',
      })
      cardData.tip = play.url
        ? `正在下载并发送语音（${qLabel || '默认音质'}）...`
        : (failHint || '未获取到播放链')
      const img = await renderDetailCard(e, cardData)
      if (img) {
        await e.reply(img)
      } else {
        // 卡片渲染失败，纯文本兜底
        await e.reply(
          [
            `${prefix}QQ音乐 · 解析下载中`,
            `♪ ${song.songName || '未知'} - ${song.singerName || '未知'}`,
            song.albumName ? `专辑：${song.albumName}` : '',
            play.url && qLabel ? `音质：${qLabel}` : '',
            failHint,
          ].filter(Boolean).join('\n')
        )
      }
    } catch {
      // 纯文本兜底
      await e.reply(
        [
          `${prefix}QQ音乐 · 解析下载中`,
          `♪ ${song.songName || '未知'} - ${song.singerName || '未知'}`,
          play.url && qLabel ? `音质：${qLabel}` : '',
          failHint,
        ].filter(Boolean).join('\n')
      )
    }

    // 跳过 deliverSong 内的文本/原生卡，只下语音+群文件
    await deliverSong(e, song, play, {
      skipTextInfo: true,
      skipNativeCard: true,
      skipCustomCard: true,
    })

    return true
  }

  async cardToSong(card, userKey = '') {
    if (card.songmid) {
      return this.idsToSong(card, '', userKey)
    }
    if (card.keyword || card.title) {
      const kw = (card.keyword || `${card.title} ${card.desc}`).trim()
      const list = await searchSongs(kw, { pageSize: 5 })
      if (list.length) {
        const hit =
          list.find(
            (s) =>
              card.title &&
              (s.songName.includes(card.title.slice(0, 8)) ||
                card.title.includes(s.songName.slice(0, 8)))
          ) || list[0]
        if (card.cover) hit.cover = card.cover
        return hit
      }
    }
    return {
      songmid: card.songmid || '',
      songid: card.songid || 0,
      media_mid: card.media_mid || '',
      songName: card.title || '未知',
      singerName: card.desc || '',
      cover: card.cover || '',
      albumName: '',
      albummid: card.albummid || '',
    }
  }

  async idsToSong(ids, fallbackText = '', userKey = '') {
    const songmid = ids.songmid || ''
    let songid = ids.songid || 0
    let media_mid = ids.media_mid || ''
    let albummid = ids.albummid || ''

    if (songmid) {
      try {
        const detail = await songDetail(songmid, userKey)
        const track = detail?.track_info || detail?.info || detail
        const name = track?.name || track?.title || detail?.name || songmid
        const singers =
          track?.singer?.map((s) => s.name).join(' / ') || track?.singername || ''
        albummid = albummid || track?.album?.mid || ''
        media_mid = media_mid || track?.file?.media_mid || track?.media_mid || songmid
        songid = songid || track?.id || 0
        return {
          songmid,
          songid,
          media_mid,
          songName: name,
          singerName: singers,
          albumName: track?.album?.name || '',
          albummid,
          cover: albummid
            ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg`
            : '',
        }
      } catch (err) {
        logWarn(`详情失败: ${err.message}`)
      }
    }

    const prefix = String(fallbackText)
      .replace(/https?:\/\/\S+/g, '')
      .replace(/@\S+/g, '')
      .replace(/[《》]/g, ' ')
      .trim()
    if (prefix) {
      const list = await searchSongs(prefix, { pageSize: 3 })
      if (list.length) return list[0]
    }

    if (songid && !songmid) {
      return {
        songmid: '',
        songid,
        media_mid: '',
        songName: `歌曲${songid}`,
        singerName: '',
        albumName: '',
        albummid: '',
        cover: '',
      }
    }

    return null
  }
}
