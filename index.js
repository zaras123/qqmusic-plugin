/**
 * qqmusic-plugin 入口
 * 放到 Yunzai/plugins/qqmusic-plugin/
 * 适配 TRSS-Yunzai：ICQQ / OneBotv11 WS / QQBot-Plugin(ts-yf)
 */
import fs from 'node:fs'
import path from 'node:path'
import { pluginPath } from './utils/path.js'
import { ensureSegment } from './utils/adapter.js'

const log = global.logger || console

await ensureSegment()

const appsDir = path.join(pluginPath, 'apps')
const files = fs.readdirSync(appsDir).filter((f) => f.endsWith('.js'))

let ret = []
files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)

const apps = {}
for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, '')
  if (ret[i].status !== 'fulfilled') {
    log.error?.(`[qqmusic-plugin] 载入失败: ${name}`)
    log.error?.(ret[i].reason)
    continue
  }
  const mod = ret[i].value
  const key = Object.keys(mod).find((k) => typeof mod[k] === 'function') || Object.keys(mod)[0]
  apps[name] = mod[key]
}

const msg = `qqmusic-plugin 已加载（${Object.keys(apps).length} 个模块 · ICQQ/OneBot/QQBot）`
if (log.green && typeof log.info === 'function') log.info(log.green(msg))
else if (typeof log.info === 'function') log.info(msg)
else console.log(msg)

export { apps }
