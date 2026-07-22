/**
 * 统一日志前缀，避免各处 logger?.info?.(`[qqmusic-plugin] ...`) 复制粘贴
 */
const TAG = '[qqmusic-plugin]'

function pickLogger() {
  return global.logger || console
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
