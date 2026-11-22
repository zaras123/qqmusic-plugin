import assert from 'node:assert/strict'
import { consoleHandler, consoleToken, MENU_PATH, registerConsole } from '../guoba/console-server.js'

class FakeSystemService {
  async queryMenus() {
    return [{ path: '/home' }, { path: '/config' }, { path: '/about' }]
  }
}

const mounted = new Map()
global.Guoba = {
  app: {
    use(prefix, handler) {
      mounted.set(prefix, handler)
    },
  },
  GI: async (path) => {
    if (String(path).startsWith('@/')) {
      return { _paths: { server: { realMountPrefix: '/guoba' } } }
    }
    return { SystemService: FakeSystemService }
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
await new Promise((resolve) => setTimeout(resolve, 80))

const mountedPath = `/guoba${MENU_PATH}`
assert.equal(typeof mounted.get(mountedPath), 'function')

const menus = await new FakeSystemService().queryMenus()
const item = menus.find((row) => row.path === mountedPath)
assert.ok(item, 'menu item should be appended')
assert.equal(item.meta.title, 'QQ音乐管理')
assert.equal(item.meta.icon, 'ion:musical-notes-outline')
assert.ok(item.meta.frameSrc.startsWith(`${mountedPath}/?token=`))
assert.equal(menus.at(-1).path, mountedPath, 'plugin page should be the last sidebar item')

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
