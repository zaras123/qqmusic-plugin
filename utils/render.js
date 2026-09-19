/**
 * 卡片渲染（主题化）
 * - 模板来自 resources/themes/<主题>/，主题与配置由 utils/theme.js 解析
 * - 优先 Yunzai puppeteer.screenshot（与 R 插件相同）
 * - 失败则 puppeteer 直连截图（不依赖 redis）
 * - 热更新：模板文件 mtime 变了就让 art-template 重新编译（见 renderHtmlFile）
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { pluginName, pluginPath, yunzaiPath } from './path.js'
import { getCfg } from './common.js'
import {
  DEFAULT_THEME,
  resolveTheme,
  templateFile,
  pageBgOf,
  viewportWidthOf,
  fileChanged,
  invalidateAll as invalidateThemeCache,
} from './theme.js'

const require = createRequire(path.join(yunzaiPath, 'package.json'))

function logWarn(...args) {
  if (typeof global.logger?.warn === 'function') global.logger.warn(...args)
  else console.warn(...args)
}
function logInfo(...args) {
  if (typeof global.logger?.info === 'function') global.logger.info(...args)
  else if (typeof global.logger?.mark === 'function') global.logger.mark(...args)
  else console.log(...args)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function loadArtTemplate() {
  const tries = [
    () => require('art-template'),
    () => require(path.join(yunzaiPath, 'node_modules/art-template')),
    () =>
      require(
        path.join(
          yunzaiPath,
          'node_modules/.pnpm/art-template@4.13.2/node_modules/art-template'
        )
      ),
  ]
  let last
  for (const fn of tries) {
    try {
      return fn()
    } catch (e) {
      last = e
    }
  }
  throw new Error(`无法加载 art-template: ${last?.message || ''}`)
}

function loadPuppeteer() {
  const tries = [
    () => require('puppeteer'),
    () => require(path.join(yunzaiPath, 'node_modules/puppeteer')),
  ]
  for (const fn of tries) {
    try {
      return fn()
    } catch {
      /* next */
    }
  }
  return null
}

/**
 * 编译模板并落盘成可直接截图的 HTML
 * 导出给 scripts/preview-cards.mjs 复用 —— 本地预览必须走**同一条**路径变换，
 * 否则预览看到的和真机发出去的会不一致。
 * @returns {{outFile:string, tpl:{file:string, from:string, fallback:boolean}}}
 */
export function renderHtmlFile(data, card, theme) {
  const art = loadArtTemplate()
  const tpl = templateFile(theme, card)
  if (!tpl.file) {
    throw new Error(`模板不存在: ${card}（主题 ${theme.id} 与 ${DEFAULT_THEME} 下都没有）`)
  }

  // 热更新：文件改过就让 art-template 丢掉这份编译缓存。
  // 它默认按文件名永久缓存编译结果（compile/index.js:58,127），不失效的话
  // 改了模板必须重启机器人 —— 这就是「热更新」要解决的那件事。
  if (fileChanged(tpl.file)) art.defaults?.caches?.set?.(tpl.file, undefined)

  const html = art(tpl.file, { data })
  const outDir = path.join(yunzaiPath, 'temp/html', pluginName, theme.id)
  ensureDir(outDir)
  const outFile = path.join(outDir, `${card}.html`)

  const resUrl = pathToFileURL(path.join(pluginPath, 'resources')).href + '/'
  const mode = theme.dark ? 'dark' : 'light'
  const absHtml = html
    // 主题 / 明暗 / 时段挂在 <html> 上：模板据此切调色板（不依赖 prefers-color-scheme，结果确定）。
    // 放在这里而不是 page.evaluate，是为了 Yunzai / runtime.render 两条回退路径也吃得到。
    .replace(
      /<html\b([^>]*)>/,
      `<html$1 data-theme="${theme.id}" data-mode="${mode}" data-time="${theme.period || 'day'}">`
    )
    .replace(/src="(\.\/)?resources\//g, `src="${resUrl}`)
    // 主题的共享样式用 <link href="resources/themes/<id>/_base.css"> 引入，这条同样要改写
    .replace(/href="(\.\/)?resources\//g, `href="${resUrl}`)
    .replace(/url\((['"]?)(\.\/)?resources\//g, `url($1${resUrl}`)

  fs.writeFileSync(outFile, absHtml, 'utf8')
  return { outFile, tpl }
}

/**
 * 通用卡片渲染：Yunzai 截图 → 直连 puppeteer → runtime.render
 * @param {object} e
 * @param {object} data 模板数据
 * @param {string} tplName 模板目录名（与 html 文件同名）
 */
export async function renderCard(e, data, card = 'qqmusic-status') {
  const cfg = getCfg()
  const theme = resolveTheme(cfg)
  if (theme.fallback) {
    logWarn(`[qqmusic-plugin] 主题「${theme.requested}」不存在，已回落 ${DEFAULT_THEME}（可用主题见 #qqm界面）`)
  }
  const tpl = templateFile(theme, card)
  const tplFileRel = `./plugins/${pluginName}/resources/themes/${tpl.from}/${card}.html`
  const pluResPath = `${yunzaiPath.replace(/\\/g, '/')}/plugins/${pluginName}/resources/`

  // 优先直连截图：可控底色/清晰度；Yunzai 默认页底常为白，容易出现“白背景”
  try {
    const { outFile } = renderHtmlFile(data, card, theme)
    const vw = viewportWidthOf(theme, card)
    const buf = await screenshotDirect(outFile, { viewportWidth: vw, pageBg: pageBgOf(theme) })
    const outPng = path.join(yunzaiPath, 'temp', `${theme.id}-${card}.png`)
    ensureDir(path.dirname(outPng))
    fs.writeFileSync(outPng, buf)
    logInfo(
      `[qqmusic-plugin] ${card} 截图成功 (direct · 主题 ${theme.id}${theme.dark ? '·深色' : ''}) ${(buf.length / 1024).toFixed(1)}KB`
    )
    return toSegmentImage(buf)
  } catch (err) {
    logWarn(`[qqmusic-plugin] direct 截图失败 (${card}): ${err.message}`)
  }

  try {
    if (typeof global.redis !== 'undefined' && global.redis) {
      const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
      const img = await puppeteer.screenshot(card, {
        saveId: `${theme.id}-${card}`,
        tplFile: tplFileRel,
        pluResPath,
        data,
        imgType: 'png',
      })
      if (img) {
        logInfo(`[qqmusic-plugin] ${card} 截图成功 (yunzai)`)
        return img
      }
    }
  } catch (err) {
    logWarn(`[qqmusic-plugin] yunzai 截图失败 (${card}): ${err.message}`)
  }

  try {
    if (e?.runtime?.render) {
      const ret = await e.runtime.render(
        pluginName,
        `themes/${tpl.from}/${card}`,
        { ...data, data, saveId: `${theme.id}-${card}` },
        { retType: 'base64' }
      )
      if (ret) return ret
    }
  } catch (err) {
    logWarn(`[qqmusic-plugin] runtime.render 失败 (${card}): ${err.message}`)
  }

  return null
}

/**
 * 清掉全部模板编译缓存 + 主题缓存（#qqm界面 重载）
 * 平时靠 mtime 自动失效；这条用于一次改了一批文件后强制重来。
 */
export function reloadTemplates() {
  invalidateThemeCache()
  try {
    loadArtTemplate().defaults?.caches?.reset?.()
  } catch {
    /* art-template 不可用时无所谓 */
  }
}

/** 底色是不是深色（决定把 prefers-color-scheme 模拟成哪边） */
function isDarkBg(color) {
  const m = String(color || '').match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}

/** 直连 Chrome 截图（导出给本地预览复用，保证与真机同一套参数） */
export async function screenshotDirect(htmlFile, { viewportWidth = 640, pageBg = '#F2F2F7' } = {}) {
  let puppeteer = loadPuppeteer()
  if (!puppeteer) {
    puppeteer = (await import(pathToFileURL(path.join(yunzaiPath, 'node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js')).href)).default
  }
  // CJS default
  if (puppeteer?.default) puppeteer = puppeteer.default
  if (!puppeteer?.launch) {
    // last resort dynamic from yunzai cwd
    const mod = await import('puppeteer')
    puppeteer = mod.default || mod
  }

  const chromeCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  let executablePath
  for (const p of chromeCandidates) {
    if (fs.existsSync(p)) {
      executablePath = p
      break
    }
  }

  // 注意：不要再叠 --force-device-scale-factor，交给 viewport.deviceScaleFactor
  // 过高 dpr 在部分 Chrome 上会二次缩放导致糊字
  const dpr = 3
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
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
    await page.setViewport({
      width: viewportWidth,
      height: 2200,
      deviceScaleFactor: dpr,
    })
    await page.emulateMediaFeatures?.([
      { name: 'prefers-color-scheme', value: pageBg && isDarkBg(pageBg) ? 'dark' : 'light' },
    ])
    await page.goto(pathToFileURL(htmlFile).href, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    })
    await page.evaluate(async (bg) => {
      // 用不透明底色（由主题 manifest 给）：QQ 端会把透明 PNG 填成纯白，所以不能留透明
      document.documentElement.style.background = bg
      document.body.style.background = bg
      document.documentElement.style.width = 'fit-content'
      document.body.style.width = 'fit-content'
      document.documentElement.style.margin = '0'
      document.body.style.margin = '0'
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready
        } catch {
          /* ignore */
        }
      }
    }, pageBg)
    await new Promise((r) => setTimeout(r, 200))

    // 截 .page（含浅绿底 + 卡片），整图不透明，避免协议把透明填白
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

    const buff = await el.screenshot({
      type: 'png',
      // 不透明导出，兼容 QQ / ICQQ / NapCat 对透明 PNG 的白底处理
      omitBackground: false,
      captureBeyondViewport: false,
    })
    return Buffer.isBuffer(buff) ? buff : Buffer.from(buff)
  } finally {
    await browser.close().catch(() => {})
  }
}

function toSegmentImage(buf) {
  if (!buf) return null
  const file = `base64://${buf.toString('base64')}`
  if (global.segment?.image) {
    try {
      return segment.image(file)
    } catch {
      /* fallthrough */
    }
  }
  return { type: 'image', file }
}

export async function renderStatusCard(e, data) {
  return renderCard(e, data, 'qqmusic-status')
}

export async function renderHelpCard(e, data) {
  return renderCard(e, data, 'qqmusic-help')
}

export async function renderListCard(e, data) {
  return renderCard(e, data, 'qqmusic-list')
}

export async function renderHotCard(e, data) {
  return renderCard(e, data, 'qqmusic-hot')
}

export async function renderLyricCard(e, data) {
  return renderCard(e, data, 'qqmusic-lyric')
}

export async function renderCommentCard(e, data) {
  return renderCard(e, data, 'qqmusic-comment')
}

export async function renderSettingsCard(e, data) {
  return renderCard(e, data, 'qqmusic-settings')
}

export async function renderDetailCard(e, data) {
  return renderCard(e, data, 'qqmusic-detail')
}

export function formatStatusText(data) {
  return [
    `【${data.title || 'QQ音乐状态'}】`,
    `昵称: ${data.nickname}`,
    `UIN: ${data.uin}`,
    `登录: ${data.loginTypeText}`,
    `会员: ${data.vipTitle} · ${data.vipStateText}`,
    `最高音质: ${data.musicQuality}`,
    data.vipExpireText,
    `Key: ${data.keyStatus}`,
    !data.loggedIn ? '发送 #qqm登录 扫码绑定' : '',
  ]
    .filter(Boolean)
    .join('\n')
}
