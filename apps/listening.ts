/** Commands for API listening tasks. Export only the plugin class. */
import { loadPluginBase } from '../utils/plugin-base.js'
import { replyCardOrText } from '../utils/common.js'
import { RE_LISTENING, parseListeningCommand, createListeningClient, listeningError, LISTENING_USAGE } from '../utils/listening.js'

const client = createListeningClient()
export class qqmusicListening extends (await loadPluginBase()) {
  constructor() {
    super({ name: 'QQ音乐-平台时长任务', desc: '创建、查看与停止本人平台时长任务', event: 'message', priority: 457,
      rule: [{ reg: RE_LISTENING.source, fnc: 'listening', permission: 'master' }] })
  }
  client() { return client }
  async showHelp(e) {
    let render, data
    try {
      const { buildListeningHelpCardData } = await import('../utils/help-card.js')
      const { renderHelpCard } = await import('../utils/render.js')
      render = renderHelpCard; data = buildListeningHelpCardData(e)
    } catch { /* The full text remains available without a renderer. */ }
    await replyCardOrText(e, { render, data, onFallback: () => e.reply(LISTENING_USAGE), tag: '平台时长任务帮助' })
    return true
  }
  async listening(e) {
    const command = parseListeningCommand(e.msg || e.rawMessage || '')
    if (!command) return false
    if (!e.isMaster) { await e.reply('平台时长任务仅限主人操作'); return true }
    if (command.action === 'help') return this.showHelp(e)
    try {
      const result = await this.client().execute(command, {
        userKey: String(e.userId ?? e.user_id ?? '').trim(),
        messageId: String(e.messageId ?? e.message_id ?? ''), selfId: String(e.selfId ?? e.self_id ?? e.bot?.uin ?? ''),
      })
      if (result && typeof result === 'object' && result.card) {
        let render
        try {
          const { renderListeningCard } = await import('../utils/render.js')
          render = renderListeningCard
        } catch { /* Text fallback remains available. */ }
        await replyCardOrText(e, { render, data: result.card, onFallback: () => e.reply(result.text), tag: '平台时长任务状态' })
      } else if (result) await e.reply(result)
    } catch (error) { await e.reply(listeningError(error)) }
    return true
  }
}
