/**
 * 扫码登录
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadPluginBaseSync } from '../utils/plugin-base.js'

const Plugin = loadPluginBaseSync()

import Config from '../components/Config.js'
import { request, pullLoginMeta, refreshLogin } from '../utils/api.js'
import { getTempDir } from '../utils/send.js'
import { buildQQMusicStatusData } from '../utils/status-card.js'
import { renderStatusCard, formatStatusText } from '../utils/render.js'

/** 进行中的扫码任务 user_id -> { qrcodeID, timer, e, stopped } */
const activeLogins = new Map()

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
    const cfg = Config.getConfig('qqmusic') || {}
    Config.setConfig('qqmusic', {
      ...cfg,
      cookie: '',
      lastLoginUin: String(meta?.uin || uin || cfg.lastLoginUin || ''),
      lastLoginNick: String(meta?.nick || nick || cfg.lastLoginNick || ''),
      lastLoginAt: Date.now(),
      lastHasRefresh: Boolean(meta?.hasRefresh),
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
      meta?.hasRefresh ? '含 refresh 材料，过期可自动续期' : '⚠️ 无 refresh，过期后需重新扫码',
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

export class qqmusicLogin extends Plugin {
  constructor() {
    super({
      name: 'QQ音乐-扫码登录',
      dsc: '扫码登录 QQ 音乐',
      event: 'message',
      priority: 450,
      rule: [
        {
          reg: '^#?(qq|QQ)m(扫码)?(登录|登陆)$|^#?(qq|QQ)音乐(扫码)?(登录|登陆)$|^#?(qq|QQ)扫码(登录|登陆)$',
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

      await e.reply(
        [
          tips || '请使用 QQ / 微信 / QQ音乐 App 扫码',
          `二维码 ${Math.round((expiresIn || 900) / 60)} 分钟内有效`,
          imgSent ? '' : '（图片发送失败可重新 #qqm登录）',
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
        task.timer = setTimeout(tick, 800)
        return
      }
      if (Date.now() - started > maxMs) {
        task.stopped = true
        activeLogins.delete(userId)
        await e.reply('二维码已过期，请重新 #qqm登录 或自行获取ck')
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
        task.timer = setTimeout(tick, 2500)
      }
    }

    task.timer = setTimeout(tick, 2000)
  }

  stopPoll(userId) {
    const t = activeLogins.get(userId)
    if (t) {
      t.stopped = true
      if (t.timer) clearTimeout(t.timer)
      activeLogins.delete(userId)
    }
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
        const cfg = Config.getConfig('qqmusic') || {}
        Config.setConfig('qqmusic', {
          ...cfg,
          cookie: '',
          lastLoginUin: '',
          lastLoginNick: '',
          lastLoginAt: 0,
          lastHasRefresh: false,
        })
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
      const cfg = Config.getConfig('qqmusic') || {}
      Config.setConfig('qqmusic', {
        ...cfg,
        lastLoginUin: meta.uin || cfg.lastLoginUin || '',
        lastLoginNick: meta.nick || cfg.lastLoginNick || '',
        lastLoginAt: Date.now(),
        lastHasRefresh: meta.hasRefresh,
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
          const cfg = Config.getConfig('qqmusic') || {}
          Config.setConfig('qqmusic', {
            ...cfg,
            lastLoginUin: meta.uin || cfg.lastLoginUin || '',
            lastLoginNick: meta.nick || cfg.lastLoginNick || '',
            lastLoginAt: Date.now(),
            lastHasRefresh: meta.hasRefresh,
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
