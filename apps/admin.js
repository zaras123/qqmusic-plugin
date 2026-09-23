/**
 * 主人配置命令
 */
import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import Config from '../components/Config.js'
import { request, listAccounts, normalizeApiBase } from '../utils/api.js'
import { getCfg, replyCardOrText } from '../utils/common.js'
import { logWarn } from '../utils/log.js'
import { maskApiBase } from '../utils/privacy.js'
// displayVersion：解锁？？？后一切"当前版本"文案显示 2.0 专属版；未解锁与 2.0 之前一致
import { updatePlugin, getUpdateLog, displayVersion } from '../utils/update.js'
import { listThemeIds, describeThemes, resolveTheme, TIME_LABEL } from '../utils/theme.js'
import { describeBackground } from '../utils/background.js'
import { isV2Unlocked } from '../utils/v2.js'

export class qqmusicAdmin extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-管理',
      dsc: '配置 QQ 音乐插件',
      event: 'message',
      priority: 500,
      rule: [
        {
          // 输出里含主人命令列表与配置状态，限主人（与帮助卡的可见性保持一致）
          reg: '^#?(qq|QQ)m(设置|配置)$|^#qq音乐设置$',
          fnc: 'showConfig',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*api\\s*(\\S+)$',
          fnc: 'setApi',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m\\s*(开启|关闭)(点歌|解析)$',
          fnc: 'toggle',
          permission: 'master',
        },
        {
          // 点歌增强开关：接管无前缀 #点歌 / 其它平台补充曲 / 一起听（及其自动同步）
          reg: '^#?(qq|QQ)m\\s*(默认点歌|补充曲|一起听同步|一起听)\\s*(开启|关闭|开|关)$',
          fnc: 'toggleExtra',
          permission: 'master',
        },
        {
          // 界面：查看 / 切换主题 / 深浅色 / 热重载模板
          reg: '^#?(qq|QQ)m\\s*(界面|主题|ui)\\s*\\S*$',
          fnc: 'themeCmd',
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

    // 实际生效的主题（配置里写了个不存在的主题名时这里能看出来）
    const themeNow = resolveTheme(c)

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
        `默认点歌: ${c.defaultPickSong === true ? '开' : '关'}（接管无前缀 #点歌）  补充曲: ${
          c.extraSources !== false ? '开' : '关'
        }（其它平台免费曲）`,
        `一起听: ${c.togetherEnable === true ? '开' : '关'}${
          c.togetherEnable === true ? `（点歌后自动同步 ${c.togetherAuto === true ? '开' : '关'}）` : ''
        }`,
        `界面: ${themeNow.manifest.name}（${themeNow.id} · ${
          themeNow.useTimeColor ? `${TIME_LABEL[themeNow.period] || themeNow.period}配色` : '固定配色'
        } · ${themeNow.dark ? '深色' : '浅色'}${themeNow.darkPref === 'auto' ? '·跟随时间' : ''}）${
          themeNow.fallback ? ` ⚠️ 配置的主题「${themeNow.requested}」不存在，已回落` : ''
        }`,
        '',
        '主人命令：',
        '#qqm登录          扫码绑定（QQ 码）',
        '#qqm登录微信      微信账号：用 QQ音乐 App 扫码（App 内用微信登录）',
        '#qqm状态 / #qms   状态图片卡片',
        '#qqm绑定 qqmusic://...  （DeepLink 导入）',
        '#qqm api <地址>   （设置 API 地址）',
        '#qqm 开启点歌 / #qqm 关闭解析',
        '#qqm 默认点歌 开/关   接管无前缀「#点歌」',
        '#qqm 补充曲 开/关     其它平台免费曲补进列表',
        '#qqm 一起听 开/关     启用群里的一起听（仅 ICQQ）',
        '#qqm 一起听同步 开/关 点歌后自动同步进一起听',
        '#qqm一起听 探测      只读探测一起听参数（首次启用必须先跑）',
        '#qqm 音质 flac',
        '#qqm 测试',
        `#qqm更新          拉取最新代码（当前 ${displayVersion()}）`,
        '#qqm强制更新      丢弃本地改动并同步远程',
        '#qqm更新日志      最近提交',
      ].join('\n')
    )
    return true
  }

  async setApi(e) {
    const m = e.msg.match(/api\s*(\S+)/i)
    const url = normalizeApiBase(m?.[1] || '')
    if (!url || !/^https?:\/\//i.test(url)) {
      await e.reply('用法：#qqm api http://你的API地址:端口')
      return true
    }
    Config.mergeConfig('qqmusic', { apiBase: url })
    await e.reply(`API 地址已更新：${maskApiBase(url)}`)
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

  /** #qqm 默认点歌 开/关 ；#qqm 补充曲 开/关 ；#qqm 一起听 开/关 ；#qqm 一起听同步 开/关 */
  async toggleExtra(e) {
    const m = String(e.msg || '').match(/(默认点歌|补充曲|一起听同步|一起听)\s*(开启|关闭|开|关)/)
    if (!m) return true
    const on = m[2] === '开启' || m[2] === '开'
    const which = m[1].replace(/\s/g, '')
    const patch =
      which === '默认点歌'
        ? { defaultPickSong: on }
        : which === '补充曲'
          ? { extraSources: on }
          : which === '一起听同步'
            ? { togetherAuto: on }
            : { togetherEnable: on }
    Config.mergeConfig('qqmusic', patch)

    const texts = {
      默认点歌: () =>
        `已${on ? '开启' : '关闭'}「接管无前缀 #点歌」` +
        (on
          ? '\n现在发送「#点歌 关键词」由本插件处理（若其它点歌插件优先级更高，仍可能被它们先接走）'
          : '\n不加 #qqm 前缀的点歌交还给其它插件'),
      补充曲: () =>
        `已${on ? '开启' : '关闭'}「其它平台补充曲」` +
        (on
          ? '\n点歌列表尾部会追加网易云/酷我的免费曲（128k，可用 #qqm听序号 播放）'
          : '\n点歌列表只显示 QQ 音乐的结果'),
      一起听: () =>
        `已${on ? '开启' : '关闭'}「一起听」` +
        (on
          ? '\n支持 ICQQ，以及带 send_packet 的 OneBot（NapCat / SnowLuma）；协议参数在 API 侧，没探测过时 API 会拒绝加歌'
          : ''),
      一起听同步: () =>
        `已${on ? '开启' : '关闭'}「点歌后自动同步一起听」` +
        (on ? '\n点歌/播放成功后会顺带把这首歌加进本群一起听；房间不存在时是否开房由 API 侧配置决定' : ''),
    }
    await e.reply(texts[which]())
    return true
  }

  /**
   * #qqm界面            查看当前主题 + 列出可用主题
   * #qqm界面 apple      切换主题（热更新，立即生效）
   * #qqm界面 深色/浅色   深浅切换（仅对支持深色的主题有效）
   * #qqm界面 重载        强制重载全部模板（改了一批模板文件后用）
   */
  async themeCmd(e) {
    const cfg = getCfg()
    const arg = String(e.msg || '')
      .trim()
      .replace(/^#?(qq|QQ)m\s*(界面|主题|ui)\s*/i, '')
      .trim()
    const current = resolveTheme(cfg)
    const presentTimeColor = current.useTimeColor !== false
    const themes = describeThemes()
    // 声明了"支持自定义背景"的主题（apple / nebula / multi）—— 别在文案里写死 apple：
    // 2.0 的两套主题同样支持，写死会让用户以为切了主题背景就废了（2026-09-23 修）
    const bgIds = themes.filter((t) => t.bg).map((t) => t.id).join(' / ') || '（无）'

    if (!arg) {
      const lines = themes.map((t) => {
        const mark = t.id === current.id ? '▶' : '　'
        const darkTag = t.dark ? ' · 支持深色' : ''
        const bgTag = t.bg ? ' · 支持自定义背景' : ''
        const coverTag = t.cards < t.cardsTotal ? ` · 已实现 ${t.cards}/${t.cardsTotal} 张卡` : ''
        return `${mark} ${t.id} — ${t.name}${darkTag}${bgTag}${coverTag}${t.desc ? `\n      ${t.desc}` : ''}`
      })
      await e.reply(
        [
          `当前界面：${current.manifest.name}（${current.id}）· ${
            presentTimeColor ? `${TIME_LABEL[current.period] || current.period}配色` : '固定配色'
          } · ${current.dark ? '深色' : '浅色'}${current.darkPref === 'auto' ? '（跟随时间）' : ''}`,
          `背景：${describeBackground(cfg)}${
            current.manifest.bg === true ? '' : `（当前主题不支持自定义背景；支持的是 ${bgIds}）`
          }`,
          '',
          '可用主题：',
          ...lines,
          '',
          '切换主题：#qqm界面 <主题id>',
          '深浅：   #qqm界面 深色 / 浅色 / 自动（跟随时间）',
          '底色：   #qqm界面 时段（开/关随时段自动换色）',
          '背景：   #qqm界面 背景 <路径或链接>  /  #qqm界面 背景 关',
          '热重载： #qqm界面 重载',
          '（换主题、改模板都不用重启，热更新立即生效）',
        ].join('\n')
      )
      return true
    }

    // 自定义背景（仅 apple 这类声明了 bg 能力的主题生效）
    if (/^背景/.test(arg)) {
      const value = arg.replace(/^背景\s*/, '').trim()
      if (!value) {
        await e.reply(
          [
            `当前背景：${describeBackground(cfg)}`,
            '',
            '用法：#qqm界面 背景 <路径或链接>   /   #qqm界面 背景 关',
            '支持三种来源（自动识别，不用选类型）：',
            '  · 本地路径  D:\\图片\\a.jpg   或  /root/pics/a.jpg',
            '  · 图片直链  https://example.com/a.jpg',
            '  · 图片 API  https://api.example.com/random（JSON 里有图片地址，或直接返回图片）',
            '远端图会缓存到本地（锅巴可调分钟数，0=每次都换）；取不到时自动回落主题底色。',
            `支持自定义背景的主题：${bgIds}（其余主题忽略此设置）。`,
          ].join('\n')
        )
        return true
      }
      if (/^(关|关闭|off)$/i.test(value)) {
        Config.mergeConfig('qqmusic', { uiBgEnable: false })
        await e.reply('已关闭自定义背景，卡片回到主题自带底色')
        return true
      }
      Config.mergeConfig('qqmusic', { uiBgEnable: true, uiBgValue: value })
      const okTheme = current.manifest.bg === true
      await e.reply(
        [
          `背景已设为：${value}`,
          okTheme
            ? '卡片将使用 iOS 液态玻璃；取图失败会自动回落主题底色（日志里有原因）'
            : `⚠️ 当前主题「${current.manifest.name}」不支持自定义背景，切到 ${bgIds} 才看得到效果`,
        ].join('\n')
      )
      return true
    }

    if (arg === '重载' || /^reload$/i.test(arg)) {
      const { reloadTemplates } = await import('../utils/render.js')
      reloadTemplates()
      await e.reply('已重载全部模板与主题缓存，改动立即生效')
      return true
    }

    if (arg === '深色' || /^dark$/i.test(arg)) {
      Config.mergeConfig('qqmusic', { uiDark: 'dark' })
      await e.reply(
        current.manifest.dark
          ? '已切到深色'
          : `已记录深色偏好；但当前主题「${current.manifest.name}」不支持深色，切到支持深色的主题（如 apple）才会生效`
      )
      return true
    }
    if (arg === '浅色' || /^light$/i.test(arg)) {
      Config.mergeConfig('qqmusic', { uiDark: 'light' })
      await e.reply('已切到浅色')
      return true
    }
    if (arg === '自动' || /^auto$/i.test(arg)) {
      Config.mergeConfig('qqmusic', { uiDark: 'auto' })
      await e.reply(
        '深浅色已设为「跟随时间」：夜晚 20:00-5:00 自动深色，其余时段浅色' +
          (current.manifest.dark ? '' : `\n注意：当前主题「${current.manifest.name}」不支持深色，切到 apple 之类才有效果`)
      )
      return true
    }
    if (arg === '时段' || /^time$/i.test(arg)) {
      const next = !(getCfg().uiTimeColor !== false)
      Config.mergeConfig('qqmusic', { uiTimeColor: next })
      await e.reply(
        next
          ? '底色已改为「跟随时段」：清晨 / 白天 / 黄昏 / 夜晚 各一套底色（需要主题声明了时段配色，apple 有）'
          : '底色已固定为白天配色'
      )
      return true
    }

    const ids = listThemeIds()
    if (!ids.includes(arg)) {
      await e.reply(`没有主题「${arg}」。可用：${ids.join(' / ') || '（无）'}\n自定义主题：在 resources/themes/ 下丢一个带 theme.json 的目录`)
      return true
    }
    /**
     * 写哪个键要看当前是哪一代界面：
     *   · ？？？关着 → 老界面，写 `uiTheme`
     *   · ？？？打开 → 2.0 界面，写 `uiThemeV2`
     * 只写一个键的话，会出现"回话说切好了、实际没变"（2.0 下改 uiTheme 不影响生效主题）。
     */
    const key = isV2Unlocked(cfg) ? 'uiThemeV2' : 'uiTheme'
    Config.mergeConfig('qqmusic', { [key]: arg })
    const next = resolveTheme({ ...cfg, [key]: arg })
    await e.reply(
      `界面已切到「${next.manifest.name}」${next.manifest.dark ? (next.dark ? '（深色）' : '（浅色）') : '（该主题只有浅色）'}${isV2Unlocked(cfg) ? `（2.0 主题 ${key}）` : ''}\n立即生效，无需重启；发 #qqm点歌 / #qqm帮助 就能看到新界面`
    )
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
    await e.reply(`开始更新 qqmusic-plugin（${displayVersion()}）…`)
    const ret = await updatePlugin({ force: false })
    await e.reply(ret.message || (ret.ok ? '更新完成' : '更新失败'))
    return true
  }

  async forceUpdate(e) {
    await e.reply(
      `开始强制更新 qqmusic-plugin（${displayVersion()}）…\n将丢弃插件目录内未提交的本地修改（保留 config/config 用户配置）`
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
