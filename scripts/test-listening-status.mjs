/** Read-only status regression: real plugin handlers + loopback fixtures, no platform requests. */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

// Karin imports its host runtime, which retains background handles after the tests.
// Let Node's test runner close them only after all assertions and cleanup hooks finish.
if (!process.env.QQMUSIC_STATUS_TEST_CHILD) {
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', fileURLToPath(import.meta.url)], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, QQMUSIC_STATUS_TEST_CHILD: '1' },
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = fs.existsSync(path.join(repo, 'utils/stats.js')) ? repo : path.join(repo, 'dist')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqm-readonly-status-'))
process.env.QQMUSIC_STATS_FILE = path.join(tmp, 'stats.json')
process.env.QQMUSIC_PLUGIN_STATE_PATH = path.join(tmp, 'state')
process.env.QQMUSIC_YUNZAI_PATH = path.join(tmp, 'host')
fs.mkdirSync(path.join(tmp, 'host/lib/plugins'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'host/package.json'), '{"type":"module"}')
fs.writeFileSync(path.join(tmp, 'host/lib/plugins/plugin.js'),
  'export default class Plugin { constructor(opts) { Object.assign(this, opts) } }')
const load = rel => import(pathToFileURL(path.join(runtime, rel)).href)
const { default: Config } = await load('components/Config.js')
const previous = Config.getConfig
let cfg, requests = [], payload, statusCode = 200
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture')
  requests.push({ path: url.pathname, method: req.method, query: Object.fromEntries(url.searchParams), headers: req.headers })
  // Any mutation or unexpected upstream method is rejected by the fixture itself.
  if (req.method !== 'GET' || !['/cgi', '/search'].includes(url.pathname)) {
    res.writeHead(405); res.end('{}'); return
  }
  if (url.pathname === '/cgi' && (url.searchParams.get('module') !== 'music.listening.ListeningSvr'
    || url.searchParams.get('method') !== 'QueryListeningDetail' || url.searchParams.get('param') !== '{}')) {
    res.writeHead(400); res.end('{}'); return
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ result: 100, data: url.pathname === '/cgi' ? payload : { list: [] } }))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
Config.getConfig = () => cfg
const S = await load('utils/stats.js'), C = await load('utils/command.js'), API = await load('utils/api.js')
const appModule = await load('apps/stats.js')
const app = new appModule.qqmusicStats()
const reset = (extra = {}) => {
  cfg = { apiBase: base, publicAccount: 'owner-fixture', forceMasterAccount: true, ...extra }
  payload = { code: 0, data: { totalListenSec: 120, todayListenSec: 60 } }
  requests = []; statusCode = 200
}
const run = async (extra = {}, method = 'listeningStatus') => {
  const replies = []
  const event = { user_id: 'listener-fixture', group_id: 'group-fixture', msg: '#qqm听歌状态',
    ...extra, reply: async value => { replies.push(value); return true } }
  const result = await app[method](event)
  return { result, text: replies.join('\n'), replies }
}
after(async () => {
  Config.getConfig = previous
  S.resetStats()
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('new status aliases route to the real handler without consuming song/local stats/medal commands', () => {
  assert.deepEqual(Object.keys(appModule), ['qqmusicStats'])
  for (const msg of ['#qqm听歌状态', '#QQM官方时长', 'qqm 官方时长']) {
    assert.equal(C.RE_LISTENING_STATUS.test(msg), true)
    const matched = app.rule.filter(r => new RegExp(r.reg).test(msg))
    assert.deepEqual(matched.map(r => r.fnc), ['listeningStatus'])
    assert.equal(C.RE_SONG_CMD.test(msg), false)
    assert.equal(C.RE_MEDAL.test(msg), false)
  }
  for (const msg of ['#qqm听1', '#qqm听歌', '#qqm听歌榜', '#qqm勋章', '#qqm官方时长 晴天']) {
    assert.equal(C.RE_LISTENING_STATUS.test(msg), false)
  }
})

test('own platform data stays separate from local estimates; GET only and querying never changes the ledger', async () => {
  reset()
  S.recordPlay({ groupId: 'ggroup-fixture', userId: 'listener-fixture', song: { interval: 300 } })
  S.flushStats()
  const before = fs.readFileSync(process.env.QQMUSIC_STATS_FILE, 'utf8')
  const { text } = await run()
  assert.match(text, /估算点播时长：累计 5 分/)
  assert.match(text, /不代表实际收听或平台入账/)
  assert.match(text, /QQ 音乐平台进度 · 本人账号/)
  assert.match(text, /累计听歌时长：2 分/)
  assert.match(text, /今日听歌时长：1 分/)
  assert.match(text, /北京时间/)
  assert.equal(fs.readFileSync(process.env.QQMUSIC_STATS_FILE, 'utf8'), before)
  assert.equal(requests.length, 1)
  const req = requests[0]
  assert.equal(req.method, 'GET')
  assert.equal(req.path, '/cgi')
  assert.equal(req.query.userKey, 'listener-fixture')
  assert.equal(req.headers['x-qqmusic-user'], 'listener-fixture')
  assert.equal(req.query.publicUserKey, undefined)
  assert.equal(req.headers['x-qqmusic-public-user'], undefined)
})

test('not logged in, upstream denial and absent fields do not become fake official time', async () => {
  for (const [data, expected] of [
    [{ code: 1000, data: {} }, /需要登录/],
    [{ code: 10007, data: {} }, /code=10007/],
    [{ code: 0, data: {} }, /没有返回进度字段/],
  ]) {
    reset(); payload = data
    const { text } = await run()
    assert.match(text, expected)
    assert.doesNotMatch(text, /下面的播放页任务/)
    assert.doesNotMatch(text.split('【QQ 音乐平台进度')[1], /累计听歌时长：|今日听歌时长：/)
    assert.equal(requests.length, 1)
  }
})

test('invalid upstream duration remains unknown rather than becoming zero credited time', async () => {
  reset(); payload = { code: 0, data: { totalListenSec: 'invalid-fixture' } }
  const { text } = await run()
  assert.match(text, /无法解析时长/)
  assert.doesNotMatch(text, /累计听歌时长：0/)
})

test('local disabled still permits official query; official disabled makes no HTTP request', async () => {
  reset({ statsEnable: false })
  assert.match((await run()).text, /本地点播统计已关闭/)
  assert.equal(requests.length, 1)
  reset({ medalEnable: false })
  const { text } = await run()
  assert.match(text, /平台进度查询已关闭/)
  assert.match(text, /估算点播时长/)
  assert.equal(requests.length, 0)
})

test('global disable and missing user never request shared/owner data', async () => {
  reset({ enable: false })
  for (const method of ['listeningStatus', 'myStats', 'board']) {
    assert.deepEqual(await run({}, method), { result: false, text: '', replies: [] })
  }
  assert.equal(requests.length, 0)
  reset()
  assert.match((await run({ user_id: '', userId: '' })).text, /取不到你的账号信息/)
  assert.equal(requests.length, 0)
})

test('private status excludes group records; native camelCase event ids also work', async () => {
  reset({ medalEnable: false })
  assert.match((await run({ group_id: undefined })).text, /本地暂无点播记录/)
  assert.match((await run({ user_id: undefined, userId: 'listener-fixture',
    group_id: undefined, groupId: 'group-fixture' })).text, /估算点播时长：累计 5 分/)
  assert.equal(requests.length, 0)
})

test('transport failure reports unavailable without retries or recording a play', async () => {
  reset(); statusCode = 503
  const before = S.statsOf('ggroup-fixture', 'listener-fixture')
  assert.match((await run()).text, /平台查询失败/)
  assert.deepEqual(S.statsOf('ggroup-fixture', 'listener-fixture'), before)
  assert.equal(requests.length, 1)
})

test('strict personal queries strip both public aliases while regular playback search retains owner fallback', async () => {
  reset()
  await API.request('/cgi', { module: 'music.listening.ListeningSvr', method: 'QueryListeningDetail', param: '{}',
    publicUserKey: 'unexpected-owner', public_user_key: 'unexpected-owner' }, 'get', 'listener-fixture', { asUser: true })
  assert.equal(requests[0].query.publicUserKey, undefined)
  assert.equal(requests[0].query.public_user_key, undefined)
  assert.equal(requests[0].headers['x-qqmusic-public-user'], undefined)
  await API.request('/search', { key: 'fixture' }, 'get', 'listener-fixture')
  assert.equal(requests[1].query.userKey, 'owner-fixture')
  assert.equal(requests[1].query.publicUserKey, 'owner-fixture')
  assert.equal(requests[1].headers['x-qqmusic-public-user'], 'owner-fixture')
})
