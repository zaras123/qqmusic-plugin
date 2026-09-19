/**
 * 锅巴配置 Schema
 */
import Config from '../components/Config.js'
import { pullLoginMeta, normalizeApiBase } from '../utils/api.js'
import { QQMUSIC_QUALITY_LIST } from '../utils/quality.js'
import { listThemeIds, loadManifest, darkPrefOf } from '../utils/theme.js'

/** 卡片主题下拉项：直接扫 resources/themes/，丢个主题目录进去（重启锅巴后）就会出现在这里 */
const UI_THEME_OPTIONS = (() => {
  const ids = listThemeIds()
  return (ids.length ? ids : ['classic']).map((id) => {
    const m = loadManifest(id)
    return { label: `${m?.name || id}${m?.dark ? '（支持深色）' : ''}`, value: id }
  })
})()

export const schemas = [
  {
    component: 'Divider',
    label: 'API 与登录',
  },
  {
    field: 'apiBase',
    label: 'API 地址',
    bottomHelpMessage: 'qqmusic-api-enhanced 服务地址',
    component: 'Input',
    required: true,
    componentProps: {
      placeholder: 'http://127.0.0.1:3300',
    },
  },
  {
    field: 'apiToken',
    label: 'API Token',
    bottomHelpMessage: '与 API 端配置的 Token 一致',
    component: 'InputPassword',
    componentProps: {
      placeholder: 'API Token',
    },
  },
  {
    field: 'pullLoginMeta',
    label: '从 API 查询登录态',
    bottomHelpMessage: '打开并保存：查询 API 当前登录的 uin/昵称回填到下方备注',
    component: 'Switch',
  },
  {
    field: 'lastLoginUin',
    label: '最近登录 uin（备注）',
    bottomHelpMessage: '扫码成功后自动填写',
    component: 'Input',
    componentProps: {
      disabled: true,
      placeholder: '未登录',
    },
  },
  {
    field: 'lastLoginNick',
    label: '最近登录昵称（备注）',
    component: 'Input',
    componentProps: {
      disabled: true,
      placeholder: '未登录',
    },
  },
  {
    field: 'forceMasterAccount',
    label: '一律走主人账号',
    bottomHelpMessage:
      '开启后所有人点歌都按主人账号（主人的 ck）取播放链，不看请求者自己有没有登录过（群友在自己机器人上登录过也不影响）。主人账号自动取最近扫码登录的账号，无需手填；登录状态/收藏/刷新仍按请求者本人',
    component: 'Switch',
  },
  {
    component: 'Divider',
    label: '功能开关',
  },
  {
    field: 'enable',
    label: '启用插件',
    component: 'Switch',
  },
  {
    field: 'enableSongRequest',
    label: '开启点歌',
    bottomHelpMessage: '#qqm点歌 / #qqm听 / #qqm播放',
    component: 'Switch',
  },
  {
    field: 'enableResolve',
    label: '开启卡片/链接解析',
    bottomHelpMessage: '识别 QQ 音乐分享与 y.qq.com 链接',
    component: 'Switch',
  },
  {
    field: 'renderListCard',
    label: '点歌结果图片卡片',
    bottomHelpMessage: '开启：返回图片列表卡；关闭：回退纯文本列表',
    component: 'Switch',
  },
  {
    field: 'qrLoginEnable',
    label: '允许扫码登录命令',
    bottomHelpMessage: '#qqm登录',
    component: 'Switch',
  },
  {
    component: 'Divider',
    label: '界面',
  },
  {
    field: 'uiTheme',
    label: '卡片主题',
    bottomHelpMessage:
      'resources/themes/ 下的目录名；丢一个目录进去就能加自己的主题（缺哪张卡会自动回落到 classic）。换主题与改模板都是热更新，不用重启',
    component: 'Select',
    componentProps: {
      options: UI_THEME_OPTIONS,
      placeholder: '请选择卡片主题',
    },
  },
  {
    field: 'uiDark',
    label: '深浅色',
    bottomHelpMessage:
      '「跟随时间」= 夜晚（20:00-5:00）自动切深色。只对声明支持深色的主题生效（apple 支持；classic 是浅色专用）',
    component: 'Select',
    componentProps: {
      options: [
        { label: '浅色', value: 'light' },
        { label: '深色', value: 'dark' },
        { label: '跟随时间（夜晚自动深色）', value: 'auto' },
      ],
      placeholder: '请选择深浅色',
    },
  },
  {
    field: 'uiTimeColor',
    label: '底色跟随时段',
    bottomHelpMessage:
      '清晨 5-8 / 白天 8-17 / 黄昏 17-20 / 夜晚 20-5 各一套底色（需要主题声明了时段配色，apple 有）',
    component: 'Switch',
  },
  {
    field: 'uiBgEnable',
    label: '自定义卡片背景',
    bottomHelpMessage:
      '开启后卡片切成 iOS 液态玻璃（半透明+高光）。**只有 apple 主题支持**，其余主题会忽略。背景图取不到时会自动回落主题自带底色，不影响发卡',
    component: 'Switch',
  },
  {
    field: 'uiBgValue',
    label: '背景来源',
    bottomHelpMessage:
      '本地路径（Windows D:\\图片\\a.jpg / Linux /root/pics/a.jpg）、图片直链、或图片 API（返回 JSON 里有图片地址，或直接返回图片）—— 自动识别，不用选类型',
    component: 'Input',
    componentProps: {
      placeholder: 'D:\\图片\\a.jpg  或  https://example.com/a.jpg',
    },
  },
  {
    field: 'uiBgCacheMin',
    label: '远端背景缓存(分钟)',
    bottomHelpMessage: '0 = 每次渲染都重新取（随机图 API 想换得勤就填 0）；本地路径不受此项影响',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 1440,
    },
  },
  {
    component: 'Divider',
    label: '音质',
  },
  {
    field: 'quality',
    label: '最高音质',
    bottomHelpMessage: '推荐选「自动」：按歌曲实际文件选最高可用音质',
    component: 'Select',
    componentProps: {
      options: QQMUSIC_QUALITY_LIST,
      placeholder: '请选择最高音质或自动',
    },
  },
  {
    field: 'qualityFallback',
    label: '音质自动降级',
    bottomHelpMessage: '开启：从最高档向下尝试，直到可播',
    component: 'Switch',
  },
  {
    component: 'Divider',
    label: '点歌增强',
  },
  {
    field: 'defaultPickSong',
    label: '接管无前缀「#点歌」',
    bottomHelpMessage:
      '开启后：「#点歌 关键词」由本插件处理（不加 #qqm 前缀）。默认关闭，以免与其它点歌插件抢命令',
    component: 'Switch',
  },
  {
    field: 'extraSources',
    label: '其它平台补充曲',
    bottomHelpMessage:
      '开启后：点歌列表尾部追加网易云/酷我的免费曲（128k，实测免登录可播）。默认关闭',
    component: 'Switch',
  },
  {
    component: 'Divider',
    label: '一起听',
  },
  {
    field: 'togetherEnable',
    label: '启用一起听',
    bottomHelpMessage:
      '把点歌结果加进群里的一起听（ICQQ，或带 send_packet 的 OneBot：NapCat / SnowLuma）。首次使用需在 API 侧探测：POST /together/start {action:"probe"}',
    component: 'Switch',
  },
  {
    field: 'togetherAuto',
    label: '点歌后自动同步',
    bottomHelpMessage: '点歌/播放成功后再把这首歌加进一起听（手动 #qqm一起听 N 不受此开关影响）',
    component: 'Switch',
  },
  {
    component: 'Divider',
    label: '发送方式',
  },
  {
    field: 'sendVocal',
    label: '发送群语音',
    bottomHelpMessage: '下载完整音频后以语音发送',
    component: 'Switch',
  },
  {
    field: 'disableHighQualityVocal',
    label: '禁用高清语音',
    bottomHelpMessage: 'PC QQ 无法播放高清语音时开启：语音改发 mono16k 低音质，PC 可正常播放',
    component: 'Switch',
  },
  {
    field: 'uploadFile',
    label: '上传群文件',
    component: 'Switch',
  },
  {
    field: 'sendNativeCard',
    label: '发送原生 QQ 音乐卡',
    component: 'Switch',
  },
  {
    field: 'sendCustomCard',
    label: '发送自定义音乐卡',
    component: 'Switch',
  },
  {
    field: 'sendTextInfo',
    label: '发送文本识别信息',
    component: 'Switch',
  },
  {
    field: 'maxList',
    label: '点歌列表数量',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 20,
    },
  },
  {
    field: 'identifyPrefix',
    label: '识别前缀',
    component: 'Input',
    componentProps: {
      placeholder: '识别：',
    },
  },
  {
    field: 'tempDir',
    label: '临时下载目录',
    bottomHelpMessage: '相对 Yunzai 根目录',
    component: 'Input',
  },
  {
    field: 'downloadTimeout',
    label: '下载超时(ms)',
    component: 'InputNumber',
    componentProps: {
      min: 10000,
      max: 300000,
      step: 5000,
    },
  },
  {
    field: 'keepFileSec',
    label: '本地文件保留秒数',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 3600,
    },
  },
]

export function getConfigData() {
  const c = Config.getConfig('qqmusic')
  return {
    ...c,
    // 带默认值的开关：配置里没有该键时也给界面一个明确布尔值，
    // 否则锅巴显示"关"、实际却是"开"，对不上
    extraSources: c.extraSources !== false,
    defaultPickSong: c.defaultPickSong === true,
    forceMasterAccount: c.forceMasterAccount === true,
    togetherEnable: c.togetherEnable === true,
    togetherAuto: c.togetherAuto === true,
    uiTheme: String(c.uiTheme || 'classic'),
    uiDark: darkPrefOf(c.uiDark),
    uiTimeColor: c.uiTimeColor !== false,
    uiBgEnable: c.uiBgEnable === true,
    uiBgValue: String(c.uiBgValue || ''),
    uiBgCacheMin: c.uiBgCacheMin === undefined || c.uiBgCacheMin === '' ? 10 : Number(c.uiBgCacheMin) || 0,
    songRequestMaxList: c.maxList ?? c.songRequestMaxList ?? 10,
    pullLoginMeta: false,
  }
}

export async function setConfigData(data, { Result } = {}) {
  try {
    const cur = Config.getConfig('qqmusic')
    const next = { ...cur }

    // 白名单直接由 schema 推导 —— 以前是手写数组，加了新开关忘了同步这里，
    // 锅巴保存时会被静默丢弃（表现：开关一打开就弹回原状）
    const UI_ONLY_FIELDS = new Set(['pullLoginMeta']) // 仅界面用，不落盘
    const EXTRA_KEYS = [
      // 未暴露在界面上但需要保留可写的历史字段
      'songRequestMaxList',
      'resolveLinks',
      'resolveCards',
      'lastLoginUin',
      'lastLoginNick',
    ]
    const keys = [
      ...new Set([
        ...schemas.map((s) => s.field).filter((f) => f && !UI_ONLY_FIELDS.has(f)),
        ...EXTRA_KEYS,
      ]),
    ]

    for (const k of keys) {
      if (data[k] !== undefined) next[k] = data[k]
      if (data[`qqmusic.${k}`] !== undefined) next[k] = data[`qqmusic.${k}`]
    }

    const allowed = new Set(QQMUSIC_QUALITY_LIST.map((i) => i.value))
    if (next.quality && !allowed.has(String(next.quality))) {
      const map = {
        lossless: 'flac',
        exhigh: '320',
        standard: '128',
        higher: 'm4a',
        jymaster: 'master',
        dolby: 'atmos',
      }
      next.quality = map[next.quality] || 'flac'
    }

    if (next.songRequestMaxList != null && next.maxList == null) {
      next.maxList = next.songRequestMaxList
    }
    if (next.maxList != null) next.maxList = Number(next.maxList) || 10
    if (next.apiBase) next.apiBase = normalizeApiBase(next.apiBase)

    const wantPull =
      data.pullLoginMeta === true ||
      data['qqmusic.pullLoginMeta'] === true ||
      data.pullLoginMeta === 1 ||
      data.pullLoginMeta === '1'

    let pullMsg = ''
    if (wantPull) {
      try {
        const meta = await pullLoginMeta()
        if (meta.login && meta.hasKey) {
          next.lastLoginUin = meta.uin || next.lastLoginUin || ''
          // 登录会话在 API 侧按 userKey 存；主人账号自动模式靠它定位，备注 uin 可能与会话键不同
          if (meta.userKey && meta.userKey !== 'default') next.lastLoginUserKey = meta.userKey
          next.lastLoginNick = meta.nick || next.lastLoginNick || ''
          next.lastLoginAt = Date.now()
          next.lastHasRefresh = meta.hasRefresh
          pullMsg = `已查到登录态（uin=${meta.uin || '-'}）`
        } else {
          pullMsg = 'API 当前未登录'
        }
      } catch (e) {
        pullMsg = `查询失败：${e.message}`
      }
    }

    Config.setConfig('qqmusic', next)

    const okMsg = [pullMsg, '保存成功'].filter(Boolean).join('；')
    if (Result?.ok) return Result.ok({}, okMsg)
    return { success: true, message: okMsg }
  } catch (e) {
    if (Result?.error) return Result.error(e.message || String(e))
    return { success: false, message: e.message }
  }
}
