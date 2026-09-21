/**
 * 一起听（插件侧）：只做「协议端识别 + 发送」
 *
 * 协议知识（字段定义、包长什么样、怎么判定、限流口径、用户文案）全部在 API 侧
 * （qqmusic-api-enhanced 的 util/together.js），插件这里**不解析、不判断**，只负责：
 *   1. 识别协议端（icqq / onebot）并告诉 API
 *   2. 把 API 给的包用本地协议端会话发出去
 *   3. 把响应原样交回 API，拿下一步或最终文案
 *
 * 这样分发出去的插件里没有可复刻的协议实现：换一家 API 也不能「照着改个地址」就接走，
 * 因为「发什么包、发完怎么判定」这个问题在插件侧根本没有答案。
 */
import { request } from './api.js'
import { detectAdapter } from './adapter.js'
import { logInfo, logWarn } from './log.js'

/** 能发原始 SSO 包的协议端；返回空串表示不支持（API 侧据此决定 via） */
export function togetherAdapter(e) {
  const kind = detectAdapter(e).kind
  if (kind === 'icqq' || kind === 'onebot') return kind
  return ''
}

/**
 * 取协议端的 web 登录凭证（skey）
 *
 * 群音乐 HTTP 接口（H5 页面加歌走的那条）要用它算 g_tk、并作为 cookie 发出去。
 * **只有插件侧有这个凭证**（api 侧拿不到登录态），所以由这里取出来交给 API。
 * ⚠️ 这是敏感凭证：**永远不要打日志**、也不要塞进错误信息里。
 */
function skeyOf(e) {
  const bot = e?.bot
  const skey = bot?.sig?.skey || bot?.skey || ''
  return String(skey || '')
}

/**
 * 取 `qun.qq.com` 这个域的 **p_skey**。
 *
 * ⚠️ 别拿 skey 顶替：QQ 的 web 接口（qun.qq.com 这一系）认的是 **p_skey** ——
 * `g_tk` 要用它算、Cookie 里也要带 `p_uin`/`p_skey`（见 icqq `client.js` 的
 * `this.g_tk` / `this.cookies`：两者都是基于 `this.pskey` 的 Proxy）。
 * 用 skey 算出来的 g_tk 接口一律不认（实测回一个没有 msg 的 `retcode 100000`）。
 */
function pskeyOf(e) {
  const pskey = e?.bot?.pskey
  const v = pskey && typeof pskey === 'object' ? pskey['qun.qq.com'] : ''
  return String(v || '')
}

/**
 * 取协议端**实际在用的版本 qua**（`V1_AND_SQ_9.1.70_9896_YYB_D` 这种）。
 *
 * 群音乐那个 web 接口的 UA 里的版本段要从它派生 —— 必须和"这个账号实际用的版本"对上，
 * 否则"9.1.70 登录的账号 + 9.2.66 的浏览器"本身就是个矛盾。（API 侧拿不到 icqq 的 apk 信息）
 */
function quaOf(e) {
  const bot = e?.bot
  return String(bot?.apk?.qua || '')
}

/** 能不能用一起听（只做本地能力/开关判断，业务判定在 API） */
export function togetherGate(e, cfg = {}) {
  if (cfg.togetherEnable !== true) {
    return { ok: false, reason: '一起听未启用（主人可在 #qqm设置 或锅巴里打开）' }
  }
  if (!e?.group_id) {
    return { ok: false, reason: '一起听仅支持群聊' }
  }
  if (!togetherAdapter(e)) {
    return { ok: false, reason: '一起听需要 ICQQ 或 OneBot（NapCat / SnowLuma）协议端' }
  }
  return { ok: true }
}

/** 按 API 指定的通道把包发出去，返回响应 hex（原样交回，不解析） */
async function sendStep(e, step) {
  const hex = String(step.hex || '')
  const body = Buffer.from(hex, 'hex')
  if (!body.length) throw new Error('API 给的包是空的')

  if (step.via === 'sendUni') {
    const bot = e.bot
    if (typeof bot?.sendUni !== 'function') {
      throw new Error('当前协议端没有 sendUni（与 API 的判断不一致）')
    }
    // API 标记了这一步要带签名：把这条命令加进 icqq 的签名白名单。
    // signCmd 只是 icqq 实例上的一个数组，运行时加即可，**不用改 icqq 源码**；
    // 命令名由 API 给（协议知识不下放到插件）。签不签得成取决于签名服务认不认这条命令 ——
    // 不认的话 icqq 会返回「签名api异常」的假包，API 侧会识别成 SSO_LOCAL 并如实报错。
    //
    // 三种情况分别打日志。之前只在「push 成功」时打，于是「命令本来就在白名单里」和
    // 「bot.signCmd 根本不是数组（= 签名完全没生效）」这两种情况**都是静默的** ——
    // 2026-09-21 排障时就卡在这片沉默上，只能让用户去翻控制台猜。
    if (step.sign === true) {
      if (!Array.isArray(bot.signCmd)) {
        logWarn(
          `一起听：bot.signCmd 不是数组（实际是 ${typeof bot.signCmd}）—— 签名没生效，` +
            `${step.cmd} 将以免签名发出`
        )
      } else if (bot.signCmd.includes(step.cmd)) {
        logInfo(`一起听：${step.cmd} 已在签名白名单里（共 ${bot.signCmd.length} 条）`)
      } else {
        bot.signCmd.push(step.cmd)
        logInfo(`一起听：已为 ${step.cmd} 开启签名（白名单现有 ${bot.signCmd.length} 条）`)
      }
    }
    // 计时：签名要 POST 到签名服务，真生效时这一步会多出几百毫秒往返。
    // 「包到底带没带上签名」在应用层看不出来，耗时是唯一能观察到的旁证。
    const t0 = Date.now()
    // 显式给超时：icqq 默认只有 5s，开房这类请求容易超
    const raw = await bot.sendUni(step.cmd, body, 15)
    logInfo(`一起听：${step.cmd} 发包完成，耗时 ${Date.now() - t0}ms`)
    if (!raw || !raw.length) throw new Error('发包后没有响应（可能超时）')
    return Buffer.from(raw).toString('hex')
  }

  if (step.via === 'send_packet') {
    const { botSendApi } = await import('./send.js')
    const res = await botSendApi(e, 'send_packet', { cmd: step.cmd, data: hex, rsp: true })
    // TRSS 的 sendApi 有的实现直接回 data 本体，有的回整个 {status, retcode, data}
    const payload = res && typeof res === 'object' && 'data' in res ? res.data : res
    if (typeof payload !== 'string' || !payload.trim()) {
      const detail =
        res && typeof res === 'object' ? String(res.message || res.msg || '') : ''
      throw new Error(`协议端没返回数据包${detail ? `：${detail}` : ''}`)
    }
    return payload.replace(/^0x/i, '').trim()
  }

  throw new Error(`API 指定的发包方式不认识：${step.via}`)
}

/** API 的失败响应统一成插件侧的返回值 */
function apiFail(err, fallback) {
  const payload = err?.payload
  return {
    ok: false,
    message: payload?.errMsg || err?.message || fallback,
    // silent 由 API 判定（它知道这是不是「预期内的跳过」），插件照办
    silent: payload?.silent === true,
  }
}

/**
 * 跑一轮一起听操作：插件驱动「API 算包 → 我发包 → 回报」的乒乓
 * @param {'manual'|'auto'|'probe'|'state'} action
 * @param {object} [song] action=manual/auto 时必填
 * @returns {Promise<{ok: boolean, message: string, silent?: boolean}>}
 */
export async function runTogether(e, action, song) {
  const adapter = togetherAdapter(e)
  if (!adapter) {
    return { ok: false, message: '一起听需要 ICQQ 或 OneBot（NapCat / SnowLuma）协议端', silent: true }
  }
  if (!e?.group_id) {
    return { ok: false, message: '一起听仅支持群聊', silent: true }
  }

  const songPayload = song
    ? {
        songmid: song.songmid,
        songName: song.songName,
        singerName: song.singerName,
        interval: song.interval,
        cover: song.cover,
        external: song.external === true,
      }
    : undefined

  let res
  try {
    // 写操作时带上 skey：API 会用「群音乐 HTTP 接口」那条路加歌（H5 页面用的就是它，
    // 而 SSO 的 share_trans 在 icqq 下稳定 tmem error）。state/probe 不需要，就不传。
    const creds =
      action === 'manual' || action === 'auto'
        ? { skey: skeyOf(e), pskey: pskeyOf(e), qua: quaOf(e) }
        : {}
    res = await request(
      '/together/start',
      {
        groupId: String(e.group_id),
        adapter,
        action,
        uin: Number(e.self_id || e.bot?.uin || 0),
        song: songPayload,
        ...(creds.skey ? { skey: creds.skey } : {}),
        ...(creds.pskey ? { pskey: creds.pskey } : {}),
        ...(creds.qua ? { qua: creds.qua } : {}),
      },
      'post'
    )
  } catch (err) {
    return apiFail(err, '一起听请求失败')
  }

  let data = res?.data || {}
  let guard = 0
  while (guard++ < 10) {
    if (data.done) {
      if (data.message) logInfo(`一起听：${data.message}`)
      return {
        ok: data.silent !== true,
        message: data.message || '',
        silent: data.silent === true,
      }
    }
    if (!data.step) {
      return { ok: false, message: 'API 没给出下一步，也无法结束', silent: false }
    }

    let hex = ''
    let sendError = ''
    try {
      // API 可以要求"这一步之前等一下"（例如主动开房探测连开三个房间要错开）
      if (Number(data.step.waitMs) > 0) {
        await new Promise((r) => setTimeout(r, Number(data.step.waitMs)))
      }
      hex = await sendStep(e, data.step)
    } catch (err) {
      // 发包失败也要回报给 API：由它决定这算失败还是「可能已生效」并给文案
      sendError = err.message
    }

    try {
      const next = await request(
        '/together/step',
        { session: data.session, id: data.step.id, hex, error: sendError || undefined, action },
        'post'
      )
      data = next?.data || {}
    } catch (err) {
      return apiFail(err, '一起听失败')
    }
  }
  return { ok: false, message: '一起听步骤过多，已中止', silent: false }
}

/**
 * 自动同步入口（deliverSong 收尾调用）
 *
 * 必须**同时**满足两个开关：togetherEnable（功能总开关）+ togetherAuto（点歌后自动同步）。
 * 总开关关着就不该有任何动作 —— 只看 togetherAuto 会让「总开关关、单独开了自动同步」
 * 的配置仍然发歌进房间。
 */
export async function autoSyncTogether(e, song, cfg) {
  try {
    if (!togetherGate(e, cfg).ok) return null
    if (cfg?.togetherAuto !== true) return null
    return await runTogether(e, 'auto', song)
  } catch (err) {
    logInfo(`一起听自动同步异常：${err.message}`)
    return null
  }
}
