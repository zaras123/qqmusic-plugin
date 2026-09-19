/**
 * 离线预览：把**所有主题 × 所有卡片 × 浅色/深色**渲染成 PNG
 *
 * 用法:
 *   node scripts/preview-cards.mjs                  # 全部
 *   node scripts/preview-cards.mjs apple            # 只渲染某个主题
 *   node scripts/preview-cards.mjs apple qqmusic-list
 *   node scripts/preview-cards.mjs --dark           # 只渲染深色（支持深色的主题）
 *
 * 产出: temp/preview/<主题>[-dark]/<卡片>.png
 *
 * 为什么复用 utils/render.js 而不另写一份：预览必须走**生产同一条**路径变换
 * （resources/ 绝对化、data-theme/data-mode 注入、art-template 热更新），
 * 否则「预览好看、真机发出去是另一回事」。
 * 为此先在环境变量里给出框架目录，path.js 会优先用它。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.resolve(__dirname, '..')

/** 找框架根目录：预览要借它的 node_modules（art-template / puppeteer） */
function resolveYunzai() {
  const candidates = [
    process.env.QQMUSIC_YUNZAI_PATH,
    path.resolve(pluginPath, '../Yunzai'),
    path.resolve(pluginPath, '../Miao-Yunzai'),
    path.resolve(pluginPath, '../../机器人框架/Yunzai'),
    path.resolve(pluginPath, '../../机器人框架/Miao-Yunzai'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node_modules/art-template'))) return c
  }
  for (const base of [path.resolve(pluginPath, '..'), path.resolve(pluginPath, '../..')]) {
    let entries = []
    try {
      entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of entries) {
      if (!d.isDirectory()) continue
      const p = path.join(base, d.name)
      if (fs.existsSync(path.join(p, 'node_modules/art-template'))) return p
    }
  }
  throw new Error('找不到 Yunzai 框架目录；请设置 QQMUSIC_YUNZAI_PATH')
}

// 必须在 import utils/* 之前设好：path.js 在模块加载时就要解析框架目录
process.env.QQMUSIC_YUNZAI_PATH = resolveYunzai()

const { listThemeIds, loadManifest, resolveTheme, pageBgOf, viewportWidthOf, CARDS } = await import(
  '../utils/theme.js'
)
const { renderHtmlFile, screenshotDirect } = await import('../utils/render.js')

const outRoot = path.join(pluginPath, 'temp', 'preview')
fs.mkdirSync(outRoot, { recursive: true })

const logoUrl = pathToFileURL(path.join(pluginPath, 'resources/img/logo.png')).href

// —————————————————————— 样例数据（每张卡一套） ——————————————————————

const SONGS = [
  { songName: '起风了', singerName: '买辣椒也用券', albumName: '起风了', duration: '05:25', payplay: false },
  { songName: '起风了（Live）', singerName: '吴青峰', albumName: '歌手', duration: '05:11', payplay: true },
  { songName: '起风了', singerName: '周深', albumName: '深的深', duration: '04:58', payplay: false },
  { songName: '起风了（翻唱）', singerName: '某翻唱歌手', albumName: '翻唱合集', duration: '05:02', payplay: false },
  { songName: '起风了 · 钢琴版', singerName: '钢琴曲合辑', albumName: '纯音乐', duration: '04:20', payplay: false },
]

const samples = {
  'qqmusic-list': {
    keyword: '起风了',
    total: 5,
    quality: 'FLAC',
    apiHint: 'API · 127.0.0.1:3300',
    commands: [
      { name: '#qqm听序号', desc: '播放当前列表中的指定歌曲（会话内也可 #听序号）', example: '#qqm听1' },
      { name: '#qqm歌词 序号', desc: '查看指定歌曲的纯文本歌词', example: '#qqm歌词1' },
      { name: '#qqmMV 播放 序号', desc: '播放 / 下载该曲 MV（列表带 🎬 即是有 MV 的歌曲）', example: '#qqmMV 播放 1' },
      { name: '列表有效期', desc: '本列表约 10 分钟内有效，过期请重新搜索', example: '#qqm点歌 关键词' },
    ],
    songs: SONGS.map((s, i) => ({ ...s, index: i + 1, cover: '' })),
  },
  'qqmusic-hot': {
    title: 'QQ音乐热搜',
    subtitle: '实时热搜 · 可直接 #qqm点歌 关键词',
    total: 10,
    apiHint: 'API · 127.0.0.1:3300',
    tip: '复制热搜词后发送 #qqm点歌 关键词 即可搜索',
    items: [
      { index: 1, word: '起风了', hot: '982万' },
      { index: 2, word: '七里香', hot: '865万' },
      { index: 3, word: '晴天', hot: '741万' },
      { index: 4, word: '稻香', hot: '620万' },
      { index: 5, word: '夜曲', hot: '588万' },
      { index: 6, word: '告白气球', hot: '512万' },
      { index: 7, word: '倒带', hot: '476万' },
      { index: 8, word: '一路向北', hot: '431万' },
      { index: 9, word: '青花瓷', hot: '398万' },
      { index: 10, word: '搁浅', hot: '365万' },
    ],
  },
  'qqmusic-lyric': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    songmid: '0039MnYb0qxYhV',
    lineCount: 16,
    apiHint: 'API · 127.0.0.1:3300',
    tip: '已去除时间戳，纯文本歌词',
    lines: [
      '这一路上走走停停',
      '顺着少年漂流的痕迹',
      '迈出车站的前一刻',
      '竟有些犹豫',
      '',
      '不禁笑这近乡情怯',
      '仍无可避免',
      '而长野的天',
      '依旧那么暖',
      '风吹起了从前',
      '',
      '从前初识这世间',
      '万般流连',
      '看着天边似在眼前',
      '也甘愿赴汤蹈火去走它一遍',
      '如今走过这世间',
    ],
  },
  'qqmusic-settings': {
    title: 'QQ音乐设置',
    subtitle: '当前插件运行配置一览',
    loginOk: true,
    quality: 'FLAC',
    tip: '详细开关可在锅巴面板修改；付费曲需主人 #qqm登录',
    tiles: [
      { label: '点歌', value: '开', on: true },
      { label: '解析', value: '开', on: true },
      { label: '列表卡', value: '开', on: true },
      { label: '语音', value: '开', on: true },
      { label: '群文件', value: '开', on: true },
      { label: '降级', value: '开', on: true },
      { label: '一起听', value: '关', on: false },
    ],
    rows: [
      { k: 'API', v: 'http://127.0.0.1:3300' },
      { k: '登录', v: '已绑定 · DemoUser' },
      { k: '适配器', v: 'QQBot (qqbot)' },
      { k: '主题', v: 'classic（浅色）' },
      { k: '音质', v: 'FLAC · 自动降级' },
      { k: '列表数', v: '10' },
      { k: '发送', v: '语音 开 / 文件 开 / 原生卡 关 / 自定义卡 关' },
    ],
    commands: [
      { name: '扫码登录', desc: '绑定 QQ 音乐账号获取付费曲权限', example: '#qqm登录' },
      { name: '状态卡片', desc: '查看当前插件运行状态', example: '#qqm状态' },
      { name: '换界面', desc: '切换卡片主题 / 深浅色', example: '#qqm界面 apple' },
      { name: '改 API', desc: '切换 qqmusic-api 地址', example: '#qqm api http://127.0.0.1:3300' },
      { name: '改音质', desc: '设置最高播放音质', example: '#qqm 音质 flac' },
      { name: '连通测试', desc: '测试 API 是否正常响应', example: '#qqm 测试' },
    ],
  },
  'qqmusic-status': {
    title: 'QQ音乐状态',
    subtitle: '账号 / 会员 / 音质',
    nickname: 'DemoUser',
    uin: '1234****',
    loginTypeText: '扫码登录',
    loggedIn: true,
    vipTitle: '绿钻豪华版',
    vipStateText: '生效中',
    vipExpireText: '到期：2026-12-31',
    musicQuality: 'FLAC',
    keyStatus: '正常（剩余 2 天）',
    apiBase: 'http://127.0.0.1:3300',
    avatarUrl: logoUrl,
    avatarIsPhoto: true,
    stats: [
      { label: '点歌', value: '开' },
      { label: '解析', value: '开' },
      { label: '降级', value: '开' },
    ],
    footer: 'QQMusic Plugin · 状态卡片',
  },
  'qqmusic-help': {
    version: 'v1.5.0',
    logo: logoUrl,
    statCommands: '40+',
    statQuality: 'FLAC',
    statMode: '全开',
    apiHint: 'API · 127.0.0.1:3300',
    tip: '付费曲需主人扫码登录；指令统一 #qqm 前缀；#听序号 取自己最近一次列表。',
    sections: [
      {
        title: '点歌播放',
        tag: '全员',
        items: [
          { name: '搜索点歌', desc: '按关键词搜索并展示列表', example: '#qqm点歌 七里香' },
          { name: '选择曲目', desc: '播放当前列表第 N 首', example: '#qqm听1' },
          { name: '一起听', desc: '把列表第 N 首加进群里的一起听', example: '#qqm一起听 1' },
        ],
      },
      {
        title: '主人管理',
        tag: 'Master',
        items: [
          { name: '查看配置', desc: 'API、开关、音质与发送方式', example: '#qqm设置' },
          { name: '切换界面', desc: '换一套卡片 UI / 深浅色', example: '#qqm界面' },
        ],
      },
    ],
  },
  'qqmusic-detail': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    duration: '05:25',
    payplay: false,
    showPay: false,
    qualityLabel: 'FLAC',
    source: 'QQ音乐',
    tip: '正在下载并发送…',
  },
  'qqmusic-comment': {
    songName: '起风了',
    singerName: '买辣椒也用券',
    albumName: '起风了',
    cover: '',
    songmid: '0039MnYb0qxYhV',
    total: 4,
    apiHint: 'API · 127.0.0.1:3300',
    tip: '热门评论按点赞排序',
    comments: [
      {
        nick: '听风的人',
        avatar: '',
        content: '愿你走出半生，归来仍是少年。',
        time: '2024-05-01',
        likes: '1.2万',
        hot: true,
      },
      { nick: '深夜食堂', avatar: '', content: '这首歌单曲循环了一整个夏天。', time: '2023-08-12', likes: '8623', hot: false },
      { nick: '路人甲', avatar: '', content: '前奏一响就知道是它。', time: '2023-03-04', likes: '4210', hot: false },
      { nick: '钢琴手', avatar: '', content: '钢琴版也很好听，推荐。', time: '2022-11-19', likes: '1908', hot: false },
    ],
  },
}

// —————————————————————— 主流程 ——————————————————————

const argv = process.argv.slice(2)
const flags = argv.filter((a) => a.startsWith('--'))
const words = argv.filter((a) => !a.startsWith('--'))
const onlyTheme = words[0] || ''
const onlyCard = words[1] || ''
const darkOnly = flags.includes('--dark')
const lightOnly = flags.includes('--light')

async function main() {
  const themeIds = listThemeIds().filter((id) => !onlyTheme || id === onlyTheme)
  if (!themeIds.length) throw new Error(`没有匹配的主题（可用: ${listThemeIds().join(', ') || '无'}）`)

  const cards = CARDS.filter((c) => !onlyCard || c === onlyCard)
  const done = []
  const failed = []

  for (const id of themeIds) {
    const manifest = loadManifest(id) || {}
    const modes = []
    if (!darkOnly) modes.push(false)
    if (!lightOnly && manifest.dark === true) modes.push(true)

    for (const dark of modes) {
      const theme = resolveTheme({ uiTheme: id, uiDark: dark })
      const dirName = dark ? `${id}-dark` : id
      const dir = path.join(outRoot, dirName)
      fs.mkdirSync(dir, { recursive: true })

      for (const card of cards) {
        const data = samples[card]
        if (!data) {
          console.log(`SKIP ${dirName}/${card}（没有样例数据）`)
          continue
        }
        try {
          const { outFile, tpl } = renderHtmlFile(data, card, theme)
          const png = await screenshotDirect(outFile, {
            viewportWidth: viewportWidthOf(theme, card),
            pageBg: pageBgOf(theme),
          })
          const outPng = path.join(dir, `${card}.png`)
          fs.writeFileSync(outPng, png)
          const tag = tpl.fallback ? ` [回落到 ${tpl.from}]` : ''
          console.log(`OK   ${dirName}/${card} ${(png.length / 1024).toFixed(1)}KB${tag}`)
          done.push(`${dirName}/${card}`)
        } catch (err) {
          console.log(`FAIL ${dirName}/${card}: ${err.message}`)
          failed.push(`${dirName}/${card}`)
        }
      }
    }
  }

  console.log(`\n完成 ${done.length} 张，失败 ${failed.length} 张`)
  console.log(`输出目录: ${outRoot}`)

  // 顺手生成总览页：打开一个文件就能看全所有主题/卡片/深浅
  try {
    const idx = path.join(outRoot, 'index.html')
    const groups = {}
    for (const key of done) {
      const [dirName, card] = key.split('/')
      ;(groups[dirName] = groups[dirName] || []).push(card)
    }
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>卡片预览 · ${done.length} 张</title>
<style>
  body{margin:0;padding:28px;background:#111;color:#eee;
       font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei UI",sans-serif}
  h2{margin:28px 0 12px;font-size:16px;font-weight:600;color:#fff}
  .grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
  figure{margin:0;width:300px}
  figcaption{margin-top:6px;font-size:12px;color:#9aa}
  img{width:100%;height:auto;border-radius:8px;display:block;background:#222}
</style></head><body>
<h1 style="font-size:20px">卡片预览（${done.length} 张）</h1>
${Object.entries(groups)
  .map(
    ([dirName, cards]) => `<h2>${dirName}</h2>\n<div class="grid">
${cards
  .map(
    (c) =>
      `  <figure><img src="./${dirName}/${c}.png" alt="${c}" loading="lazy"><figcaption>${c}</figcaption></figure>`
  )
  .join('\n')}
</div>`
  )
  .join('\n')}
</body></html>`
    fs.writeFileSync(idx, html, 'utf8')
    console.log(`总览页: ${idx}`)
  } catch (err) {
    console.log(`总览页生成失败: ${err.message}`)
  }

  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
