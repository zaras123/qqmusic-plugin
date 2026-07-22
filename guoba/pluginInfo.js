import path from 'node:path'
import { pluginName, pluginPath } from '../utils/path.js'

export default {
  name: 'QQ音乐插件',
  title: pluginName,
  author: '@local',
  authorLink: '',
  link: '',
  isV3: true,
  isV2: false,
  description: 'QQ 音乐点歌 / 卡片解析 / 扫码登录',
  // 左侧菜单：有自定义图标时显示
  showInMenu: true,
  // Iconify 兜底（无 iconPath 时）
  icon: 'mdi:music-circle',
  // QQ 音乐品牌绿
  iconColor: '#31c27c',
  // 锅巴侧栏 / 插件列表自定义图标
  iconPath: path.join(pluginPath, 'resources/img/logo.png'),
}
