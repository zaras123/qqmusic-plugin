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
          const d = await ticketSync(cmd.city, uid)
          await e.reply(`演出同步完成，档案共 ${d.store?.shows ?? 0} 场。${d.errors?.length ? '部分数据未同步成功，请稍后重试。' : ''}\n发送 #qqm演出 城市=${cmd.city} 查看。`)
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
      const d = await ticketArchive(filters, uid)
      if (!d.list.length && filters.page > 1) {
        await e.reply(`这一页没有演出，当前共 ${d.total} 场。请重新查询或减少页码。`); return true
      }
      await setSession(scope, { type: 'ticket', user_id: uid, filters: { ...filters, page: d.page, pageSize: d.pageSize }, total: d.total, data: d.list.map((s) => ({ key: s.key })) }, 600)
      await this.sendTicketCard(e, cfg, buildTicketList(d, filters), formatTicketList)
      if (d.list.length) await e.reply('详情：#qqm演出详情1\n翻页：#qqm演出下一页 / #qqm演出上一页')
      else if (Number(d.meta?.count) === 0 && e.isMaster) await e.reply('先发送 #qqm演出同步 北京 收录城市演出。')
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
