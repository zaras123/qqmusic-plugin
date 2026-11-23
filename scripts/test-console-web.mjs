import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { consoleHandler, consoleToken, MENU_PATH, registerConsole } from '../guoba/console-server.js'

class DecoySystemService {
  async queryMenus() {
    return [{ path: '/home' }]
  }
}

// 模拟真实锅巴：DI 用 loadClass 的 ?timestamp 另加载一份服务类，
// 通过 GI 再导入得到的 SystemService 并不是实际实例。
const guobaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqmusic-guoba-'))
fs.mkdirSync(path.join(guobaRoot, 'framework'), { recursive: true })
fs.writeFileSync(
  path.join(guobaRoot, 'framework', 'index.js'),
  `const service = { async queryMenus() { return [{ path: '/home' }, { path: '/config' }, { path: '/about' }] } };` +
    `globalThis.__qqmusicDiService = service;` +
    `export const instancesMap = new Map([['systemService', service]]);`,
  'utf8'
)

const mounted = new Map()
global.Guoba = {
  app: {
    use(prefix, handler) {
      mounted.set(prefix, handler)
    },
  },
  GI: async (spec) => {
    const name = String(spec)
    if (name.startsWith('@/')) {
      return { _paths: { pluginRoot: guobaRoot, server: { realMountPrefix: '/guoba' } } }
    }
    return { SystemService: DecoySystemService }
  },
}

global.Bot = new Map([
  [
    '10001',
    {
      uin: '10001',
      pickGroup() {
        return {}
      },
      gl: new Map([['123456789', { group_name: '测试群' }]]),
    },
  ],
])

registerConsole()
await new Promise((resolve) => setTimeout(resolve, 200))

const mountedPath = `/guoba${MENU_PATH}`
assert.equal(typeof mounted.get(mountedPath), 'function')

const menus = await globalThis.__qqmusicDiService.queryMenus()
const item = menus.find((row) => row.path === mountedPath)
assert.ok(item, 'menu item should be appended to the real DI service')
assert.equal(item.meta.title, 'QQ音乐管理')
assert.equal(item.meta.icon, 'ion:musical-notes-outline')
assert.ok(item.meta.frameSrc.startsWith(`${mountedPath}/?token=`))
assert.equal(menus.at(-1).path, mountedPath, 'plugin page should be the last sidebar item')
fs.rmSync(guobaRoot, { recursive: true, force: true })

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(body) {
      this.body = body
    },
  }
}

let res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/?token=bad` },
  res
)
assert.equal(res.statusCode, 403)

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
assert.match(String(res.body), /QQ音乐管理/)
assert.match(String(res.headers['Set-Cookie']), /qqmusic_console=/)

res = response()
await consoleHandler(
  {
    method: 'GET',
    originalUrl: `${mountedPath}/style.css`,
    headers: { cookie: `qqmusic_console=${consoleToken}` },
  },
  res
)
assert.equal(res.statusCode, 200)
assert.match(String(res.headers['Content-Type']), /text\/css/)

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/api/groups?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
const groups = JSON.parse(String(res.body))
assert.equal(groups.platforms[0].groups[0].group_id, '123456789')
assert.equal(groups.platforms[0].groups[0].name, '测试群')

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/logo.png?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
assert.match(String(res.headers['Content-Type']), /image\/png/)

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/bridge.js?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
assert.match(String(res.headers['Content-Type']), /javascript/)

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/settings.html?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
assert.match(String(res.body), /API 设置/)

res = response()
await consoleHandler(
  { method: 'GET', originalUrl: `${mountedPath}/api/api-config?token=${consoleToken}` },
  res
)
assert.equal(res.statusCode, 200)
const apiConfig = JSON.parse(String(res.body))
assert.equal(typeof apiConfig.apiBase, 'string')

console.log('console web tests ok')
