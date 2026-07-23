/**
 * 帮助卡数据
 */
import Config from '../components/Config.js'
import { apiHintFor } from './privacy.js'

export function buildHelpCardData() {
  const cfg = Config.getConfig('qqmusic') || {}
  const quality = (cfg.quality || 'flac').toUpperCase()
  const songOn = cfg.enableSongRequest !== false
  const resolveOn = cfg.enableResolve !== false

  return {
    version: 'v1.0',
    statCommands: '15+',
    statQuality: quality,
    statMode: songOn && resolveOn ? '全开' : songOn ? '点歌' : resolveOn ? '解析' : '待机',
    apiHint: apiHintFor(),
    tip: '付费曲需主人 #qqm登录 扫码绑定；点歌统一 #qqm 前缀，列表内 #qqm听1（会话内也可 #听1）；群内分享 QQ 音乐卡片/链接可自动解析。',
    sections: [
      {
        title: '点歌播放',
        tag: '全员',
        items: [
          { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
          { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
          { name: '直接播放', desc: '搜索并立即播放第一条', example: '#qqm播放 晴天' },
          { name: '查看歌词', desc: '按歌名或 mid 取歌词', example: '#qqm歌词 七里香' },
          { name: '热搜榜', desc: '查看 QQ 音乐热搜', example: '#qqm热搜' },
        ],
      },
      {
        title: '账号状态',
        tag: '登录',
        items: [
          { name: '扫码登录', desc: '主人扫码登录（付费音质）', example: '#qqm登录' },
          { name: '状态卡片', desc: '账号 / 会员 / 音质 可视化', example: '#qqm状态' },
          { name: '快捷状态', desc: '状态卡短指令', example: '#qms' },
          { name: '登出解绑', desc: '清除登录态', example: '#qqm登出' },
        ],
      },
      {
        title: '主人管理',
        tag: 'Master',
        items: [
          { name: '查看配置', desc: 'API、开关、音质与发送方式', example: '#qqm设置' },
          { name: '设置 API', desc: '修改接口地址', example: '#qqm api <地址>' },
          { name: '切换音质', desc: '128 / 320 / flac / hires …', example: '#qqm 音质 flac' },
          { name: '功能开关', desc: '开启或关闭点歌、解析', example: '#qqm 开启点歌' },
          { name: '连通测试', desc: '探测 API 是否可用', example: '#qqm 测试' },
        ],
      },
      {
        title: '智能解析',
        tag: '自动',
        items: [
          { name: '分享卡片', desc: '群内 QQ 音乐分享自动识别', example: '（发送音乐卡片）' },
          { name: '链接解析', desc: 'y.qq.com 链接自动取链播放', example: 'https://y.qq.com/…' },
        ],
      },
    ],
  }
}

