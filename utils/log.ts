/**
 * 统一日志前缀，避免各处 logger?.info?.(`[qqmusic-plugin] ...`) 复制粘贴
 *
 * 宿主优先：Karin 的 `logger`（node-karin 具名导出）→ console。
 * KARIN_PLUGIN_INIT 会用 setLogger() 把框架 logger 注入进来。
 */
const TAG = '[qqmusic-plugin]'

let injectedLogger = null

/** 由入口（KARIN_PLUGIN_INIT）注入宿主 logger */
export function setLogger(logger) {
  if (logger === null) {
    injectedLogger = null
    return null
  }
  if (logger && (typeof logger.info === 'function' || typeof logger.warn === 'function')) {
    injectedLogger = logger
  }
  return injectedLogger
}

function pickLogger() {
  return injectedLogger || console
}

export function logInfo(msg, ...rest) {
  const l = pickLogger()
  if (typeof l.info === 'function') l.info(`${TAG} ${msg}`, ...rest)
  else console.log(`${TAG} ${msg}`, ...rest)
}

export function logWarn(msg, ...rest) {
  const l = pickLogger()
  if (typeof l.warn === 'function') l.warn(`${TAG} ${msg}`, ...rest)
  else console.warn(`${TAG} ${msg}`, ...rest)
}

export function logError(msg, ...rest) {
  const l = pickLogger()
  if (typeof l.error === 'function') l.error(`${TAG} ${msg}`, ...rest)
  else console.error(`${TAG} ${msg}`, ...rest)
}
