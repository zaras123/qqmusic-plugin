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
import { fileURLToPath } from 'node:url'
// 夹具模块是**纯数据**（只 import node 内置模块）：静态 import 会提前求值，
// 它不碰 utils/*，所以不会打乱下面 QQMUSIC_YUNZAI_PATH 的先后顺序。
import { samples, logoUrl } from './preview-samples.mjs'

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
const { renderHtmlFile, screenshotDirect, closeDirectBrowser } = await import('../utils/render.js')

const outRoot = path.join(pluginPath, 'temp', 'preview')
fs.mkdirSync(outRoot, { recursive: true })

// —————————————————————— 主流程 ——————————————————————

const argv = process.argv.slice(2)
const flags = argv.filter((a) => a.startsWith('--'))
const words = argv.filter((a) => !a.startsWith('--'))
const onlyTheme = words[0] || ''
const onlyCard = words[1] || ''
const darkOnly = flags.includes('--dark')
const lightOnly = flags.includes('--light')
/** --time=dawn|day|dusk|night 强制某个时段；--times 四段全渲染（否则用真实时间） */
const forcedTime = (flags.find((f) => f.startsWith('--time=')) || '').split('=')[1] || ''
const allTimes = flags.includes('--times')
/** --bg=<本地路径或链接> 用自定义背景渲染（走与真机同一套解析，含远端抓取与缓存） */
const bgArg = (flags.find((f) => f.startsWith('--bg=')) || '').slice(5).trim()
/** 时段 → 用来喂给 resolveTheme 的假时间（纯为了稳定出图，不影响真机行为） */
const PERIOD_HOUR = { dawn: 6, day: 12, dusk: 18, night: 22 }

function periodDate(period) {
  const d = new Date()
  d.setHours(PERIOD_HOUR[period] ?? 12, 0, 0, 0)
  return d
}

async function main() {
  // 只重建总览页（不重新渲染，改完索引样式或想刷新清单时用）
  if (flags.includes('--index-only')) {
    writeIndex()
    return
  }
  const themeIds = listThemeIds().filter((id) => !onlyTheme || id === onlyTheme)
  if (!themeIds.length) throw new Error(`没有匹配的主题（可用: ${listThemeIds().join(', ') || '无'}）`)

  const cards = CARDS.filter((c) => !onlyCard || c === onlyCard)
  const done = []
  const failed = []
  const periods = allTimes ? Object.keys(PERIOD_HOUR) : forcedTime ? [forcedTime] : ['']

  // 自定义背景（可选）：解析一次，所有卡片共用
  let bg = null
  if (bgArg) {
    const { resolveBackground } = await import('../utils/background.js')
    bg = await resolveBackground({ uiBgEnable: true, uiBgValue: bgArg, uiBgCacheMin: 10 })
    if (!bg) {
      console.log(`⚠️ 背景解析失败（${bgArg}），按无背景渲染`)
    } else {
      console.log(`[preview] 背景: ${bg.source}/${bg.from} → ${bg.path}`)
    }
  }

  for (const id of themeIds) {
    const manifest = loadManifest(id) || {}
    const modes = []
    if (!darkOnly) modes.push('light')
    if (!lightOnly && manifest.dark === true) modes.push('dark')

    for (const mode of modes) {
      for (const period of periods) {
        const theme = resolveTheme(
          { uiTheme: id, uiDark: mode },
          period ? { now: periodDate(period) } : undefined
        )
        // 目录名：真实时段时不带后缀；强制/全时段/带背景时带上，便于对比
        const suffix =
          (mode === 'dark' ? '-dark' : '') + (period ? `-${period}` : '') + (bg ? '-bg' : '')
        const dirName = `${id}${suffix}`
        const dir = path.join(outRoot, dirName)
        fs.mkdirSync(dir, { recursive: true })

        for (const card of cards) {
          const data = samples[card]
          if (!data) {
            console.log(`SKIP ${dirName}/${card}（没有样例数据）`)
            continue
          }
          try {
            const { outFile, tpl } = renderHtmlFile(data, card, theme, { bgUrl: bg?.url || '' })
            const png = await screenshotDirect(outFile, {
              viewportWidth: viewportWidthOf(theme, card),
              pageBg: pageBgOf(theme),
              // 预览/展示图**固定 PNG**（要拿去做素材、看细节；线上发卡走 jpeg，见 utils/render.js）
              format: 'png',
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
  }

  console.log(`\n完成 ${done.length} 张，失败 ${failed.length} 张`)
  console.log(`输出目录: ${outRoot}`)
  writeIndex()
  // 截图现在共用同一个 Chrome（见 utils/render.js）：本脚本跑完就退，得显式关掉
  await closeDirectBrowser()
  if (failed.length) process.exitCode = 1
}

/**
 * 总览页：扫描输出目录（不是只看本次渲染 —— 否则分几次跑会把先前的覆盖掉）
 */
function writeIndex() {
  try {
    const dirNames = fs
      .readdirSync(outRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    const groups = {}
    let total = 0
    for (const dirName of dirNames) {
      const pngs = fs
        .readdirSync(path.join(outRoot, dirName))
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.replace(/\.png$/, ''))
        .sort()
      if (!pngs.length) continue
      groups[dirName] = pngs
      total += pngs.length
    }
    const idx = path.join(outRoot, 'index.html')
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>卡片预览 · ${total} 张</title>
<style>
  body{margin:0;padding:28px;background:#111;color:#eee;
       font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei UI",sans-serif}
  h1{font-size:20px;margin:0 0 8px}
  h2{margin:28px 0 12px;font-size:16px;font-weight:600;color:#fff}
  .grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
  figure{margin:0;width:300px}
  figcaption{margin-top:6px;font-size:12px;color:#9aa}
  img{width:100%;height:auto;border-radius:8px;display:block;background:#222}
</style></head><body>
<h1>卡片预览（${total} 张 · ${Object.keys(groups).length} 组）</h1>
<p style="color:#9aa;margin:0">目录名 = 主题 [-dark] [-时段]；时段四组用于对比"底色随时段"的效果</p>
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
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
