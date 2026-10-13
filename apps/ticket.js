import { loadPluginBase } from '../utils/plugin-base.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { getUserSession, setSession } from '../utils/session.js'
import { ticketArchive, ticketShow, ticketOptions, ticketSync } from '../utils/ticket-api.js'
import { RE_TICKET, TICKET_HELP, parseTicketCommand, ticketScope, buildTicketList, buildTicketDetail, formatTicketList, formatTicketDetail, ticketError } from '../utils/ticket.js'

let syncBusy = false
let lastSync = 0
const active = new Set()

async function replyText(e, value) {
  // Bound individual messages without silently dropping long session/tier lists.
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1800) await e.reply(text.slice(i, i + 1800))
}

export class qqmusicTicket extends (await loadPluginBase()) {
  constructor() {
    super({ name: 'QQ音乐-演出票务', dsc: '演出档案、场次与票价', event: 'message', priority: 510,
      rule: [{ reg: RE_TICKET, fnc: 'ticket' }],
    })
  }

  async ticket(e) {
    const cfg = getCfg()
    if (!cfg.enable) return false
    const cmd = parseTicketCommand(e.msg)
    if (!cmd) return false
    if (cmd.error) { await e.reply(cmd.error); return true }
    if (cmd.action === 'help') {
      await e.reply(TICKET_HELP + (e.isMaster ? '\n#qqm演出同步 北京（仅主人；一次一个城市）' : ''))
      return true
    }
    const scope = ticketScope(e), uid = String(e.user_id || '')
    const lock = JSON.stringify([scope, uid])
    if (active.has(lock)) { await e.reply('上一条演出查询仍在处理中，请稍候。'); return true }
    active.add(lock)
    try {
      if (cmd.action === 'sync') {
        if (!e.isMaster) { await e.reply('仅主人可以同步演出档案。'); return true }
        if (syncBusy || Date.now() - lastSync < 60000) { await e.reply('演出同步正在进行或刚完成，请一分钟后再试。'); return true }
        syncBusy = true
        try {
          await e.reply(`正在同步${cmd.city}的演出档案，可能需要几分钟。`)
          const d = await ticketSync(cmd.city, uid, { detailLimit: 80 })
          const unknown = (d.unknownCities || []).map((s) => String(s).trim()).filter(Boolean)
          const gotData = (d.synced || []).some((s) => Number(s.count) > 0)
          if (unknown.length && !gotData) {
            // 「宋雨琦」这类不是城市：转成艺人/关键词实时检索，省得用户手写 艺人=
            const keyword = unknown[0]
            await e.reply(`「${keyword}」不在城市表里，我按艺人/关键词帮你检索演出。`)
            const kwFilters = { status: 'all', category: '', group: '', city: '', artist: '', q: keyword, page: 1, pageSize: TICKET_PAGE_SIZE }
            const found = await ticketArchive({ ...kwFilters, refresh: 1 }, uid)
            if (found.list.length) {
              await setSession(scope, { type: 'ticket', user_id: uid, filters: { ...kwFilters, page: found.page, pageSize: found.pageSize }, total: found.total, data: found.list.map((s) => ({ key: s.key })) }, 600)
              await this.sendTicketCard(e, cfg, buildTicketList(found, kwFilters), formatTicketList)
              await e.reply('详情：#qqm演出详情1\n翻页：#qqm演出下一页 / #qqm演出上一页')
            } else {
              await e.reply(`暂时没查到「${keyword}」的演出；可能还没开售，或档案尚未覆盖到。`)
            }
            return true
          }
          const synced = (d.synced || []).map((s) => `${s.city} ${s.count} 场`).join('、') || cmd.city
          const partial = (d.synced || []).some((s) => s.partial) || Number(d.pendingDetails) > 0
          const lines = (d.synced || []).length ? [
            `演出同步完成（${synced}）：新增 ${d.added || 0} 场，更新 ${d.updated || 0} 场，补全 ${d.enriched || 0} 场详情。`,
            `档案共 ${d.store?.shows ?? 0} 场。`,
          ] : [`演出同步未完成：${(d.errors || []).slice(0, 3).map((x) => x.message || x).join('；') || '上游暂时没有返回可用数据。'}`]
          if (partial) lines.push('部分分页或详情还没补完，再发一次同步会从上次位置继续。')
          if (d.errors?.length) lines.push(`部分数据暂未同步：${d.errors.slice(0, 3).map((x) => x.message || x).join('；')}`)
          if (d.hints?.length) lines.push(d.hints.map((x) => x.message || x).join('；'))
          await e.reply(lines.join('\n'))

          try {
            const preview = await ticketArchive({
              status: 'upcoming', category: '', group: 'concert', city: cmd.city,
              artist: '', q: '', page: 1, pageSize: TICKET_PAGE_SIZE,
            }, uid)
            if (preview.list.length) {
              await setSession(scope, {
                type: 'ticket', user_id: uid,
                filters: { status: 'upcoming', category: '', group: 'concert', city: cmd.city, artist: '', q: '', page: 1, pageSize: TICKET_PAGE_SIZE },
                total: preview.total,
                data: preview.list.map((s) => ({ key: s.key })),
              }, 600)
              await this.sendTicketCard(e, cfg, buildTicketList(preview, {
                status: 'upcoming', category: '', group: 'concert', city: cmd.city,
                artist: '', q: '', page: 1, pageSize: TICKET_PAGE_SIZE,
              }), formatTicketList)
              await e.reply('以上是已收录的近期/未来演唱会。详情：#qqm演出详情1')
            }
          } catch (err) {
            global.logger?.warn?.(`[qqmusic-plugin] 同步后预览失败: ${err.message || err}`)
            await e.reply('同步已完成，但预览查询失败。请确认 qqmusic-api-enhanced 已更新到最新包后重试。')
          }
        } finally { syncBusy = false; lastSync = Date.now() }
        return true
      }
      if (cmd.action === 'cities' || cmd.action === 'categories') {
        const list = await ticketOptions(cmd.action, uid)
        await replyText(e, (cmd.action === 'cities' ? '【可同步城市】\n' : '【演出分类】\n') + (list.map((s) => s.name).filter(Boolean).join('、') || '暂无数据'))
        return true
      }
      if (cmd.action === 'detail') {
        let key = cmd.key
        if (!key) {
          const session = await getUserSession(scope, uid)
          if (!session) { await e.reply('你的演出列表已过期或尚未查询，请先发送 #qqm演唱会。'); return true }
          key = session.data?.[cmd.index - 1]?.key
          if (!key) { await e.reply(`序号超出当前页范围，请使用 1 到 ${session.data?.length || 0}。`); return true }
        }
        const data = buildTicketDetail(await ticketShow(key, uid))
        await this.sendTicketCard(e, cfg, data, formatTicketDetail)
        if (data.row.link) await e.reply(`购票页面：${data.row.link}`)
        return true
      }
      let filters = cmd.filters
      if (cmd.action === 'page') {
        const session = await getUserSession(scope, uid)
        if (!session?.filters) { await e.reply('你的演出列表已过期或尚未查询，请先发送 #qqm演唱会。'); return true }
        const page = session.filters.page + cmd.delta
        if (page < 1 || (page - 1) * session.filters.pageSize >= session.total) {
          await e.reply(cmd.delta > 0 ? '已经是最后一页。' : '已经是第一页。'); return true
        }
        filters = { ...session.filters, page }
      }
      const d = await ticketArchive({ ...filters, refresh: 1 }, uid)
      if (!d.list.length && filters.page > 1) {
        await e.reply(`这一页没有演出，当前共 ${d.total} 场。请重新查询或减少页码。`); return true
      }
      await setSession(scope, { type: 'ticket', user_id: uid, filters: { ...filters, page: d.page, pageSize: d.pageSize }, total: d.total, data: d.list.map((s) => ({ key: s.key })) }, 600)
      await this.sendTicketCard(e, cfg, buildTicketList(d, filters), formatTicketList)
      if (d.list.length) await e.reply('详情：#qqm演出详情1\n翻页：#qqm演出下一页 / #qqm演出上一页')
      else if (Number(d.meta?.refresh?.errors?.length || 0) > 0) await e.reply('实时补全暂时有错误，已先显示本地档案；请稍后再试。')
      else if (Number(d.meta?.count) === 0 && e.isMaster) await e.reply('已自动查询实时数据，但仍没有结果；可指定城市后再试。')
    } catch (err) {
      await e.reply(ticketError(err))
    } finally { active.delete(lock) }
    return true
  }

  async sendTicketCard(e, cfg, data, formatText) {
    // Long details remain complete in text instead of producing unreadably tall images.
    const fullText = formatText(data)
    if (cfg.renderListCard === false || fullText.length > 3500 || (data.sessions?.length || 0) > 6) {
      await replyText(e, fullText); return
    }
    let render
    try {
      const { renderCard } = await import('../utils/render.js')
      render = (event, value) => renderCard(event, value, 'qqmusic-ticket')
    } catch { /* text fallback also works without rendering dependencies */ }
    await replyCardOrText(e, { render, data, onFallback: () => replyText(e, fullText), tag: '演出票务卡片' })
  }
}
