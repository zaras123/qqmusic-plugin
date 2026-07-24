/**
 * 帮助卡数据
 */
import Config from '../components/Config.js'
import { apiHintFor } from './privacy.js'
import { getLocalVersion } from './update.js'

export function buildHelpCardData() {
  const cfg = Config.getConfig('qqmusic') || {}
  const quality = (cfg.quality || 'flac').toUpperCase()
  const songOn = cfg.enableSongRequest !== false
  const resolveOn = cfg.enableResolve !== false

  return {
    version: `v${getLocalVersion()}`,
    statCommands: '25+',
    statQuality: quality,
    statMode: songOn && resolveOn ? '全开' : songOn ? '点歌' : resolveOn ? '解析' : '待机',
    apiHint: apiHintFor(),
    tip: '付费曲需主人扫码登录；指令统一 #qqm 前缀；#听序号 仅在本群点歌会话有效；分享 QQ 音乐卡片/链接可自动解析。',
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
        title: '发现音乐',
        tag: '探索',
        items: [
          { name: '排行榜', desc: '查看各大榜单歌曲', example: '#qqm排行 飙升' },
          { name: '推荐歌单', desc: '热门推荐歌单列表', example: '#qqm推荐' },
          { name: '随机推荐', desc: '随机推荐一首歌并播放', example: '#qqm来首歌' },
          { name: '个性电台', desc: '根据口味推荐 5 首', example: '#qqm电台' },
          { name: '每日推荐', desc: '每日推荐歌曲（需登录）', example: '#qqm日推' },
          { name: '我的收藏', desc: '查看收藏歌曲（需登录）', example: '#qqm收藏' },
          { name: '歌手搜索', desc: '搜索歌手并展示热门歌曲', example: '#qqm歌手 周杰伦' },
          { name: '专辑搜索', desc: '搜索专辑并展示曲目列表', example: '#qqm专辑 叶惠美' },
          { name: '歌单搜索', desc: '搜索歌单并展示歌曲', example: '#qqm歌单 华语流行' },
          { name: '歌曲评论', desc: '查看歌曲热门评论', example: '#qqm评论 晴天' },
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
          { name: '插件更新', desc: 'git 拉取最新代码', example: '#qqm更新' },
          { name: '强制更新', desc: '丢弃本地改动同步远程', example: '#qqm强制更新' },
          { name: '更新日志', desc: '查看最近提交', example: '#qqm更新日志' },
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

