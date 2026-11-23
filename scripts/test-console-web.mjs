import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { consoleHandler, consoleToken, MENU_PATH, registerConsole } from '../guoba/console-server.js'

// 模拟真实锅巴：DI 用 loadClass 的 ?timestamp 另加载一份服务类，
// 前端挂在 /guoba 下，SPA 兜底由 errorController.router 处理。
const guobaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqmusic-guoba-'))
fs.mkdirSync(path.join(guobaRoot, 'framework'), { recursive: true })
fs.writeFileSync(
  path.join(guobaRoot, 'framework', 'index.js'),
  [
    `const service = { async queryMenus() { return [{ path: '/home' }, { path: '/config' }, { path: '/about' }] } };`,
    `globalThis.__qqmusicDiService = service;`,
    `const fallbackRouter = { name: 'fallback' };`,
    `const app = { _router: { stack: [] }, use(path, handler) { this._router.stack.push({ path, handle: handler }); } };`,
    `app._router.stack.push({ path: '/', handle: fallbackRouter });`,
    `const application = { app, _args: { prefix: '/guoba', mount: '/guoba' } };`,
    `globalThis.__qqmusicTestApp = app;`,
    `globalThis.__qqmusicFallbackRouter = fallbackRouter;`,
    `export const instancesMap = new Map([`,
    `  ['systemService', service],`,
    `  ['tokenInterceptor', { guobaApp: application }],`,
    `  ['errorController', { router: fallbackRouter }],`,
    `]);`,
  ].join('\n'),
  'utf8'
)

global.Guoba = {
  GI: async (spec) => {
    const name = String(spec)
    if (name.startsWith('@/')) {
      return { _paths: { pluginRoot: guobaRoot, server: { realMountPrefix: '/guoba' } } }
    }
    return {}
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
await new Promise((resolve) => setTimeout(resolve, 250))

const mountedPath = `/guoba${MENU_PATH}`
const app = globalThis.__qqmusicTestApp
const fallbackRouter = globalThis.__qqmusicFallbackRouter
const pageLayer = app._router.stack.find((layer) => layer.path === mountedPath)
assert.ok(pageLayer, 'console page should be mounted on the real Guoba app')
assert.equal(typeof pageLayer.handle, 'function')
const pageIndex = app._router.stack.indexOf(pageLayer)
const fallbackIndex = app._router.stack.findIndex((layer) => layer.handle === fallbackRouter)
assert.ok(pageIndex >= 0 && pageIndex < fallbackIndex, 'page route must be before the SPA fallback')

const menus = await globalThis.__qqmusicDiService.queryMenus()
const item = menus.find((row) => row.name === 'QQMusicConsole')
assert.ok(item, 'menu item should be appended to the real DI service')
assert.equal(item.path, MENU_PATH)
assert.equal(item.component, 'IFRAME')
assert.equal(item.meta.title, 'QQ音乐管理')
assert.equal(item.meta.icon, 'ion:musical-notes-outline')
assert.ok(item.meta.frameSrc.startsWith(`${mountedPath}/?token=`))
assert.equal(menus.at(-1).path, MENU_PATH, 'plugin page should be the last sidebar item')
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
