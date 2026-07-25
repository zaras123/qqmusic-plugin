/**
 * QQ 音乐点歌
 * 命令统一 #qqm 前缀，避免与其它插件 #点歌/#播放 冲突:
 *   #qqm点歌 / #qqm 点歌 关键词
 *   #qqm听1 ~ #qqm听N（兼容：本插件会话内仍可用 #听N）
 *   #qqm播放 关键词
 *   #qqm歌词 关键词或songmid
 *   #qqm热搜
 */
import { loadPluginBaseSync } from '../utils/plugin-base.js'

let Plugin = null
let _pluginPromise = null

function ensurePlugin() {
  if (Plugin) return true
  if (!_pluginPromise) {
    _pluginPromise = loadPluginBase().then(p => {
      Plugin = p
      return p
    })
  }
  return false
}

// Kick off loading immediately
ensurePlugin()

import { searchSongs, songUrlBest, lyric, hotKeys } from '../utils/api.js'
import { getSession, setSession } from '../utils/session.js'
import { deliverSong, sendNativeMusicCard, QUALITY_LABEL } from '../utils/send.js'
import { buildHelpCardData } from '../utils/help-card.js'
import { renderHelpCard } from '../utils/render.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logError, logWarn } from '../utils/log.js'

/** 匹配 #qqm点歌 / #qqm 点歌 等 */
const RE_PICK = /^#?(?:qq|QQ)m\s*点歌\s*(.+)$/
const RE_LISTEN = /^#?(?:qq|QQ)m\s*听\s*([1-9][0-9]?)$|^#听\s*([1-9][0-9]?)$/
const RE_PLAY = /^#?(?:qq|QQ)m\s*播放\s*(.+)$/
const RE_LYRIC = /^#?(?:qq|QQ)m\s*歌词\s*(.+)$/

function formatListText(list) {
  const lines = list.map((s, i) => {
    const pay = s.payplay ? ' [付费]' : ''
    return `${i + 1}. ${s.songName} - ${s.singerName}${pay}${s.duration ? ` (${s.duration})` : ''}`
  })
  return `♫ QQ音乐点歌结果（#qqm听序号 或 #听序号）\n${lines.join('\n')}`
}

async function resolvePlay(song, cfg, userKey = '') {
  const quality = cfg.quality || 'flac'
  const fallback = cfg.qualityFallback !== false
  try {
    const play = await songUrlBest(song.songmid, {
      quality,
      mediaId: song.media_mid || song.songmid,
      fallback,
      userKey,
    })
    return {
      url: play.url || '',
      quality: play.quality,
      qualityLabel: play.qualityLabel || QUALITY_LABEL[play.quality] || play.quality,
      raw: play,
    }
  } catch (e) {
    return {
      url: '',
      quality,
      qualityLabel: QUALITY_LABEL[quality] || quality,
      error: e.message,
      raw: e.payload,
    }
  }
}

export class qqmusicSong extends loadPluginBaseSync() {
  constructor() {
    super({
      name: 'QQ音乐-点歌',
      dsc: '对接 qqmusic-api-enhanced 的点歌',
      event: 'message',
      priority: 400,
      rule: [
        {
          reg: '^#?(qq|QQ)m\\s*点歌\\s*(.+)$',
          fnc: 'pickSong',
        },
        {
          // #qqm听N 正式指令；#听N 仅在本插件会话存在时响应（不抢其它插件）
          reg: '^#?(qq|QQ)m\\s*听\\s*([1-9][0-9]?)$|^#听\\s*([1-9][0-9]?)$',
          fnc: 'chooseSong',
        },
        {
          reg: '^#?(qq|QQ)m\\s*播放\\s*(.+)$',
          fnc: 'playDirect',
        },
        {
          reg: '^#?(qq|QQ)m\\s*歌词\\s*(.+)$',
          fnc: 'getLyric',
        },
        {
          reg: '^#?(qq|QQ)m\\s*热搜$',
          fnc: 'hotSearch',
        },
        {
          reg: '^#?(qq|QQ)m\\s*帮助$|^#?(qq|QQ)音乐帮助$|^#?(qq|QQ)m\\s*help$|^#qm帮助$',
          fnc: 'help',
        },
      ],
    })
  }

  cfg() {
    return getCfg()
  }

  async pickSong(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false

    const m = String(e.msg || '').trim().match(RE_PICK)
    const keyword = m?.[1]?.trim()
    if (!keyword) {
      await e.reply('用法：#qqm点歌 关键词')
      return true
    }

    try {
      await e.reply(`正在搜索：${keyword}`)
      const list = await searchSongs(keyword, {
        pageSize: Math.min(Number(cfg.maxList) || 10, 20),
      })
      if (!list.length) {
        await e.reply('没有搜到相关歌曲')
        return true
      }

      const scope = e.group_id || e.user_id
      await setSession(scope, {
        keyword,
        data: list,
        user_id: e.user_id,
      })

      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: buildListCardData(keyword, list),
          formatText: () => formatListText(list),
          tag: '列表卡片',
        })
        if (ok) return true
      }

      await e.reply(formatListText(list))
    } catch (err) {
      logError(`点歌失败: ${err.message}`)
      await e.reply(`点歌失败：${err.message}`)
    }
    return true
  }

  async chooseSong(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false

    const m = String(e.msg || '').trim().match(RE_LISTEN)
    const n = Number(m?.[1] || m?.[2] || 0)
    const scope = e.group_id || e.user_id
    const session = await getSession(scope)
    if (!session?.data?.length) {
      // 无本插件会话时不抢其它插件的 #听 / #qqm听
      return false
    }
    if (n < 1 || n > session.data.length) {
      await e.reply(`请选择 1-${session.data.length}`)
      return true
    }

    const song = session.data[n - 1]
    const userKey = String(e.user_id || '')

    // 先获取播放链接信息
    const play = await resolvePlay(song, cfg, userKey)

    // 渲染详情卡片（与解析功能统一风格）
    try {
      const { buildDetailCardData } = await import('../utils/card-data.js')
      const { renderDetailCard } = await import('../utils/render.js')
      const cardData = buildDetailCardData(song, {
        qualityLabel: play.qualityLabel || play.quality || '',
        payplay: Boolean(song.payplay),
        source: '点歌',
        hasUrl: Boolean(play.url),
      })
      cardData.tip = play.url
        ? `正在下载并发送语音（${play.qualityLabel || play.quality || '默认音质'}）...`
        : `获取播放链接失败${play.error ? `：${play.error}` : ''}\n请 #qqm登录`

      const img = await renderDetailCard(e, cardData)
      if (img) {
        await e.reply(img)
      } else {
        // 纯文本兜底
        const { formatDetailText } = await import('../utils/card-data.js')
        if (play.url) {
          await e.reply(`下载中：${song.songName}（${play.qualityLabel || play.quality}）…`)
        } else {
          await e.reply(
            [
              `♪ ${song.songName} - ${song.singerName}${song.payplay ? ' [会员/付费]' : ''}`,
              song.albumName ? `专辑：${song.albumName}` : '',
              play.error ? `错误：${play.error}` : '获取播放链接失败，请 #qqm登录',
            ].filter(Boolean).join('\n')
          )
        }
      }
    } catch {
      const { formatDetailText } = await import('../utils/card-data.js')
      await e.reply(formatDetailText(song, { qualityLabel: play.qualityLabel, hasUrl: Boolean(play.url) }))
    }

    if (!play.url) {
      if (cfg.sendNativeCard && song.songid) {
        await sendNativeMusicCard(e, 'qq', song.songid)
      }
      return true
    }

    await deliverSong(e, song, play)
    return true
  }

  async playDirect(e) {
    const cfg = this.cfg()
    if (!cfg.enable || cfg.enableSongRequest === false) return false
    const m = String(e.msg || '').trim().match(RE_PLAY)
    const keyword = m?.[1]?.trim()
    if (!keyword) {
      await e.reply('用法：#qqm播放 关键词')
      return true
    }
    try {
      const list = await searchSongs(keyword, { pageSize: 1 })
      if (!list.length) {
        await e.reply('没有搜到相关歌曲')
        return true
      }
      const song = list[0]
      const userKey = String(e.user_id || '')
      const play = await resolvePlay(song, cfg, userKey)

      // 渲染详情卡片（与解析功能统一风格）
      try {
        const { buildDetailCardData } = await import('../utils/card-data.js')
        const { renderDetailCard } = await import('../utils/render.js')
        const cardData = buildDetailCardData(song, {
          qualityLabel: play.qualityLabel || play.quality || '',
          payplay: Boolean(song.payplay),
          source: '播放',
          hasUrl: Boolean(play.url),
        })
        cardData.tip = play.url
          ? `正在下载并发送语音（${play.qualityLabel || play.quality || '默认音质'}）...`
          : `获取播放链接失败${play.error ? `：${play.error}` : ''}\n请 #qqm登录`
        const img = await renderDetailCard(e, cardData)
        if (img) {
          await e.reply(img)
        } else {
          const { formatDetailText } = await import('../utils/card-data.js')
          if (play.url) {
            await e.reply(`下载中：${song.songName}（${play.qualityLabel || play.quality}）…`)
          } else {
            await e.reply(
              [
                `♪ ${song.songName} - ${song.singerName}${song.payplay ? ' [会员/付费]' : ''}`,
                song.albumName ? `专辑：${song.albumName}` : '',
                play.error ? `错误：${play.error}` : '获取播放链接失败，请 #qqm登录',
              ].filter(Boolean).join('\n')
            )
          }
        }
      } catch {
        const { formatDetailText } = await import('../utils/card-data.js')
        await e.reply(formatDetailText(song, { qualityLabel: play.qualityLabel, hasUrl: Boolean(play.url) }))
      }

      if (!play.url) {
        if (cfg.sendNativeCard && song.songid) {
          await sendNativeMusicCard(e, 'qq', song.songid)
        }
        return true
      }
      await deliverSong(e, song, play)
    } catch (err) {
      await e.reply(`播放失败：${err.message}`)
    }
    return true
  }

  async getLyric(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const m = String(e.msg || '').trim().match(RE_LYRIC)
    const key = m?.[1]?.trim()
    if (!key) {
      await e.reply('用法：#qqm歌词 关键词')
      return true
    }

    try {
      let songmid = key
      let songMeta = { songName: key, singerName: '', cover: '', albumName: '' }
      if (!/^[0-9A-Za-z]{10,}$/.test(key) || /[一-龥]/.test(key)) {
        const list = await searchSongs(key, { pageSize: 1 })
        if (!list.length) {
          await e.reply('未找到歌曲')
          return true
        }
        songmid = list[0].songmid
        songMeta = {
          songName: list[0].songName || key,
          singerName: list[0].singerName || '',
          cover: list[0].cover || '',
          albumName: list[0].albumName || '',
        }
      }
      const data = await lyric(songmid, String(e.user_id || ''))
      const text = data?.lyric || ''
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\[[^\]]*]/, '').trim())
        .filter(Boolean)
        .slice(0, 40)
      if (!lines.length) {
        await e.reply('暂无歌词')
        return true
      }

      const { buildLyricCardData, formatLyricText } = await import('../utils/card-data.js')
      const { renderLyricCard } = await import('../utils/render.js')
      const card = buildLyricCardData({ ...songMeta, songmid, lines })
      await replyCardOrText(e, {
        render: renderLyricCard,
        data: card,
        formatText: formatLyricText,
        tag: '歌词卡片',
        onFallback: async () => {
          await e.reply(
            [
              songMeta.songName
                ? `歌词：${songMeta.songName} - ${songMeta.singerName || '未知'}`
                : '',
              lines.join('\n'),
            ]
              .filter(Boolean)
              .join('\n')
          )
        },
      })
    } catch (err) {
      await e.reply(`歌词失败：${err.message}`)
    }
    return true
  }

  async hotSearch(e) {
    try {
      const list = await hotKeys(String(e.user_id || ''))
      const tops = (Array.isArray(list) ? list : []).slice(0, 15)
      if (!tops.length) {
        await e.reply('暂无热搜')
        return true
      }

      const { buildHotCardData, formatHotText } = await import('../utils/card-data.js')
      const { renderHotCard } = await import('../utils/render.js')
      await replyCardOrText(e, {
        render: renderHotCard,
        data: buildHotCardData(tops),
        formatText: () => formatHotText(tops),
        tag: '热搜卡片',
        onFallback: async () => {
          const text = tops
            .map(
              (item, i) =>
                `${i + 1}. ${item.k || item.keyword || item.query || JSON.stringify(item)}`
            )
            .join('\n')
          await e.reply(`QQ音乐热搜\n${text}`)
        },
      })
    } catch (err) {
      await e.reply(`热搜失败：${err.message}`)
    }
    return true
  }

  async help(e) {
    const cfg = this.cfg()
    try {
      const data = buildHelpCardData()
      const img = await renderHelpCard(e, data)
      if (img) {
        await e.reply(img)
        return true
      }
    } catch (err) {
      logWarn(`帮助图渲染失败: ${err.message}`)
    }

    // 降级纯文本
    await e.reply(
      [
        '【QQ音乐插件帮助】',
        '— 点歌（均需 #qqm 前缀）—',
        '#qqm点歌 七里香  →  #qqm听1（会话内也可 #听1）',
        '#qqm播放 晴天',
        '#qqm歌词 七里香  /  #qqm热搜',
        '— 状态 —',
        '#qqm登录  /  #qqm状态  /  #qms  /  #qqm登出',
        '— 管理（主人）—',
        '#qqm设置  /  #qqm 音质 flac  /  #qqm 测试',
        '— 解析 —',
        '分享 QQ 音乐卡片或 y.qq.com 链接自动解析',
        `API: ${cfg.apiBase ? '已配置' : '未配置'}`,
      ].join('\n')
    )
    return true
  }
}
