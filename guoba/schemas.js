/**
 * 锅巴配置 Schema
 */
import Config from '../components/Config.js'
import { pullLoginMeta, normalizeApiBase } from '../utils/api.js'
import { QQMUSIC_QUALITY_LIST } from '../utils/quality.js'

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
    field: 'publicAccount',
    label: '公共账号（QQ 号）',
    bottomHelpMessage:
      '留空=不启用。填已登录账号的 QQ 号：没登录的群友点歌时回落到这个账号（主人登了 VIP 号，全群都能播 VIP 曲）',
    component: 'Input',
    componentProps: {
      placeholder: '留空=不启用，例如 821352679',
    },
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
