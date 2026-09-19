/**
 * QQ 音乐「一起听」
 *   #qqm一起听 N    把点歌列表第 N 首加进本群的一起听
 *   #qqm一起听 状态  查本群房间当前曲目（只读）
 *   #qqm一起听 探测  只读探测一起听参数（主人）
 *
 * 插件这里只做「取歌 + 收发」：包怎么拼、什么情况该开房、失败文案，都在 API 侧。
 * 规则顺序有硬约束：Miao-Yunzai/lib/plugins/loader.js:274 在权限不足时 `break a`
 * ——直接跳出**所有**插件。所以全员规则必须排在 master 规则之前，且探测正则不能
 * 写成 `^#qqm一起听\s*(.+)$` 这种会吞掉数字指令的宽形状。
 */
import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import { pickSession } from '../utils/session.js'
import { getCfg } from '../utils/common.js'
import { logWarn } from '../utils/log.js'
import { runTogether, togetherGate } from '../utils/together.js'

/** 匹配 #qqm一起听 N（状态 / 探测 由各自的规则处理，见 rule 表） */
const RE_TOGETHER = /^#?(?:qq|QQ)m\s*一起听\s*([1-9][0-9]?)$/

export class qqmusicTogether extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-一起听',
      dsc: '把点歌结果加进群里的一起听',
      event: 'message',
      priority: 450,
      rule: [
        {
          reg: '^#?(qq|QQ)m\\s*一起听\\s*([1-9][0-9]?)$',
          fnc: 'togetherPick',
        },
        {
          reg: '^#?(qq|QQ)m\\s*一起听\\s*状态$',
          fnc: 'togetherState',
        },
        {
          reg: '^#?(qq|QQ)m\\s*一起听\\s*探测$',
          fnc: 'togetherProbe',
          permission: 'master',
        },
      ],
    })
  }

  cfg() {
    return getCfg()
  }

  /** #qqm一起听 N：取会话列表第 N 首塞进一起听 */
  async togetherPick(e) {
    const gate = togetherGate(e, this.cfg())
    if (!gate.ok) {
      await e.reply(gate.reason)
      return true
    }

    const m = String(e.msg || '').trim().match(RE_TOGETHER)
    const n = Number(m?.[1] || 0)
    const scope = e.group_id || e.user_id
    // 与 #qqm听N 同源：先取自己的列表，自己没有才退回群里最近一份
    const { session } = await pickSession(scope, String(e.user_id || ''))
    if (!session?.data?.length) {
      await e.reply('还没有点歌列表，请先 #qqm点歌')
      return true
    }
    if (session.type === 'mvList') {
      await e.reply('当前列表是 MV，一起听需要音频，请先 #qqm点歌')
      return true
    }
    if (session.type === 'topCategory') {
      await e.reply('当前是榜单分类列表，请先 #qqm排行 榜单名 列出歌曲')
      return true
    }
    if (session.type === 'recommend') {
      await e.reply('当前是推荐歌单列表，请先 #qqm推荐听序号 查看歌单歌曲')
      return true
    }
    if (n < 1 || n > session.data.length) {
      await e.reply(`请选择 1-${session.data.length}`)
      return true
    }

    try {
      const res = await runTogether(e, 'manual', session.data[n - 1])
      await e.reply(res.message)
    } catch (err) {
      logWarn(`一起听指令失败: ${err.message}`)
      await e.reply(`一起听失败：${err.message}`)
    }
    return true
  }

  /** #qqm一起听 状态：只读 */
  async togetherState(e) {
    try {
      const res = await runTogether(e, 'state')
      await e.reply(res.message)
    } catch (err) {
      await e.reply(`查询失败：${err.message}`)
    }
    return true
  }

  /** #qqm一起听 探测：只读，主人专属（报告含群成员 uin 与房间内部 id） */
  async togetherProbe(e) {
    if (!e.group_id) {
      await e.reply('一起听探测需要在群里执行（私聊的 aio_type 取值未验证）')
      return true
    }
    try {
      const res = await runTogether(e, 'probe')
      await e.reply(res.message)
    } catch (err) {
      await e.reply(`探测失败：${err.message}`)
    }
    return true
  }
}
