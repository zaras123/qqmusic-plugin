/**
 * 状态卡渲染
 * - 优先 Yunzai puppeteer.screenshot（与 R 插件相同）
 * - 失败则 puppeteer 直连截图（不依赖 redis）
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { pluginName, pluginPath, yunzaiPath } from './path.js'

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

function renderHtmlFile(data, tplName = 'qqmusic-status') {
  const art = loadArtTemplate()
  const tplFile = path.join(pluginPath, 'resources/html', tplName, `${tplName}.html`)
  if (!fs.existsSync(tplFile)) throw new Error(`模板不存在: ${tplFile}`)

  const html = art(tplFile, { data })
  const outDir = path.join(yunzaiPath, 'temp/html', pluginName, tplName)
  ensureDir(outDir)
  const outFile = path.join(outDir, `${tplName}.html`)

  const resUrl = pathToFileURL(path.join(pluginPath, 'resources')).href + '/'
  const absHtml = html
    .replace(/src="(\.\/)?resources\//g, `src="${resUrl}`)
    .replace(/url\((['"]?)(\.\/)?resources\//g, `url($1${resUrl}`)

  fs.writeFileSync(outFile, absHtml, 'utf8')
  return outFile
}

/**
 * 通用卡片渲染：Yunzai 截图 → 直连 puppeteer → runtime.render
 * @param {object} e
 * @param {object} data 模板数据
 * @param {string} tplName 模板目录名（与 html 文件同名）
 */
export async function renderCard(e, data, tplName = 'qqmusic-status') {
  const tplFileRel = `./plugins/${pluginName}/resources/html/${tplName}/${tplName}.html`
  const pluResPath = `${yunzaiPath.replace(/\\/g, '/')}/plugins/${pluginName}/resources/`

  // 优先直连截图：可控底色/清晰度；Yunzai 默认页底常为白，容易出现“白背景”
  try {
    const htmlFile = renderHtmlFile(data, tplName)
    const vw = ['qqmusic-help', 'qqmusic-list', 'qqmusic-hot', 'qqmusic-lyric', 'qqmusic-settings'].includes(tplName)
      ? 640
      : 580
    const buf = await screenshotDirect(htmlFile, vw)
    const outPng = path.join(yunzaiPath, 'temp', `${tplName}.png`)
    ensureDir(path.dirname(outPng))
    fs.writeFileSync(outPng, buf)
    logInfo(`[qqmusic-plugin] ${tplName} 截图成功 (direct) ${(buf.length / 1024).toFixed(1)}KB`)
    return toSegmentImage(buf)
  } catch (err) {
    logWarn(`[qqmusic-plugin] direct 截图失败 (${tplName}): ${err.message}`)
  }

  try {
    if (typeof global.redis !== 'undefined' && global.redis) {
      const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
      const img = await puppeteer.screenshot(tplName, {
        saveId: tplName,
        tplFile: tplFileRel,
        pluResPath,
        data,
        imgType: 'png',
      })
      if (img) {
        logInfo(`[qqmusic-plugin] ${tplName} 截图成功 (yunzai)`)
        return img
      }
    }
  } catch (err) {
    logWarn(`[qqmusic-plugin] yunzai 截图失败 (${tplName}): ${err.message}`)
  }

  try {
    if (e?.runtime?.render) {
      const ret = await e.runtime.render(
        pluginName,
        `html/${tplName}/${tplName}`,
        { ...data, data, saveId: tplName },
        { retType: 'base64' }
      )
      if (ret) return ret
    }
  } catch (err) {
    logWarn(`[qqmusic-plugin] runtime.render 失败 (${tplName}): ${err.message}`)
  }

  return null
}

async function screenshotDirect(htmlFile, viewportWidth = 640) {
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
    await page.emulateMediaFeatures?.([{ name: 'prefers-color-scheme', value: 'light' }])
    await page.goto(pathToFileURL(htmlFile).href, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    })
    await page.evaluate(async () => {
      // 用不透明浅绿底，QQ 端不会再把“透明”显示成纯白
      const bg = '#e6f6ee'
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
    })
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

export async function renderSettingsCard(e, data) {
  return renderCard(e, data, 'qqmusic-settings')
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
    `API: ${data.apiBase}`,
    `Key: ${data.keyStatus}`,
    !data.loggedIn ? '发送 #qqm登录 扫码绑定' : '',
  ]
    .filter(Boolean)
    .join('\n')
}
