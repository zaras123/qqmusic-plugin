/**
 * 排行榜 + 推荐 + 电台 + 日推 + 收藏
 * 命令：#qqm排行 / #qqm推荐 / #qqm来首歌 / #qqm电台 / #qqm日推 / #qqm收藏
 */
import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import { topCategory, topDetail, recommendHot, recommendFeed, personalRadio, dailyRecommend, userFavorites, songUrlBest, newSongs as newSongsApi, mvCategory, mvByTag, mvUrl, searchMv } from '../utils/api.js'
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

export class qqmusicChart extends (await loadPluginBase()) {
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
        { reg: /^#?(qq|QQ)m\s*新歌(?:\s*(\d+))?$/, fnc: 'newSongs' },
        { reg: /^#?(qq|QQ)m\s*(MV|mv)\s*(.*)$/, fnc: 'mv' },
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

  // ──────────── 新歌速递（#qqm新歌） ────────────

  async newSongs(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const userKey = String(e.user_id || '')
    const scope = String(e.group_id || e.user_id)
    // #qqm新歌 [type]：type 来自 lanlist（1 内地 / 2 欧美 / 3 日本 / 4 韩国 / 5 最新 / 6 港台），默认 5
    const m2 = String(e.msg || '').trim().match(/^#?(qq|QQ)m\s*新歌(?:\s*(\d+))?$/)
    const type = Number(m2?.[1]) || 5

    try {
      await e.reply('正在获取新歌速递…')
      const songs = await newSongsApi(type, { num: 20, userKey })
      if (!songs.length) { await e.reply('获取新歌失败，请重试'); return true }
      await setSession(scope, { type: 'newSongs', data: songs, user_id: e.user_id, title: '新歌速递' })

      // 渲染列表卡片（与排行/歌手同款），失败回退文本
      if (cfg.renderListCard !== false) {
        const { buildListCardData } = await import('../utils/card-data.js')
        const { renderListCard } = await import('../utils/render.js')
        const ok = await replyCardOrText(e, {
          render: renderListCard,
          data: buildListCardData('新歌速递', songs),
          formatText: () => formatSongList(songs, '新歌速递'),
          tag: '新歌卡片',
        })
        if (ok) return true
      }

      await e.reply(formatSongList(songs, '新歌速递'))
    } catch (err) {
      logError(`新歌失败: ${err.message}`)
      await e.reply('获取新歌失败，请稍后重试')
    }
    return true
  }

  // ──────────── MV 搜索/浏览/播放/下载（#qqmMV / #qqmMV[搜索] 词 / #qqmMV[播放|下载] 序号|vid） ────────────

  async mv(e) {
    const cfg = this.cfg()
    if (!cfg.enable) return false
    const userKey = String(e.user_id || '')
    const scope = String(e.group_id || e.user_id)
    const m = String(e.msg || '').trim().match(/^#?(qq|QQ)m\s*(MV|mv)\s*(.*)$/)
    const rest = (m?.[3] || '').trim()

    const sendVideo = (videoFile, title) => {
      const seg = global.segment
      if (seg?.video) return e.reply(seg.video(videoFile, `${title}.mp4`)).then(() => true)
      return Promise.resolve(false)
    }

    // 播放/下载/搜索 前缀分发（兼容紧凑写法：播放1 / 搜索周杰伦）
    const verbMatch = rest.match(/^(播放|下载|搜索)[:：]?\s*(.*)$/)
    const verb = verbMatch ? verbMatch[1] : ''
    let argText = (verbMatch ? verbMatch[2] : rest).trim()
    const isPlay = verb === '播放'
    const isDl = verb === '下载'
    const isSearch = verb === '搜索'

    try {
      // #qqmMV搜索 关键词
      if (isSearch) {
        if (!argText) {
          await e.reply('#qqmMV 搜索 关键词')
          return true
        }
        await e.reply(`正在搜索「${argText}」的 MV…`)
        const mvlist = await searchMv(argText, { pageSize: 10, userKey })
        if (!mvlist.length) { await e.reply(`没搜到「${argText}」的 MV`); return true }
        await setSession(scope, { type: 'mvList', data: mvlist, user_id: e.user_id, title: argText })
        const lines = [
          `♫ MV 搜索：${argText}`,
          ...mvlist.map((v, i) => `${v.index || i + 1}. ${v.mvtitle}${v.singerName ? ` - ${v.singerName}` : ''}`),
          '\n发 #qqmMV 播放 / 下载 序号',
        ]
        await e.reply(lines.join('\n'))
        return true
      }

      // #qqmMV播放 / #qqmMV下载：纯数字 → 会话序号；否则视为直接 vid
      if (isPlay || isDl) {
        if (!argText) {
          // 无目标：试试点歌后记住的「本曲 MV」（点歌卡显示的 #qqmMV 播放/下载）
          const session = await getSession(scope)
          if (session?.lastMvVid) {
            argText = session.lastMvVid
          } else {
            await e.reply('用法：#qqmMV 播放/下载 序号 或 vid；点歌后再发 #qqmMV 播放/下载 可直接操作该曲 MV')
            return true
          }
        }
        let mv = null
        if (/^\d+$/.test(argText)) {
          const session = await getSession(scope)
          if (!session?.data?.length) {
            await e.reply('请先 #qqm点歌 / #qqmMV 搜索 出列表')
            return true
          }
          const n = Number(argText)
          if (session.type === 'mvList') {
            // MV 列表会话：直接取 MV 对象
            mv = session.data[n - 1]
            if (!mv) { await e.reply(`请选择 1-${session.data.length}`); return true }
          } else {
            // 点歌歌单会话：取对应歌曲的 MV（点歌列表 🎬 徽标的数据来源）
            const song = session.data[n - 1]
            if (!song) { await e.reply(`请选择 1-${session.data.length}`); return true }
            if (!song.mvVid) {
              await e.reply(`第 ${n} 首「${song.songName || ''}」没有 MV`)
              return true
            }
            mv = {
              vid: song.mvVid,
              mvtitle: song.songName || 'MV',
              singerName: song.singerName || '',
              cover: song.cover || '',
            }
          }
        } else {
          mv = { vid: argText, mvtitle: argText, singerName: '' }
        }

        const title = mv.mvtitle || mv.name || 'MV'
        await e.reply(`正在获取「${title}」…`)
        const url = await mvUrl(mv.vid, userKey)
        if (!url) { await e.reply('获取 MV 播放链接失败，可能需登录'); return true }

        // 前置 MV 详情卡（复用 qqmusic-detail 模板）
        try {
          const { buildMvCardData } = await import('../utils/card-data.js')
          const { renderDetailCard } = await import('../utils/render.js')
          const img = await renderDetailCard(e, buildMvCardData(mv))
          if (img) await e.reply(img)
        } catch { /* 卡失败不阻断视频 */ }

        // 下载为本地 .mp4 后直接发视频（不发文件）
        const playLocalVideo = async () => {
          const { downloadAudio, getTempDir } = await import('../utils/send.js')
          const dl = await downloadAudio(url, getTempDir(), `${title}_${Date.now()}`, Number(cfg.downloadTimeout) || 120000, 'video')
          return dl?.filePath && (await sendVideo(dl.filePath, title))
        }

        // 下载 = 强制本地视频；播放 = onebot/qqbot URL 直发、icqq 下载后发本地
        if (isDl) {
          try {
            if (await playLocalVideo()) return true
          } catch { /* 落兜底 */ }
        } else {
          try {
            const { detectAdapter } = await import('../utils/adapter.js')
            const adapter = detectAdapter(e)
            if (adapter.kind === 'onebot' || adapter.kind === 'qqbot') {
              if (await sendVideo(url, title)) return true
            } else if (adapter.kind === 'icqq') {
              if (await playLocalVideo()) return true
            } else if (await sendVideo(url, title)) {
              return true
            }
          } catch { /* 落兜底 */ }
        }
        await e.reply(`视频发送失败，可点击查看：${url}`)
        return true
      }

      // —— 浏览分类 ——
      const { list: cats } = await mvCategory(userKey)
      if (!cats.length) { await e.reply('获取 MV 分类失败'); return true }

      // 无关键词 → MV 分类
      if (!rest) {
        const lines = ['♫ MV 分类', ...cats.map((t, i) => `${i + 1}. ${t.name}`)]
        lines.push('\n发 #qqmMV 序号 看 MV；#qqmMV 播放 序号 播放；#qqmMV 搜索 关键词')
        await e.reply(lines.join('\n'))
        return true
      }

      // 分类序号或标签名 → MV 列表
      const idx = Number(rest) - 1
      const tag = (Number.isFinite(idx) && cats[idx]) || cats.find((t) => String(t.name).includes(rest))
      if (!tag) { await e.reply('未找到该 MV 分类'); return true }

      const data = await mvByTag(tag.id, { pageSize: 20, userKey })
      const mvlist = data.list || []
      if (!mvlist.length) { await e.reply('该分类暂无 MV'); return true }
      // 仅本命令消费；chooseSong 已忽略 mvList 类型，避免污染 #qqm听
      await setSession(scope, { type: 'mvList', data: mvlist, user_id: e.user_id, title: tag.name })
      const lines = [
        `♫ ${tag.name} MV`,
        ...mvlist.slice(0, 15).map((v, i) => `${v.index || i + 1}. ${v.mvtitle}${v.singerName ? ` - ${v.singerName}` : ''}`),
        '\n发 #qqmMV 播放 / 下载 序号',
      ]
      await e.reply(lines.join('\n'))
    } catch (err) {
      logError(`MV 失败: ${err.message}`)
      await e.reply('MV 处理失败，请稍后重试')
    }
    return true
  }

  }
