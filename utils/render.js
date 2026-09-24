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
  // 图片格式与 theme.js 同一处定义（三个常量/归一函数在文件下方转发导出）
  IMAGE_QUALITY,
  imageFormatOf,
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

let fontProbeLogged = false

/**
 * 字体自检只报一次：卡片字体栈里**这台机器真的装了**的是哪几个
 *
 * 为什么需要（2026-09-24 用户反馈"2.0 主题字体残缺不全"）：浏览器**不会**告诉你
 * 它最后用了哪个字体 —— 主机少装字体时会悄悄回落到别的字（甚至是衬线/合成粗体），
 * 小字号中文的细横笔画就会被糊掉或撑没。这里主动探一次写进日志，排障一眼看清。
 */
function logFontProbeOnce(probe) {
  if (fontProbeLogged || !probe) return
  fontProbeLogged = true
  const hit = Array.isArray(probe.hit) ? probe.hit : []
  if (hit.length) {
    logInfo(`[qqmusic-plugin] 卡片字体：命中 ${hit[0]}${hit.length > 1 ? `（本机可用：${hit.join('、')}）` : ''}`)
  } else {
    logWarn(
      `[qqmusic-plugin] 卡片字体：字体栈里一个都没装 → 会回落到系统默认字体（"残缺/发虚"多半就是这么来的）。\n` +
        `  修法（Linux 容器最常见）：Debian/Ubuntu 容器里` +
        ` apt-get install -y fonts-noto-cjk fonts-wqy-microhei fonts-noto-color-emoji；` +
        `RHEL/CentOS 用 dnf install -y google-noto-sans-cjk-fonts google-noto-emoji-color-fonts。` +
        `装完重启机器人即可（emoji 字体也要装：卡片上的 🔒/✅ 这类符号同样靠它）。\n` +
        `  栈：${probe.stack}`
    )
  }
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
export function renderHtmlFile(data, card, theme, { bgUrl = '' } = {}) {
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
  const hasBg = Boolean(bgUrl)
  let absHtml = html
    // 主题 / 明暗 / 时段（/ 是否有自定义背景）挂在 <html> 上：模板与 CSS 据此切样式
    //（不依赖 prefers-color-scheme，结果确定）。放在这里而不是 page.evaluate，
    // 是为了 Yunzai / runtime.render 两条回退路径也吃得到。
    .replace(
      /<html\b([^>]*)>/,
      `<html$1 data-theme="${theme.id}" data-mode="${mode}" data-time="${theme.period || 'day'}"${
        hasBg ? ' data-bg="1"' : ''
      }>`
    )
    .replace(/src="(\.\/)?resources\//g, `src="${resUrl}`)
    // 主题的共享样式用 <link href="resources/themes/<id>/_base.css"> 引入，这条同样要改写
    .replace(/href="(\.\/)?resources\//g, `href="${resUrl}`)
    .replace(/url\((['"]?)(\.\/)?resources\//g, `url($1${resUrl}`)

  // 背景图地址随配置变，没法写进静态主题 CSS —— 渲染时内联一个变量进去
  if (hasBg) {
    absHtml = absHtml.replace(
      /<\/head>/i,
      `<style>:root{--bg-image:url("${bgUrl}")}</style></head>`
    )
  }

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
    // 自定义背景：只有声明了 bg 能力的主题（apple）才接管；取不到就回落主题自带底色。
    // 整段包起来 —— 背景是锦上添花，绝不能因为它让卡片发不出去。
    let bg = null
    if (theme.manifest?.bg === true) {
      try {
        const { resolveBackground } = await import('./background.js')
        bg = await resolveBackground(cfg)
      } catch (err) {
        logWarn(`[qqmusic-plugin] 背景解析异常：${err.message}`)
      }
    }
    const { outFile } = renderHtmlFile(data, card, theme, { bgUrl: bg?.url || '' })
    const vw = viewportWidthOf(theme, card)
    // 格式跟着配置走（默认 jpeg：实测同样一张卡 4.98s/9.75MB → 0.56s/1.44MB）
    const format = imageFormatOf(cfg)
    const buf = await screenshotDirect(outFile, { viewportWidth: vw, pageBg: pageBgOf(theme), format })
    // ⚠️ 扩展名要跟着格式走：把 JPEG 字节写进 `.png` 文件是骗人的（谁打开都会以为文件坏了）
    const shotFile = path.join(yunzaiPath, 'temp', `${theme.id}-${card}.${format === 'png' ? 'png' : 'jpg'}`)
    ensureDir(path.dirname(shotFile))
    fs.writeFileSync(shotFile, buf)
    logInfo(
      `[qqmusic-plugin] ${card} 截图成功 (direct · ${format} · 主题 ${theme.id}${theme.dark ? '·深色' : ''}${
        bg ? `·背景${bg.source === 'file' ? '本地' : `远端/${bg.from}`}` : ''
      }) ${(buf.length / 1024).toFixed(1)}KB`
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
        // ⚠️ 这条是**兜底路**（直连截图抛错时才走），故意保持 PNG：
        //    imgType 由 Yunzai 的渲染层消费，我们没法确认它认 'jpeg'；
        //    为了不让兜底路失败，这里不动它（代价是偶发的兜底卡会大一些，日志里有 warning 可查）
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
  clearGuideCache() // 帮助卡缓存也一起丢（它存的是**图片**，模板改了必须重截）
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

// ──────────── 共用 Chrome 实例 ────────────
/**
 * 为什么复用：原来**每张卡**都 launch + close 一次 Chrome，实测 launch 545~1368ms、
 * close 232~256ms —— 每张卡白烧 0.8~1.6s，而截图本身才 ~600ms。卡片是高频操作
 * （点歌 / 排行 / 新歌 / 歌手 / 歌单 / 帮助 / 状态全是图），这笔开销直接落在「发指令到出图」上。
 *
 * 兜底三件事，保证不会「越复用越脏」：
 *   · 空闲 5 分钟自动关（别让一个 headless Chrome 常驻吃内存）
 *   · 断开（崩了 / 被杀了）→ 清引用，下一次自己重启
 *   · 渲染抛错 → 丢掉这份实例，与「每张卡都是干净浏览器」的老行为一致
 * 退出时用 kill 收尾（`exit` 里不能 await，也没必要优雅关）。
 */
let sharedBrowser = null // Promise<Browser> | null —— 并发 launch 只留一份
let sharedBrowserRef = null // 已就绪的 Browser（空闲关闭 / 退出钩子要同步拿到它）
let sharedIdleTimer = null
const BROWSER_IDLE_MS = 5 * 60 * 1000

/** 解析一次 Chrome 路径就够（原来每张卡都要 fs.existsSync 六遍） */
let cachedExecutablePath
function resolveExecutablePath() {
  if (cachedExecutablePath !== undefined) return cachedExecutablePath
  cachedExecutablePath = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
    .filter(Boolean)
    .find((p) => fs.existsSync(p))
  return cachedExecutablePath
}

/** 关一个实例，吞掉所有失败（关不掉不该盖住真正的截图错误） */
async function closeBrowserQuietly(browser) {
  try {
    await browser?.close?.()
  } catch {
    /* ignore */
  }
}

/** 丢掉当前实例：清引用 + 关掉；下一次调用会自己重启 */
function dropSharedBrowser() {
  const b = sharedBrowserRef
  sharedBrowser = null
  sharedBrowserRef = null
  if (sharedIdleTimer) {
    clearTimeout(sharedIdleTimer)
    sharedIdleTimer = null
  }
  if (b) closeBrowserQuietly(b)
}

/** 用完往后推一次「空闲就关」 */
function scheduleIdleClose() {
  if (sharedIdleTimer) clearTimeout(sharedIdleTimer)
  sharedIdleTimer = setTimeout(() => {
    sharedIdleTimer = null
    dropSharedBrowser()
  }, BROWSER_IDLE_MS)
  sharedIdleTimer.unref?.()
}

/** 拿一个可用浏览器：有活的就复用；没有（或上次 launch 就失败）就新起一个 */
async function acquireBrowser(puppeteer) {
  if (sharedBrowser) {
    let alive = null
    try {
      alive = await sharedBrowser
    } catch {
      alive = null // 上一次 launch 失败了 → 重来
    }
    if (alive?.connected) return alive
    sharedBrowser = null
    sharedBrowserRef = null
  }

  const launching = puppeteer.launch({
    headless: 'new',
    executablePath: resolveExecutablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--enable-font-antialiasing',
      '--hide-scrollbars',
    ],
  })
  sharedBrowser = launching

  let browser
  try {
    browser = await launching
  } catch (err) {
    if (sharedBrowser === launching) sharedBrowser = null
    throw err
  }

  sharedBrowserRef = browser
  browser.once('disconnected', () => {
    if (sharedBrowserRef === browser) {
      sharedBrowser = null
      sharedBrowserRef = null
    }
  })
  // 别让 Chrome 把机器人进程钉住（进程退出时不该等它）
  try {
    browser.process()?.unref?.()
  } catch {
    /* 拿不到进程就算了 */
  }
  return browser
}

process.once('exit', () => {
  try {
    sharedBrowserRef?.process?.()?.kill?.()
  } catch {
    /* 退出路径上别抛 */
  }
})

/** 直连 Chrome 截图（导出给本地预览复用，保证与真机同一套参数） */
// 图片格式的定义在 utils/theme.js（那边是轻量模块，设置卡/锅巴也要读同一份）——
// 这里**转发导出**，免得调用方为了三个常量去记两个地方。
export { DEFAULT_IMAGE_FORMAT, IMAGE_QUALITY, imageFormatOf } from './theme.js'

export async function screenshotDirect(
  htmlFile,
  { viewportWidth = 640, pageBg = '#F2F2F7', format = 'png', quality = IMAGE_QUALITY } = {}
) {
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

  // 注意：不要再叠 --force-device-scale-factor，交给 viewport.deviceScaleFactor
  // 过高 dpr 在部分 Chrome 上会二次缩放导致糊字
  const dpr = 3
  const browser = await acquireBrowser(puppeteer)
  let page = null
  try {
    page = await browser.newPage()
    await page.setViewport({
      width: viewportWidth,
      height: 2200,
      deviceScaleFactor: dpr,
    })
    await page.emulateMediaFeatures?.([
      { name: 'prefers-color-scheme', value: pageBg && isDarkBg(pageBg) ? 'dark' : 'light' },
    ])
    // waitUntil 用 'load'，**别改回 networkidle0**
    // 实测（2026-09-24 本机 Chrome）：同一个卡片页，networkidle0 的 goto 要 ~975ms，
    // 'load' 只要 ~65ms —— networkidle0 必须等满 500ms 静默窗口，file:// 上经常等两轮。
    // 8 张真卡片 A/B 对比：7 张 PNG **字节完全一致**，剩下那张复测 4 次也一致；
    // 单张总耗时 1.67s → 0.69s。
    // 为什么敢用 'load'：页面没有"晚到的资源" —— 44 个模板里一个 <script> 都没有、
    // 也没有远程字体（远程背景图本身算在 load 事件里），而且下面还显式等了
    // document.fonts.ready + 200ms 落定。
    await page.goto(pathToFileURL(htmlFile).href, {
      waitUntil: 'load',
      timeout: 60000,
    })
    const fontProbe = await page.evaluate(async (bg) => {
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
      // 顺手报一下：这台机器实际装了这个主题字体栈里的哪几个（见 logFontProbeOnce）
      try {
        const stack = String(getComputedStyle(document.body).fontFamily || '')
        const families = stack
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
        // ⚠️ 别用 document.fonts.check()：它对系统字体**永远回 true**（假阳性，实测全绿）。
        //    可靠的土办法是"量宽度"：同一个字符串换字体画出来宽度一样，说明前者没生效。
        const measure = (fontFamily) => {
          const ctx = document.createElement('canvas').getContext('2d')
          ctx.font = `400 40px ${fontFamily}`
          return ctx.measureText('中文测试 Ag').width
        }
        const base = measure('monospace')
        const hit = families.filter((f) => {
          if (/^(sans-serif|serif|monospace|system-ui)$/i.test(f)) return false
          try {
            return Math.abs(measure(`"${f}", monospace`) - base) > 0.5
          } catch {
            return false
          }
        })
        return { stack, families, hit }
      } catch {
        return null
      }
    }, pageBg)
    logFontProbeOnce(fontProbe)
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

    // 元素截图：格式跟着配置走（jpeg 默认，见 screenshotDirect 头部的实测数据）
    const type = format === 'png' ? 'png' : 'jpeg'
    const buff = await el.screenshot({
      type,
      ...(type === 'jpeg' ? { quality: Math.min(100, Math.max(60, Number(quality) || IMAGE_QUALITY)) } : {}),
      // 不透明导出，兼容 QQ / ICQQ / NapCat 对透明 PNG 的白底处理
      omitBackground: false,
      captureBeyondViewport: false,
    })
    return Buffer.isBuffer(buff) ? buff : Buffer.from(buff)
  } catch (err) {
    // 渲染出错 → 丢掉这份实例：下次自己重启，与「每张卡都是干净浏览器」的老行为一致
    dropSharedBrowser()
    throw err
  } finally {
    // 复用同一个浏览器时**必须**关页：不关就是每截一张漏一个 page
    //（老代码靠 browser.close() 顺带兜住了这件事）
    try {
      await page?.close?.()
    } catch {
      /* ignore */
    }
    scheduleIdleClose()
  }
}

/** 关掉共用的 Chrome（预览脚本这类「跑完就退」的场景用；机器人运行时不需要调） */
export async function closeDirectBrowser() {
  const b = sharedBrowserRef
  sharedBrowser = null
  sharedBrowserRef = null
  if (sharedIdleTimer) {
    clearTimeout(sharedIdleTimer)
    sharedIdleTimer = null
  }
  await closeBrowserQuietly(b)
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

/**
 * 2.0 帮助卡（解锁后才走这里；未解锁时老帮助卡一个字都不变）
 *
 * 为什么要单独一层缓存：帮助卡的内容**只跟"身份 + 配置"有关** —— 同一群里
 * 十个人连发 `#qqm帮助` 没必要截十次图（直连 puppeteer 一次 1~2s）。
 * 缓存键里带上"会改变卡片内容的配置摘要"，所以锅巴改了开关/平台、或换了主题，
 * 下一次就会重新渲染，**不会发出过期的图**。
 */
const guideCache = new Map() // key → { img, at }
const GUIDE_TTL_MS = 10 * 60 * 1000

/** 缓存键（导出给单测断言"配置变了键就变"） */
export function guideCacheKey(data, themeId = '') {
  const cfg = getCfg()
  return [
    themeId,
    cfg.uiTheme || '',
    String(cfg.uiDark ?? ''),
    cfg.quality || '',
    data?.isMaster ? 'master' : 'user',
    data?.version || '',
    data?.statPlatforms || '',
    data?.statCommands || '',
    data?.statMode || '',
    (data?.sections || []).map((s) => `${s.title}:${(s.items || []).length}`).join('|'),
  ].join('\u0000')
}

export async function renderGuideCard(e, data) {
  const cfg = getCfg()
  const theme = resolveTheme(cfg)
  const key = guideCacheKey(data, theme.id)
  const hit = guideCache.get(key)
  if (hit && Date.now() - hit.at < GUIDE_TTL_MS) return hit.img

  const img = await renderCard(e, data, 'qqmusic-guide')
  if (img) guideCache.set(key, { img, at: Date.now() })
  return img
}

/** 清帮助卡缓存（改主题 / 热重载模板时调用） */
export function clearGuideCache() {
  guideCache.clear()
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

/** 单平台状态卡（`#qqm<平台>状态`） */
export async function renderPlatformCard(e, data) {
  return renderCard(e, data, 'qqmusic-platform')
}

export async function renderSettingsCard(e, data) {
  return renderCard(e, data, 'qqmusic-settings')
}

/** 平台登录状态卡（`#qqm平台状态`） */
export async function renderPlatformsCard(e, data) {
  return renderCard(e, data, 'qqmusic-platforms')
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
