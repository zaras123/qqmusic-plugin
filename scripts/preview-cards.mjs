/**
 * 离线预览：热搜 / 设置 / 歌词 / 点歌 卡片
 * 用法: node scripts/preview-cards.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.resolve(__dirname, '..')
const yunzaiPath = path.resolve(pluginPath, '../Yunzai')
const outDir = path.join(pluginPath, 'temp', 'preview')
fs.mkdirSync(outDir, { recursive: true })

const require = createRequire(path.join(yunzaiPath, 'package.json'))

function loadArt() {
  return require(path.join(yunzaiPath, 'node_modules/art-template'))
}

function loadPuppeteer() {
  let p = require(path.join(yunzaiPath, 'node_modules/puppeteer'))
  return p?.default || p
}

const samples = {
  'qqmusic-list': {
    keyword: '起风了',
    total: 5,
    quality: 'FLAC',
    apiHint: 'API · 127.0.0.1:3300',
    tip: '发送 #qqm听序号 播放（会话内也可 #听序号）；列表约 10 分钟内有效',
    songs: [
      {
        index: 1,
        songName: '起风了',
        singerName: '买辣椒也用券',
        albumName: '起风了',
        cover: '',
        duration: '05:25',
        payplay: false,
      },
      {
        index: 2,
        songName: '起风了（Live）',
        singerName: '吴青峰',
        albumName: '歌手',
        cover: '',
        duration: '05:11',
        payplay: true,
      },
      {
        index: 3,
        songName: '起风了',
        singerName: '周深',
        albumName: '深的深',
        cover: '',
        duration: '04:58',
        payplay: false,
      },
      {
        index: 4,
        songName: '起风了（翻唱）',
        singerName: '某翻唱歌手',
        albumName: '翻唱合集',
        cover: '',
        duration: '05:02',
        payplay: false,
      },
      {
        index: 5,
        songName: '起风了 · 钢琴版',
        singerName: '钢琴曲合辑',
        albumName: '纯音乐',
        cover: '',
        duration: '04:20',
        payplay: false,
      },
    ],
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
    ],
    rows: [
      { k: 'API', v: 'http://127.0.0.1:3300' },
      { k: '登录', v: '已绑定 · DemoUser' },
      { k: '适配器', v: 'QQBot (qqbot)' },
      { k: '音质', v: 'FLAC · 自动降级' },
      { k: '列表数', v: '10' },
      { k: '发送', v: '语音 开 / 文件 开 / 原生卡 关 / 自定义卡 关' },
    ],
    commands: [
      { name: '扫码登录', desc: '绑定 QQ 音乐账号获取付费曲权限', example: '#qqm登录' },
      { name: '状态卡片', desc: '查看当前插件运行状态', example: '#qqm状态' },
      { name: '改 API', desc: '切换 qqmusic-api 地址', example: '#qqm api http://127.0.0.1:3300' },
      { name: '改音质', desc: '设置最高播放音质', example: '#qqm 音质 flac' },
      { name: '开关点歌', desc: '开启 / 关闭点歌功能', example: '#qqm 开启点歌' },
      { name: '连通测试', desc: '测试 API 是否正常响应', example: '#qqm 测试' },
    ],
  },
}

async function screenshot(htmlFile, viewportWidth = 640) {
  const puppeteer = loadPuppeteer()
  const chrome =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const dpr = 2
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(chrome) ? chrome : undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--enable-font-antialiasing',
      '--hide-scrollbars',
    ],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: viewportWidth, height: 2400, deviceScaleFactor: dpr })
    await page.goto(pathToFileURL(htmlFile).href, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    })
    await page.evaluate(async () => {
      const bg = '#e6f6ee'
      document.documentElement.style.background = bg
      document.body.style.background = bg
      document.documentElement.style.margin = '0'
      document.body.style.margin = '0'
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready
        } catch {
          /* ignore */
        }
      }
    })
    await new Promise((r) => setTimeout(r, 200))
    const el = (await page.$('.page')) || (await page.$('.card')) || (await page.$('body'))
    const box = await el.boundingBox()
    if (box) {
      const needW = Math.ceil(box.x + box.width + 4)
      const needH = Math.ceil(box.y + box.height + 4)
      const cur = page.viewport()
      if (needW > cur.width || needH > cur.height) {
        await page.setViewport({
          width: Math.max(cur.width, needW),
          height: Math.max(cur.height, needH),
          deviceScaleFactor: dpr,
        })
        await new Promise((r) => setTimeout(r, 80))
      }
    }
    const buff = await el.screenshot({ type: 'png', omitBackground: false })
    return Buffer.isBuffer(buff) ? buff : Buffer.from(buff)
  } finally {
    await browser.close().catch(() => {})
  }
}

async function main() {
  const art = loadArt()
  const results = []
  for (const [tplName, data] of Object.entries(samples)) {
    const tplFile = path.join(pluginPath, 'resources/html', tplName, `${tplName}.html`)
    if (!fs.existsSync(tplFile)) throw new Error(`missing template ${tplFile}`)
    let html = art(tplFile, { data })
    const resUrl = pathToFileURL(path.join(pluginPath, 'resources')).href + '/'
    html = html
      .replace(/src="(\.\/)?resources\//g, `src="${resUrl}`)
      .replace(/url\((['"]?)(\.\/)?resources\//g, `url($1${resUrl}`)
    const htmlOut = path.join(outDir, `${tplName}.html`)
    fs.writeFileSync(htmlOut, html, 'utf8')
    const png = await screenshot(htmlOut, 640)
    const pngOut = path.join(outDir, `${tplName}.png`)
    fs.writeFileSync(pngOut, png)
    results.push({ tplName, pngOut, kb: (png.length / 1024).toFixed(1) })
    console.log(`OK ${tplName} -> ${pngOut} (${(png.length / 1024).toFixed(1)} KB)`)
  }
  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
