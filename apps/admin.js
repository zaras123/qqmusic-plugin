/**
 * 主人配置命令
 */

// 棰勫姞杞芥彃浠跺熀绫伙紙鏀寔 ESM + top-level await锛塦nawait loadPluginBase()
import Config from '../components/Config.js'
import { request, listAccounts } from '../utils/api.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logWarn } from '../utils/log.js'
import { maskApiBase } from '../utils/privacy.js'
import { updatePlugin, getUpdateLog, getLocalVersion } from '../utils/update.js'

export class qqmusicAdmin extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-管理',
      dsc: '配置 QQ 音乐插件',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#?(qq|QQ)m(设置|配置)$|^#qq音乐设置$',
          fnc: 'showConfig',
        },
        {
          reg: '^#?(qq|QQ)m\\s*api\\s*(https?://\\S+)$',
          fnc: 'setApi',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*(开启|关闭)(点歌|解析)$',
          fnc: 'toggle',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*音质\\s*(128|m4a|320|flac|ape|hires|atmos|master|atmos_master)$',
          fnc: 'setQuality',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*测试$|^#qq音乐测试$',
          fnc: 'ping',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*(账号|accounts|已登录)$',
          fnc: 'listAccounts',
          permission: 'master',
        },
        {
          // #qqm更新 / #qqm强制更新 / #qq音乐更新
          reg: '^#?(qq|QQ)m\\s*强制更新$|^#?(qq|QQ)音乐\\s*强制更新$',
          fnc: 'forceUpdate',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*更新日志$|^#?(qq|QQ)音乐\\s*更新日志$',
          fnc: 'updateLog',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*更新$|^#?(qq|QQ)音乐\\s*更新$',
          fnc: 'update',
          permission: 'master',
        },
      ],
    })
  }

  async showConfig(e) {
    try {
      const { buildSettingsCardData, formatSettingsText } = await import('../utils/card-data.js')
      const { renderSettingsCard } = await import('../utils/render.js')
      const data = await buildSettingsCardData(e)
      const ok = await replyCardOrText(e, {
        render: renderSettingsCard,
        data,
        formatText: formatSettingsText,
        tag: '设置卡片',
      })
      if (ok) return true
    } catch (err) {
      logWarn(`设置卡片渲染失败，回退文本: ${err.message}`)
    }

    const c = getCfg()
    let loginLine = 'login: (查询失败)'
    try {
      const st = await request('/login/status', {}, 'get', String(e.user_id || ''))
      const d = st?.data || {}
      loginLine = d.login
        ? `login: 已绑定 uin=${d.uin}${d.nick ? ` (${d.nick})` : ''}`
        : 'login: 未绑定（#qqm登录 扫码）'
    } catch {
      /* ignore */
    }

    let adapterLine = 'adapter: (unknown)'
    try {
      const { detectAdapter } = await import('../utils/adapter.js')
      const a = detectAdapter(e)
      adapterLine = `adapter: ${a.name || a.kind} (${a.kind}) id=${a.id || '-'}`
    } catch {
      /* ignore */
    }

    await e.reply(
      [
        '【QQ音乐插件配置】',
        `enable: ${c.enable}`,
        `apiBase: ${maskApiBase(c.apiBase)}`,
        loginLine,
        adapterLine,
        `点歌: ${c.enableSongRequest}  解析: ${c.enableResolve}`,
        `音质: ${c.quality}（自动降级: ${c.qualityFallback !== false}）  列表: ${c.maxList}`,
        `语音: ${c.sendVocal}  群文件: ${c.uploadFile}`,
        `原生卡: ${c.sendNativeCard}  自定义卡: ${c.sendCustomCard}`,
        '',
        '主人命令：',
        '#qqm登录          扫码绑定',
        '#qqm状态 / #qms   状态图片卡片',
        '#qqm绑定 deeplink',
        '#qqm api <地址>   （设置 API 地址）',
        '#qqm 开启点歌 / #qqm 关闭解析',
        '#qqm 音质 flac',
        '#qqm 测试',
        `#qqm更新          拉取最新代码（当前 v${getLocalVersion()}）`,
        '#qqm强制更新      丢弃本地改动并同步远程',
        '#qqm更新日志      最近提交',
      ].join('\n')
    )
    return true
  }

  async setApi(e) {
    const m = e.msg.match(/api\s*(https?:\/\/\S+)/i)
    const url = m?.[1]?.replace(/\/$/, '')
    if (!url) {
      await e.reply('用法：#qqm api http://你的API地址:端口')
      return true
    }
    Config.mergeConfig('qqmusic', { apiBase: url })
    await e.reply('API 地址已更新')
    return true
  }

  async toggle(e) {
    const m = e.msg.match(/(开启|关闭)(点歌|解析)/)
    if (!m) return true
    const on = m[1] === '开启'
    const patch = m[2] === '点歌' ? { enableSongRequest: on } : { enableResolve: on }
    Config.mergeConfig('qqmusic', patch)
    await e.reply(`已${m[1]}${m[2]}`)
    return true
  }

  async setQuality(e) {
    const m = e.msg.match(
      /音质\s*(128|m4a|320|flac|ape|hires|atmos|master|atmos_master)/i
    )
    const q = m?.[1]?.toLowerCase()
    if (!q) return true
    Config.mergeConfig('qqmusic', { quality: q })
    await e.reply(
      `默认最高音质已设为 ${q}\n可选: 128 / m4a / 320 / flac / ape / hires / atmos / master / atmos_master`
    )
    return true
  }

  async ping(e) {
    try {
      const data = await request('/')
      await e.reply(
        `API 正常\nroutes: ${(data.routes || []).length}\n已登录: ${(data.accounts || []).length}`
      )
    } catch (err) {
      await e.reply(`API 不可用：${err.message}`)
    }
    return true
  }

  async listAccounts(e) {
    try {
      const list = await listAccounts()
      if (!list.length) {
        await e.reply('当前没有任何账号登录')
        return true
      }
      const lines = list.map(
        (a, i) =>
          `${i + 1}. userKey=${a.userKey} uin=${a.uin}${a.nick ? ` (${a.nick})` : ''}`
      )
      await e.reply(`已登录账号 ${list.length} 个：\n${lines.join('\n')}`)
    } catch (err) {
      await e.reply(`查询失败：${err.message}`)
    }
    return true
  }

  async update(e) {
    await e.reply(`开始更新 qqmusic-plugin（v${getLocalVersion()}）…`)
    const ret = await updatePlugin({ force: false })
    await e.reply(ret.message || (ret.ok ? '更新完成' : '更新失败'))
    return true
  }

  async forceUpdate(e) {
    await e.reply(
      `开始强制更新 qqmusic-plugin（v${getLocalVersion()}）…\n将丢弃插件目录内未提交的本地修改（保留 config/config 用户配置）`
    )
    const ret = await updatePlugin({ force: true })
    await e.reply(ret.message || (ret.ok ? '强制更新完成' : '强制更新失败'))
    return true
  }

  async updateLog(e) {
    const ret = await getUpdateLog({ limit: 15 })
    await e.reply(ret.message || '暂无更新日志')
    return true
  }
}
