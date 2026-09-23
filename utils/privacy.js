/**
 * 展示层隐私处理：API 地址一律打码（主人也不显示真实地址）
 */
import Config from '../components/Config.js'

/**
 * API 地址打码
 *   http://1.2.3.4:3300  -> http://***:3300
 *   https://api.example.com -> https://***.com
 *   http://1.2.3.4:3300/path -> http://***:3300/path
 */
export function maskApiBase(url) {
  const u = String(url || '').trim()
  if (!u) return '****'
  try {
    const parsed = new URL(u)
    const host = parsed.hostname || ''
    let maskedHost = '***'
    if (/^(127\.0\.0\.1|localhost|::1|0\.0\.0\.0)$/i.test(host)) {
      // 本机地址没必要打码 —— 打出来是 "***.1:3300" 这种谁都看不懂的东西
      maskedHost = '本机'
    } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      maskedHost = `***.***.***.${host.split('.').pop()}` // 保留最后一段，便于区分是哪台机器
    } else {
      const lastDot = host.lastIndexOf('.')
      if (lastDot > 0) maskedHost = '***' + host.slice(lastDot)
    }
    const port = parsed.port ? `:${parsed.port}` : ''
    const pathPart = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : ''
    return `${parsed.protocol}//${maskedHost}${port}${pathPart}`
  } catch {
    return '****'
  }
}

/** 卡片 footer / hint 用：API · ***:3300 */
export function apiHintFor() {
  const cfg = Config.getConfig('qqmusic') || {}
  if (!cfg.apiBase) return 'API 未配置'
  return `API · ${maskApiBase(cfg.apiBase).replace(/^https?:\/\//, '')}`
}
