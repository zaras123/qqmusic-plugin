/**
 * 扫码登录
 */

import fs from 'node:fs'
import path from 'node:path'

import { loadPluginBase } from '../utils/plugin-base.js'

// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase()

import Config from '../components/Config.js'
import { request, pullLoginMeta, refreshLogin, loginRenewHint } from '../utils/api.js'
import { getTempDir } from '../utils/send.js'
import { buildQQMusicStatusData } from '../utils/status-card.js'
import { renderStatusCard, formatStatusText } from '../utils/render.js'
import {
  platformAliasPattern,
  platformOf,
  platformAuthOf,
  platformCookieHelp,
  platformCookieOf,
  platformCookieValueHint,
  platformQrOf,
} from '../utils/platforms.js'
// 命令解析放 utils（见 utils/command.js 顶部注释：apps 里多导出函数会让加载器认错插件类）
import { RE_PLATFORM_CK, RE_PLATFORM_CK_CLEAR, parsePlatformCkCmd, parsePlatformCkClearCmd } from '../utils/command.js'
import { isV2Unlocked, platformEnabled } from '../utils/v2.js'
import { setSafeTimeout } from '../utils/async.js'

/** 进行中的扫码任务 user_id -> { qrcodeID, timer, e, stopped } */
const activeLogins = new Map()

/**
 * 2.0：可由插件发起**扫码登录**的外部平台（API 侧统一了形状，见下面两个字段）
 *
 *   · `start` → 取二维码：`data.{key, img, tip}`（img 是 data URL，直接当图片发）
 *   · `poll`  → 轮询：`data.{status, tip}`，status ∈ waiting | confirm | success | expired
 *
 * ⚠️ 两家的路径**故意不叫** `/x/login/status`：vendor 自己也有 `login_status` 模块，
 *    而 vendor 路由是先挂的，会把同名路径静默吞掉（实测踩过）。
 * 汽水的流程与它们不同（token + 自家 status 字段），单独判一次。
 *
 * ⚠️ 这张表只放**路径**（API 侧的事实）。"这家能不能扫码""用哪个 App 扫"是**平台**的事实，
 *    一律读 `utils/platforms.js` 的 `auth.qr` —— 以前这里手抄了一份 `label/app`，
 *    加了平台忘了同步就会对不上（kugou 就这么漏过一次）。
 *    键必须与 `qrPlatforms()` 一致（test.mjs 有断言钉着）。
 */
const QR_PLATFORMS = {
  netease: { start: '/netease/login/qrcode', poll: (k) => `/netease/login/qrcode/check?key=${encodeURIComponent(k)}` },
  kugou: { start: '/kugou/login/qrcode', poll: (k) => `/kugou/login/qrcode/check?key=${encodeURIComponent(k)}` },
  qishui: { start: '/qishui/login/qrcode', poll: (k) => `/qishui/login/status?token=${encodeURIComponent(k)}`, qishui: true },
  // B站：上游只给二维码**内容**，图由 API 侧用 qrcode 生成后当 data URL 回（三个字段形状一致）
  bilibili: { start: '/bilibili/login/qrcode', poll: (k) => `/bilibili/login/qrcode/check?key=${encodeURIComponent(k)}` },
}

/**
 * 扫码登录的轮询节奏
 *
 * 默认 3s 一次；**节奏以 API 回的 `retryAfterMs` 为准**（上限 20s、下限 2s）——
 * 汽水那种"上游会限流"的平台需要放慢，节奏写在 API 里才能一处改、处处生效。
 *
 * ⚠️ 用**总时长**而不是"固定次数"当上限（2026-09-25 改）：限流退避会把单次间隔拉到
 *    十几秒，按"40 次"算就等于把有效期拖到 10 分钟以后 —— 二维码早过期了。
 */
const QR_POLL_MS = 3000
const QR_TOTAL_MS = 150000 // ≈2.5 分钟，与二维码有效期同量级
const QR_MAX_TRIES = 60 // 兜底：退避到很大间隔时也不会无限轮
const QR_POLL_MIN_MS = 2000
const QR_POLL_MAX_MS = 20000

/** 退避上限：把不可信的值夹在合理区间里（API 说 30s 也别真睡 30s） */
function clampPollMs(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return QR_POLL_MS
  return Math.min(QR_POLL_MAX_MS, Math.max(QR_POLL_MIN_MS, Math.round(n)))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function saveQrImage(base64) {
  const dir = getTempDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `qr_${Date.now()}.png`)
  const buf = Buffer.from(base64, 'base64')
  fs.writeFileSync(file, buf)
  return file
}

async function sendImage(e, fileOrUrl) {
  try {
    // 保证 TRSS / ICQQ / QQBot 都有 segment
    try {
      const { ensureSegment } = await import('../utils/adapter.js')
      await ensureSegment()
    } catch {
      /* ignore */
    }

    let file = fileOrUrl
    const isRemote =
      typeof file === 'string' &&
      (file.startsWith('http') || file.startsWith('base64'))
    if (!isRemote && typeof file === 'string' && fs.existsSync(file)) {
      file = path.resolve(file)
    }

    if (global.segment?.image) {
      await e.reply(segment.image(file))
      return true
    }
    await e.reply({
      type: 'image',
      file: isRemote
        ? fileOrUrl
        : `file:///${String(file).replace(/\\/g, '/')}`,
    })
    return true
  } catch (err) {
    logger?.warn?.(`[qqmusic-plugin] 发图失败: ${err.message}`)
    // OneBot 兜底 base64
    try {
      if (
        typeof fileOrUrl === 'string' &&
        !fileOrUrl.startsWith('http') &&
        fs.existsSync(fileOrUrl)
      ) {
        const b64 = fs.readFileSync(fileOrUrl).toString('base64')
        if (global.segment?.image) {
          await e.reply(segment.image(`base64://${b64}`))
          return true
        }
        await e.reply({ type: 'image', file: `base64://${b64}` })
        return true
      }
    } catch (err2) {
      logger?.warn?.(`[qqmusic-plugin] 发图 base64 失败: ${err2.message}`)
    }
    return false
  }
}

/** 登录成功后：只记录元信息 */
/**
 * 写「登录态」到插件配置 —— 全插件唯一一份口径
 *
 * 原本这段在 4 个地方各写了一遍（登录成功 / 登出 / 从 API 同步 / 手动刷新 key），
 * 字段一样、回落却各写各的，加字段要改四处。收在这里之后：
 *   · 普通写入：逐项**回落到旧值**（这次没拿到新值，就别把旧值擦掉）
 *   · `reset: true`（登出）：全清，cookie 一起清
 * `lastLoginUserKey` 是 API 侧的登录会话键（= 发起登录的机器人用户），不是 uin。
 *
 * @param {{uin?: string, userKey?: string, nick?: string, hasRefresh?: boolean,
 *          reset?: boolean, clearCookie?: boolean}} patch
 */
function writeLoginState(patch = {}) {
  const cfg = Config.getConfig('qqmusic') || {}
  const reset = patch.reset === true
  const next = {
    ...cfg,
    lastLoginUin: reset ? '' : String(patch.uin || cfg.lastLoginUin || ''),
    lastLoginUserKey: reset ? '' : String(patch.userKey || cfg.lastLoginUserKey || ''),
    lastLoginNick: reset ? '' : String(patch.nick || cfg.lastLoginNick || ''),
    lastLoginAt: reset ? 0 : Date.now(),
    lastHasRefresh: reset ? false : Boolean(patch.hasRefresh),
  }
  if (reset || patch.clearCookie === true) next.cookie = ''
  Config.setConfig('qqmusic', next)
  return next
}

async function onLoginSuccess(e, info = {}) {
  const uin = info.uin || ''
  const nick = info.nick || ''
  const hasKey = info.hasKey ?? true
  const channel = info.channel || ''
  const userKey = String(e.user_id || '')

  let meta = null
  try {
    meta = await pullLoginMeta(userKey)
  } catch (err) {
    logger?.warn?.(`[qqmusic-plugin] 拉取登录态元信息失败: ${err.message}`)
  }

  try {
    writeLoginState({
      clearCookie: true,
      uin: meta?.uin || uin || '',
      // 登录会话在 API 侧按发起登录的机器人用户（userKey）存，备注 uin 仅兜底展示
      userKey: e.user_id || '',
      nick: meta?.nick || nick || '',
      hasRefresh: meta?.hasRefresh,
    })
  } catch (err) {
    logger?.warn?.(`[qqmusic-plugin] 写登录配置失败: ${err.message}`)
  }

  await e.reply(
    [
      '✅ 登录成功',
      uin ? `uin: ${uin}` : '',
      nick ? `昵称: ${nick}` : '',
      hasKey === false ? '⚠️ 未拿到 key，付费曲可能仍无法播放' : '',
      // 续期提示以登录时**实测**结果为准（微信 PC 流程有 refresh_key 也续不了，见 loginRenewHint）
      loginRenewHint(meta || {}),
      // 微信走「PC 流程」，但换码形状已由 API 侧改成 App 形状优先、PC 形状兜底：
      // 实测 PC 形状换到的是网页级凭证（无 refresh_key、付费曲拿不到 purl），
      // 故这里不再说「多为账号本身无会员」——那会把人往错方向带
      channel === 'webqr-pc'
        ? '通道：微信扫码（PC 流程；已优先用 App 级凭证换码，失败才回落 PC 网页形状）'
        : channel === 'webqr-wx'
          ? '提示：网页级会话，付费曲可能拿不到播放链'
          : '',
      '正在生成状态卡片…',
    ]
      .filter(Boolean)
      .join('\n')
  )

  await sleep(400)
  try {
    const data = await buildQQMusicStatusData(userKey)
    const img = await renderStatusCard(e, data)
    if (img) {
      await e.reply(img)
      return
    }
    await e.reply(formatStatusText(data))
  } catch (err) {
    logger?.warn?.(`[qqmusic-plugin] 登录后状态卡失败: ${err.message}`)
    await e.reply('登录已成功，但状态卡渲染失败，可手动发送 #qqm状态')
  }
}

/**
 * 判定登录成功
 */
function pickLoginSuccess(body) {
  const data = body?.data || body || {}
  const uin = data.uin || ''
  const hasKey = Boolean(data.hasKey ?? data.qm_keyst)
  const nick = data.nick || ''
  const channel = data.channel || ''

  if (data.status === 'success' && (uin || hasKey)) {
    return { ok: true, ...data, uin, nick, hasKey, channel: channel || 'mqtt' }
  }
  if (uin && hasKey === true) {
    return { ok: true, ...data, uin, nick, hasKey: true, channel }
  }
  if (data.login === true && uin && hasKey) {
    return { ok: true, ...data, uin, nick, hasKey: true, channel: channel || 'status' }
  }
  return null
}

export class qqmusicLogin extends (await loadPluginBase()) {
  constructor() {
    super({
      name: 'QQ音乐-扫码登录',
      dsc: '扫码登录 QQ 音乐',
      event: 'message',
      priority: 450,
      rule: [
        {
          /**
           * 2.0：外部平台扫码登录 `#qqm网易登录` / `#qqm酷狗登录` / `#qqm汽水登录`
           *
           * 限主人（与上面三条 QQ 登录一致）：扫码是**账号级**操作，扫完全站音源就换成那个号。
           * 成员想用自己的账号 → 私聊发粘贴命令（`#qqm<平台>ck <cookie>`，见下面那条规则）。
           * 未解锁（？？？关着）时 handler 直接 return false —— 1.9 里没有这些命令。
           */
          // 传 RegExp 对象（不是字符串）：Yunzai 会 new RegExp(字符串)，那样 `i` 标志会丢
          reg: new RegExp(`^#?(?:qq|QQ)m\\s*(?:${platformAliasPattern()})\\s*(?:登录|登陆)$`, 'i'),
          fnc: 'platformQrLogin',
          permission: 'master',
        },
        {
          /**
           * 2.0：**粘贴 cookie**（扫码之外唯一的凭据通道）
           *
           *   `#qqm网易ck MUSIC_U=xxx; __csrf=yyy`   / `#qqm酷我ck Hm_Iuvt_xxx=yyy`
           *   `#qqmappleck <Netscape cookies 全文>`
           *
           * 为什么必须有：酷我 / Apple **没有扫码通道**，汽水的扫码会被上游风控掐掉 ——
           * 以前这三种情况只能让用户自己去 `curl POST /<平台>/cookies`（群里没人干得了）。
           *
           * ⚠️ 不标 permission: master —— 群里贴 cookie = 把账号凭据发到群里，所以 handler
           *    一律拒绝群聊、只允许私聊；私聊里任何人都可以配**自己那份**（API 按 userKey 存，
           *    一人一号，互不覆盖）。主人要替别人配就让他自己私聊，或直接调 API。
           */
          reg: RE_PLATFORM_CK,
          fnc: 'platformSetCookie',
        },
        {
          // 清掉**自己那份**凭据（共享那份不动）：`#qqm网易清ck`
          reg: RE_PLATFORM_CK_CLEAR,
          fnc: 'platformClearCookie',
        },
        {
          // 微信：走「QQ音乐 App 扫码」（MQTT 通道，与 #qqm登录app 同一条）
          //
          // 2026-09-16 改动：原来走 /login/webqr 的 PC 网页流程。换掉的原因不是形状问题
          // （那条路已穷举 6 种换码 × 22 种续期，全部拿不到播权），而是**App 通道送来的是
          // 整套 cookie** —— 里面可能带浏览器通道根本拿不到的「播放票据」（psrf_*）和 wid，
          // 而这两样正是客户端能播、我们不能播的已知缺口。
          // 用户在 QQ音乐 App 内用它自己的微信账号登录后扫这张码即可。
          //
          // ⚠️ webqr 那条路**没有删**，仍由下面的 #qqm登录 使用；要回退只需把 fnc 改回
          // startWebQrLogin（并在消息里带「微信」二字触发 PC 形状）。
          reg: '^#?(qq|QQ)m(登录|登陆)(微信|wx)$|^#?(qq|QQ)音乐(登录|登陆)(微信|wx)$',
          fnc: 'startQrLogin',
          permission: 'master',
        },
        {
          // 统一登录命令：#qqm登录（网页扫码，一张 QQ 码）
          reg: '^#?(qq|QQ)m(登录|登陆)$|^#?(qq|QQ)音乐(登录|登陆)$',
          fnc: 'startWebQrLogin',
          permission: 'master',
        },
        {
          // QQ音乐 App 扫码（MQTT 通道）：App 内授权，凭证等级最高
          reg: '^#?(qq|QQ)m登录(qq|app)$',
          fnc: 'startQrLogin',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m(登录|登陆)?状态$|^#?(qq|QQ)音乐状态$|^#?(qq|QQ)状态$|^#?(qms|QMS)$',
          fnc: 'loginStatus',
        },
        {
          reg: '^#?(qq|QQ)m(登出|注销|解绑)$|^#?(qq|QQ)音乐(登出|解绑)$',
          fnc: 'logout',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m(同步|拉取|sync)(登录态)?$',
          fnc: 'syncFromApi',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m(刷新|续期|refresh)(登录|key)?$',
          fnc: 'refreshKey',
          permission: 'master',
        },
        {
          reg: '^#?(qq|QQ)m(绑定|导入)\\s*(.+)$',
          fnc: 'bindManual',
          permission: 'master',
        },
        {
          reg: 'qqmusic://',
          fnc: 'importDeepLink',
          permission: 'master',
        },
      ],
    })
  }

  /**
   * 2.0：外部平台扫码登录（网易云 / 酷狗 / 汽水）
   *
   * 流程三段，与 QQ 的扫码完全同构，只是上游换成 API 的 `/x/login/qrcode`：
   *   ① 取码 → 直接把 data URL 当图片发出去（三家上游都直接给图片，不用本地生成）
   *   ② 轮询 → 只看**状态变化**才回话（待扫 → 已扫码待确认 → 成功/过期），不刷屏
   *   ③ 成功 → 凭据由 **API 侧**写进存储（发命令那个人的槽位；扫码只限主人），这里只回执
   *      想让**全站**都用这一份 → 开「一律走主人账号」（① 基础设置）：之后所有请求都按
   *      主人槽位取凭据（回执里的 scope 说明由 API 给，插件不自己编）
   *
   * 未解锁时静默放行（return false）：这些命令在 1.9 里不存在。
   * 权限在 rule 上标了 master（扫码 = 账号级操作，扫完全站音源就换成那个号）。
   */
  async platformQrLogin(e) {
    // ⚠️ login.js 里**没有** cfg() 方法（song.js 才有）——统一走 Config.getConfig
    const cfg = Config.getConfig('qqmusic') || {}
    if (!cfg.enable) return false
    if (!isV2Unlocked(cfg)) return false

    const msg = String(e.msg || '').trim()
    const m = msg.match(new RegExp(`^#?(?:qq|QQ)m\\s*(?:(${platformAliasPattern()}))\\s*(?:登录|登陆)$`, 'i'))
    const p = platformOf(m?.[1])
    if (!p) return false
    // "能不能扫码"从注册表读（QR_PLATFORMS 只放 API 那边的路径）：
    // 加平台却忘了同步这里，症状就是"命令没反应/说没这条通道"
    const qr = platformQrOf(p.id)
    const spec = QR_PLATFORMS[p.id]
    if (!qr || !spec) {
      const ck = platformCookieOf(p.id)
      await e.reply(
        [
          `${p.label} 没有扫码通道：${ck ? '它只能粘贴凭据' : platformAuthOf(p.id).note || '它不需要账号（匿名音源）'}`,
          ck ? `粘贴入口（私聊我）：${ck.command} ${platformCookieValueHint(p.id)}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return true
    }
    if (!platformEnabled(cfg, p.id)) {
      await e.reply(`${p.label} 音源已被关闭（锅巴 → 音源平台）`)
      return true
    }

    const userKey = String(e.user_id || '')
    this.stopPoll(userKey) // 同一人重复发命令：先掐掉上一轮
    const task = { stopped: false, timer: null }
    activeLogins.set(userKey, task)

    let data
    let body = null
    try {
      body = await request(spec.start, {}, 'get', userKey)
      data = body?.data || body
    } catch (err) {
      activeLogins.delete(userKey)
      await e.reply(`获取${p.label}二维码失败：${err.message}`)
      return true
    }
    const key = String(data?.key || data?.token || '')
    const img = String(data?.img || data?.qrcode || '')
    if (!key || !img) {
      activeLogins.delete(userKey)
      await e.reply(`获取${p.label}二维码失败：${body?.errMsg || '上游没返回二维码'}`)
      return true
    }

    // ① 发二维码（data URL 直接转图片；统一走 adapter，免得某个协议端不认 base64）
    try {
      const base64 = img.replace(/^data:image\/\w+;base64,/, '')
      const file = await saveQrImage(base64)
      const sent = await sendImage(e, file)
      if (!sent) await e.reply(`请打开二维码链接扫码：${data?.scanUrl || '(图片发送失败)'}`)
    } catch (err) {
      await e.reply(`二维码发送失败：${err.message}`)
    }
    // 粘贴入口（不是每家都有）：扫码被上游挡住时的第二条路，与"登录"命令共用注册表
    const ck = platformCookieOf(p.id)
    await e.reply(
      [
        `请用「${qr.app}」扫码登录 ${p.label}（${Math.round(QR_TOTAL_MS / 60000)} 分钟内有效）`,
        spec.qishui ? '扫完在手机上确认（汽水上游会限流，机器人会自动放慢轮询，别急）' : '扫完在手机上点一次确认',
        ck ? `扫码被上游挡住时：私聊发 ${ck.command} ${platformCookieValueHint(p.id)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )

    // ② 轮询（只在状态变化时回话）
    let last = ''
    // 节奏以 API 回的 retryAfterMs 为准（限流退避时会变大）；总时长封顶，到点就停
    let waitMs = QR_POLL_MS
    const deadline = Date.now() + QR_TOTAL_MS
    // 限流只提醒一次（每一轮都刷屏才是最烦的）
    let rateWarned = false
    // ⚠️ 循环变量别用 `i`：本文件其它 handler 也裸用 i（作用域检查会把它当跨函数引用），
    //    用一个专属名字就互不干扰
    for (let tick = 0; tick < QR_MAX_TRIES && Date.now() < deadline; tick += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(waitMs)
      if (task.stopped) return true
      let st = ''
      let tip = ''
      let errMsg = ''
      // 凭据落到哪（API 自己算：主人 = 共享那份、别人 = 自己那份），回执里照抄它的话，
      // 别在插件里再猜一遍 —— 猜错的表现是"说全站可用，其实只有自己能用"
      let scopeText = ''
      try {
        // eslint-disable-next-line no-await-in-loop
        const body = await request(spec.poll(key), {}, 'get', userKey)
        const d = body?.data || body || {}
        st = String(d.status || '')
        tip = String(d.tip || d.message || '')
        scopeText = String(d.scopeText || '')
        // 上游限流：API 已经替我们退避了，这里只把节奏跟上 + 提醒一次
        waitMs = clampPollMs(d.retryAfterMs)
        if (d.rateLimited === true && !rateWarned) {
          rateWarned = true
          // eslint-disable-next-line no-await-in-loop
          await e.reply(`${p.label} 上游限流（访问太频繁），已自动放慢轮询；请尽快在手机上点「确认」`)
        }
        if (spec.qishui) {
          // 汽水的状态词不同：new/waiting → 待扫；scanned/confirmed → 待确认；success → 成功
          if (d.loggedIn === true || st === 'success') st = 'success'
          else if (d.needVerify === true || st === 'verify_required') st = 'verify'
          else if (d.scanned === true || st === 'confirmed') st = 'confirm'
          else st = 'waiting'
        }
      } catch (err) {
        errMsg = err.message
      }
      if (errMsg) {
        activeLogins.delete(userKey)
        await e.reply(`查询${p.label}扫码状态失败：${errMsg}`)
        return true
      }
      if (st === 'success') {
        activeLogins.delete(userKey)
        await e.reply(
          [
            `✅ ${p.label} 登录成功${scopeText ? `：凭据已写入${scopeText}` : ''}`,
            `换号：再发一次 ${qr.command}${ck ? `；清掉自己那份：${ck.clearCommand}` : ''}`,
            e.isMaster ? '想让全站都用这一份：开「一律走主人账号」（锅巴 ① 基础设置）' : '',
          ].join('\n')
        )
        return true
      }
      if (st === 'verify') {
        activeLogins.delete(userKey)
        await e.reply(
          [
            `${p.label} 提示需要安全验证，扫码这条路走不通`,
            ck ? `改用粘贴（私聊我）：${ck.command} ${platformCookieValueHint(p.id)}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        )
        return true
      }
      if (st === 'expired') {
        activeLogins.delete(userKey)
        await e.reply(`${p.label} 二维码已过期，重新发一次 ${qr.command}`)
        return true
      }
      if (st && st !== last) {
        last = st
        if (st === 'confirm') await e.reply(`已扫码，请在手机上点「确认登录」（${p.label}）`)
      }
    }
    activeLogins.delete(userKey)
    await e.reply(
      [
        `${p.label} 扫码超时（没等到确认），重新发一次 ${qr.command}`,
        rateWarned ? '（期间被上游限流过：确认那一步可能被挡掉了，重发一次通常就好）' : '',
        ck ? `也可以直接粘贴凭据（私聊我）：${ck.command} ${platformCookieValueHint(p.id)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    return true
  }

  /**
   * 2.0：**粘贴凭据**（`#qqm网易ck <cookie>` / `#qqm酷我ck …` / `#qqmappleck <Netscape 全文>`）
   *
   * 为什么必须有这条通道：**不是每家都能扫码**（酷我 / Apple 只有这一条路），
   * 汽水的扫码还会被上游风控（error_code 2046）掐掉。以前这些情况只能让用户自己去
   * `curl -X POST /<平台>/cookies` —— 群里没人干得了，等于"这家的账号态配不了"。
   *
   * 凭据是**一人一份**（API 按 userKey 存：发命令的 QQ 号），所以：
   *   · 一律拒收群聊 —— 群里贴 cookie 等于把账号交给全群（还会留在群消息历史里）
   *   · 私聊里人人可配**自己那份**，互不覆盖；回执里**绝不复述 cookie 内容**
   *
   * 未解锁（？？？关着）时静默放行：1.9 里没有这条命令。
   */
  async platformSetCookie(e) {
    const cfg = Config.getConfig('qqmusic') || {}
    if (!cfg.enable) return false
    if (!isV2Unlocked(cfg)) return false

    // 解析与规则共用 utils/command.js 的同一条正则（两处各写一份必分手）
    const { plat, cookie } = parsePlatformCkCmd(e.msg)
    const p = platformOf(plat)
    if (!p) return false

    const ck = platformCookieOf(p.id)
    if (!ck) {
      // 这家本来就不收凭据（匿名音源）：说清"为什么不用配"，别让用户以为命令坏了
      const alt = platformQrOf(p.id)
      await e.reply(
        [
          `${p.label} 不需要凭据：${platformAuthOf(p.id).note || '它是匿名音源'}`,
          alt ? `要配账号请扫码：${alt.command}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return true
    }

    // 群聊一律拒收（凭据 = 账号）。`e.isGroup` / `e.group_id` 两种都判：
    // 不同协议端给的字段不一样，漏判一个就等于没拦
    const want = platformCookieValueHint(p.id)
    if (e.isGroup || e.group_id) {
      await e.reply(`别在群里发凭据（那等于把账号借给全群用）—— 请**私聊**我发：${ck.command} ${want}`)
      return true
    }
    if (!cookie) {
      await e.reply([`用法：${ck.command} ${want}`, platformCookieHelp(p.id)].join('\n'))
      return true
    }

    try {
      // 路径 / 字段名都从注册表来（Apple 的字段叫 cookies、别家叫 cookie）
      const body = await request(ck.post, { [ck.field]: cookie }, 'post', String(e.user_id || ''))
      const d = body?.data || body || {}
      await e.reply(
        [
          `✅ ${p.label} 凭据已保存（你自己那份，只对你自己生效）`,
          d.note ? String(d.note) : '',
          e.isMaster ? '想让全站都用这一份：开「一律走主人账号」（锅巴 ① 基础设置）' : '',
          `换号：再发一次 ${ck.command}；清掉：${ck.clearCommand}`,
        ]
          .filter(Boolean)
          .join('\n')
      )
    } catch (err) {
      await e.reply(
        [
          `保存 ${p.label} 凭据失败：${err.message}`,
          // API 的 tip/howto 是**照着做就行**的步骤（比如 Apple 那条"先起 sidecar 再填 APPLE_DL_URL"）——
          // 只显示 errMsg 的话用户不知道该去哪儿改（2026-09-25 实撞）
          err.tip ? String(err.tip) : '',
          ...(Array.isArray(err.howto) ? err.howto.map((x) => String(x)) : []),
          ck.file ? `（这家要的是 ${ck.keys} 的值，或**整份 Netscape cookies 文件全文**）` : '',
          platformCookieHelp(p.id),
        ]
          .filter(Boolean)
          .join('\n')
      )
    }
    return true
  }

  /** 2.0：清掉**自己那份**凭据（`#qqm网易清ck`）—— 共享那份与别人的都不动 */
  async platformClearCookie(e) {
    const cfg = Config.getConfig('qqmusic') || {}
    if (!cfg.enable) return false
    if (!isV2Unlocked(cfg)) return false

    const { plat } = parsePlatformCkClearCmd(e.msg)
    const p = platformOf(plat)
    if (!p) return false

    const ck = platformCookieOf(p.id)
    if (!ck) {
      await e.reply(`${p.label} 没有可清的凭据：${platformAuthOf(p.id).note || '它不需要账号（匿名音源）'}`)
      return true
    }
    if (e.isGroup || e.group_id) {
      await e.reply(`凭据按人存，清也是在私聊里清 —— 请私聊我发：${ck.clearCommand}`)
      return true
    }

    try {
      const body = await request(ck.clear.path, {}, ck.clear.method, String(e.user_id || ''))
      const d = body?.data || body || {}
      await e.reply(
        [
          `✅ 已清掉你自己那份 ${p.label} 凭据`,
          d.note ? String(d.note) : '（共享那份与别人的都不受影响）',
        ].join('\n')
      )
    } catch (err) {
      await e.reply(`清除 ${p.label} 凭据失败：${err.message}`)
    }
    return true
  }

  async startQrLogin(e) {
    const cfg = Config.getConfig('qqmusic')
    if (!cfg.enable) return false
    if (cfg.qrLoginEnable === false) {
      await e.reply('扫码登录已在配置中关闭（锅巴：允许扫码登录命令）')
      return true
    }

    this.stopPoll(e.user_id)
    const userKey = String(e.user_id || '')

    try {
      await e.reply('正在获取 QQ 音乐登录二维码…')
      const body = await request('/login/qr', {}, 'get', userKey)
      const data = body?.data || body
      if (!data?.qrcodeID) {
        await e.reply(`获取二维码失败：${body?.errMsg || '未知错误'}`)
        return true
      }

      const { qrcodeID, qrcodeBase64, qrcode, expiresIn, tips, channel } = data
      let imgSent = false

      if (qrcodeBase64) {
        const file = await saveQrImage(qrcodeBase64)
        imgSent = await sendImage(e, file)
        if (!imgSent && global.segment?.image) {
          try {
            await e.reply(segment.image(`base64://${qrcodeBase64}`))
            imgSent = true
          } catch {}
        }
        setTimeout(() => {
          try {
            fs.unlinkSync(file)
          } catch {}
        }, 120_000)
      } else if (qrcode?.startsWith('data:')) {
        const b64 = qrcode.split(',')[1]
        const file = await saveQrImage(b64)
        imgSent = await sendImage(e, file)
      }

      // 本流程的提示文案由 API /login/qr 给出（「请用 QQ音乐 App 扫码…」）
      await e.reply(
        [
          tips || '请使用 QQ音乐 App 扫码',
          `二维码 ${Math.round((expiresIn || 900) / 60)} 分钟内有效`,
          imgSent ? '' : '（图片发送失败可重新发命令）',
        ]
          .filter(Boolean)
          .join('\n')
      )

      this.startPoll(e, qrcodeID, Number(expiresIn || 900))
    } catch (err) {
      await e.reply(`扫码登录失败：${err.message}`)
    }
    return true
  }

  startPoll(e, qrcodeID, expiresIn) {
    const userId = e.user_id
    const userKey = String(userId || '')
    const started = Date.now()
    const maxMs = Math.min(expiresIn, 900) * 1000
    let notifiedScan = false
    let failStreak = 0
    let completeTried = 0

    const task = {
      qrcodeID,
      stopped: false,
      busy: false,
      completeTried: false,
      statusBaseline: null,
    }
    activeLogins.set(userId, task)

    // 记录扫码前登录态基线
    request('/login/status', {}, 'get', userKey)
      .then((st) => {
        task.statusBaseline = {
          uin: String(st?.data?.uin || ''),
          hasKey: Boolean(st?.data?.hasKey),
          login: Boolean(st?.data?.login),
        }
      })
      .catch(() => {
        task.statusBaseline = { uin: '', hasKey: false, login: false }
      })

    const finishOk = async (info) => {
      if (task.stopped) return
      task.stopped = true
      if (task.timer) clearTimeout(task.timer)
      activeLogins.delete(userId)
      await onLoginSuccess(e, info)
    }

    const tick = async () => {
      if (task.stopped) return
      if (task.busy) {
        task.timer = setSafeTimeout(tick, 800, '扫码轮询')
        return
      }
      if (Date.now() - started > maxMs) {
        task.stopped = true
        activeLogins.delete(userId)
        await e.reply('二维码已过期，请重新 #qqm登录；微信登录请用 #qqm登录微信')
        return
      }

      const elapsed = Date.now() - started
      task.busy = true
      try {
        const body = await request('/login/qr/check', {
          qrcodeID,
          elapsed,
          isFirstScan: !notifiedScan,
          completeTried: completeTried > 0,
        }, 'get', userKey)
        const data = body?.data || {}
        const status = data.status || 'wait'
        failStreak = 0

        // 首次检测到已扫码
        if ((status === 'scanned' || status === 'confirmed') && !notifiedScan) {
          notifiedScan = true
        }

        // 展示 API 返回的用户消息
        if (data.userMessage) {
          await e.reply(data.userMessage)
        }

        // 登录成功
        const okInfo = pickLoginSuccess(body)
        if (okInfo?.ok && okInfo.hasKey) {
          await finishOk(okInfo)
          return
        }

        // 终态
        if (status === 'expired' || status === 'cancel' || status === 'loginFailed') {
          task.stopped = true
          activeLogins.delete(userId)
          return
        }

        // 尝试 complete（10 秒后开始，最多 2 次）
        if ((status === 'scanned' || status === 'confirmed') && completeTried < 2 && elapsed > 10000) {
          completeTried++
          try {
            const done = await request('/login/qr/complete', { qrcodeID }, 'post', userKey)
            const info = pickLoginSuccess(done)
            if (info?.ok && info.hasKey) {
              await finishOk(info)
              return
            }
          } catch {}
        }

        // 用登录态基线兜底检测
        if (notifiedScan && elapsed > 12000 && task.statusBaseline) {
          try {
            const st = await request('/login/status', {}, 'get', userKey)
            const d = st?.data || {}
            const base = task.statusBaseline
            const changed =
              d.login &&
              d.uin &&
              d.hasKey &&
              (!base.login || !base.hasKey || String(d.uin) !== String(base.uin || ''))
            if (changed) {
              await finishOk({ uin: d.uin, nick: d.nick, hasKey: d.hasKey, channel: 'status-poll' })
              return
            }
          } catch {}
        }
      } catch (err) {
        failStreak += 1
        if (failStreak === 5) await e.reply(`轮询暂时失败：${err.message}（继续重试）`)
        if (failStreak >= 25) {
          task.stopped = true
          activeLogins.delete(userId)
          await e.reply('轮询失败过多，请检查 API 或自行获取ck')
          return
        }
      } finally {
        task.busy = false
      }

      if (!task.stopped && activeLogins.get(userId)?.qrcodeID === qrcodeID) {
        task.timer = setSafeTimeout(tick, 2500, '扫码轮询')
      }
    }

    task.timer = setSafeTimeout(tick, 2000, '扫码轮询')
  }

  stopPoll(userId) {
    const t = activeLogins.get(userId)
    if (t) {
      t.stopped = true
      if (t.timer) clearTimeout(t.timer)
      activeLogins.delete(userId)
    }
  }

  /**
   * 浏览器无感扫码（**现在只剩 `#qqm登录`**）
   *
   * 2026-09-16：`#qqm登录微信` 已改走 `startQrLogin`（QQ音乐 App 扫码），
   * 因为浏览器换码通道拿不到「播放票据」（psrf_*）与 wid，播放链恒 104003。
   * 本方法保留作为回退路径：把上面那条规则的 fnc 改回 startWebQrLogin 即可，
   * 消息里带「微信」二字仍会触发下面的 PC 形状分支（wantWxMsg）。
   */

  async startWebQrLogin(e) {
    const cfg = Config.getConfig('qqmusic')
    if (!cfg.enable) return false
    if (cfg.qrLoginEnable === false) {
      await e.reply('扫码登录已在配置中关闭（锅巴：允许扫码登录命令）')
      return true
    }

    this.stopPoll(e.user_id)
    const userKey = String(e.user_id || '')

    try {
      // 微信登录走「PC 流程」（mode=pc）：与网页端同一个 appid，只是换码参数形状不同。
      // ⚠️ 注意：PC 形状换到的凭证**不能播付费曲**（实测无 refresh_key、连 128 都拿不到 purl），
      // API 侧已改成「App 形状优先、PC 形状兜底」，mode=pc 现在只表示"允许 PC 形状兜底"
      const wantWxMsg = /微信|wx/i.test(String(e.msg || ''))
      // 微信走 PC 网页流程：微信绑定的账号在 QQ音乐 App 里没有扫码登录入口，只能走这条。
      // 该通道换到的是「网页级」凭证（key 约 3 天；续期已在 API 侧改走签名 PC 通道重试）。
      await e.reply(wantWxMsg ? '正在生成登录二维码（微信扫一扫）…' : '正在生成登录二维码…')
      const body = await request(
        '/login/webqr',
        wantWxMsg ? { mode: 'pc' } : {},
        'post',
        userKey
      )
      const data = body?.data || body
      if (!data?.sessionId || (!data?.qrcodeWx && !data?.qrcodeQq)) {
        await e.reply(`获取二维码失败：${body?.errMsg || '未知错误'}`)
        return true
      }

      const { sessionId, qrcodeWx, qrcodeQq, expiresIn } = data
      // 平台取巧：机器人跑在 QQ 平台，命令发起者必是 QQ 用户 → 只发 QQ 码
      // （QQ 用户扫 QQ 码 = 登录自己的 QQ 音乐账号，同时覆盖 QQ音乐 App 用户）
      // 微信场景极少，用 #qqm登录微信 显式请求微信码
      const wantWx = wantWxMsg
      let codes = []
      if (wantWx && qrcodeWx) codes = [['微信', qrcodeWx]]
      else if (qrcodeQq) codes = [['QQ', qrcodeQq]]
      else if (qrcodeWx) codes = [['微信', qrcodeWx]]
      else codes = [
        ['QQ', qrcodeQq],
        ['微信', qrcodeWx],
      ].filter(([, c]) => c && c.startsWith('data:'))

      let imgSent = 0
      for (const [, code] of codes) {
        try {
          const b64 = code.split(',')[1]
          const file = await saveQrImage(b64)
          const sent = await sendImage(e, file)
          if (sent) imgSent++
          setTimeout(() => {
            try {
              fs.unlinkSync(file)
            } catch {}
          }, 120_000)
        } catch {
          /* 单张失败继续 */
        }
      }

      await e.reply(
        [
          codes.length === 1
            ? `请用${codes[0][0]}扫一扫，确认后自动登录`
            : codes.map(([label]) => `${label}码用${label}扫`).join('，') + '，确认后自动登录',
          `二维码 ${Math.round((expiresIn || 180) / 60)} 分钟内有效`,
          imgSent >= codes.length ? '' : '（图片发送失败可重新发命令）',
        ]
          .filter(Boolean)
          .join('\n')
      )

      this.startWebQrPoll(e, sessionId, Number(expiresIn || 180), wantWx, data.mode || '')
    } catch (err) {
      await e.reply(`扫码登录失败：${err.message}`)
    }
    return true
  }

  /** webqr 会话轮询 */
  startWebQrPoll(e, sessionId, expiresIn, isWx = false, apiMode = '') {
    const userId = e.user_id
    const userKey = String(userId || '')
    const started = Date.now()
    const maxMs = Math.min(expiresIn, 180) * 1000

    const task = { sessionId, stopped: false, busy: false, timer: null }
    activeLogins.set(userId, task)

    const finishOk = async (info) => {
      if (task.stopped) return
      task.stopped = true
      if (task.timer) clearTimeout(task.timer)
      activeLogins.delete(userId)
      await onLoginSuccess(e, info)
    }

    const tick = async () => {
      if (task.stopped) return
      if (task.busy) {
        task.timer = setSafeTimeout(tick, 800, '扫码轮询')
        return
      }
      if (Date.now() - started > maxMs) {
        task.stopped = true
        activeLogins.delete(userId)
        await e.reply('二维码已过期，请重新扫码')
        return
      }

      task.busy = true
      try {
        const body = await request('/login/webqr/check', { sessionId }, 'get', userKey)
        const data = body?.data || {}
        const status = data.status || 'wait'

        if (status === 'success' && data.hasKey) {
          await finishOk({
            uin: data.uin,
            nick: data.nick,
            hasKey: true,
            channel: apiMode === 'pc' ? 'webqr-pc' : isWx ? 'webqr-wx' : 'webqr',
          })
          return
        }
        if (status === 'expired' || status === 'error') {
          task.stopped = true
          activeLogins.delete(userId)
          await e.reply(data.error || '二维码已过期或扫码失败，请重新扫码')
          return
        }
      } catch {
        /* 轮询失败继续重试 */
      } finally {
        task.busy = false
      }

      if (!task.stopped && activeLogins.get(userId)?.sessionId === sessionId) {
        task.timer = setSafeTimeout(tick, 2500, '扫码轮询')
      }
    }

    task.timer = setSafeTimeout(tick, 2000, '扫码轮询')
  }

  async loginStatus(e) {
    const userKey = String(e.user_id || '')
    try {
      await e.reply('正在生成 QQ 音乐状态卡片…')
      let apiHint = ''
      try {
        const st = await request('/login/status', {}, 'get', userKey)
        const d = st?.data || {}
        apiHint = d.login
          ? `API已登录 uin=${d.uin} key=${d.hasKey ? '有' : '无'} refresh=${d.hasRefresh ? '有' : '无'}${
              d.keyAgeSec != null ? ` age=${d.keyAgeSec}s` : ''
            }`
          : 'API 显示未登录'
        logger?.info?.(`[qqmusic-plugin] ${apiHint}`)
      } catch (err) {
        apiHint = `API状态查询失败: ${err.message}`
      }

      const data = await buildQQMusicStatusData(userKey)
      if (!data.loggedIn && apiHint) {
        data.vipExpireText = apiHint
      }
      const img = await renderStatusCard(e, data)
      if (img) {
        await e.reply(img, true)
        return true
      }
      await e.reply(formatStatusText(data) + (apiHint ? `\n${apiHint}` : ''))
    } catch (err) {
      logger?.error?.(`[qqmusic-plugin] 状态卡片失败: ${err.message}`)
      await e.reply(`获取状态失败：${err.message}`)
    }
    return true
  }

  async logout(e) {
    this.stopPoll(e.user_id)
    const userKey = String(e.user_id || '')
    try {
      await request('/login/logout', {}, 'post', userKey)
      try {
        writeLoginState({ reset: true })
      } catch {}
      await e.reply('已解除登录绑定')
    } catch (err) {
      await e.reply(`登出失败：${err.message}`)
    }
    return true
  }

  async syncFromApi(e) {
    const userKey = String(e.user_id || '')
    try {
      const meta = await pullLoginMeta(userKey)
      if (!meta.login || !meta.hasKey) {
        await e.reply('API 当前未登录，请先 #qqm登录')
        return true
      }
      writeLoginState({
        uin: meta.uin || '',
        userKey,
        nick: meta.nick || '',
        hasRefresh: meta.hasRefresh,
      })
      await e.reply(
        [
          '✅ 登录态正常',
          meta.uin ? `uin: ${meta.uin}` : '',
          meta.nick ? `昵称: ${meta.nick}` : '',
          meta.hasRefresh ? '含 refresh，可自动续期' : '⚠️ 无 refresh',
          meta.keyAgeSec != null ? `key 已用 ${meta.keyAgeSec}s` : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
    } catch (err) {
      await e.reply(`查询失败：${err.message}`)
    }
    return true
  }

  /** 主动续期 key */
  async refreshKey(e) {
    const userKey = String(e.user_id || '')
    try {
      await e.reply('正在刷新登录 key…')
      const body = await refreshLogin(userKey)
      const d = body?.data || body || {}
      if (body?.result && body.result !== 100 && body.result !== 0) {
        await e.reply(
          [
            `刷新失败：${body.errMsg || body.result}`,
            body.tip || d.tip || '',
            '请重新 #qqm登录',
          ]
            .filter(Boolean)
            .join('\n')
        )
        return true
      }
      try {
        const meta = await pullLoginMeta(userKey)
        if (meta) {
          writeLoginState({
            uin: meta.uin || '',
            userKey,
            nick: meta.nick || '',
            hasRefresh: meta.hasRefresh,
          })
        }
      } catch {
        /* ignore */
      }
      await e.reply(
        [
          '✅ key 已刷新',
          d.uin ? `uin: ${d.uin}` : '',
          d.changed === false ? '（key 未变化）' : '',
          d.hasRefresh === false
            ? '⚠️ 无 refresh，过期后需重新扫码'
            : d.hasRefresh
              ? '含 refresh，后续可自动续期'
              : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
    } catch (err) {
      await e.reply(
        `刷新失败：${err.message}\n请重新 #qqm登录`
      )
    }
    return true
  }

  async bindManual(e) {
    const m = e.msg.match(/^#?(?:qq|QQ)m(?:绑定|导入)\s*(.+)$/i)
    const raw = m?.[1]?.trim()
    if (!raw) {
      await e.reply('用法：#qqm绑定 qqmusic://...')
      return true
    }

    try {
      const body = await request('/login/deeplink', { url: raw }, 'post', String(e.user_id || ''))
      const d = body?.data || {}
      await onLoginSuccess(e, { ...d, channel: d.channel || 'deeplink' })
    } catch (err) {
      await e.reply(`绑定失败：${err.message}`)
    }
    return true
  }

  async importDeepLink(e) {
    const text = String(e.msg || e.raw_message || '')
    const m = text.match(/qqmusic:\/\/[^\s]+/i)
    if (!m) return false
    try {
      const body = await request('/login/deeplink', { url: m[0] }, 'post', String(e.user_id || ''))
      const d = body?.data || {}
      this.stopPoll(e.user_id)
      await onLoginSuccess(e, { ...d, channel: d.channel || 'deeplink' })
    } catch (err) {
      await e.reply(`DeepLink 导入失败：${err.message}`)
    }
    return true
  }
}
