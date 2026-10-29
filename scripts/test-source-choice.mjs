/** Channel selection regression: local HTTP fixtures, real API client and resolver entries. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = fs.existsSync(path.join(root, 'utils/api.js')) ? root : path.join(root, 'dist')
const load = file => import(pathToFileURL(path.join(runtime, file)).href)
global.logger = { info() {}, warn() {}, error() {}, debug() {} }
const { default: Config } = await load('components/Config.js')
const cfg = { enable: true, enableResolve: true, resolveLinks: true, resolveExternal: true,
  localLibrary: true, quality: 'flac', apiBase: '', apiToken: '', forceMasterAccount: false }
Config.getConfig = () => cfg
const api = await load('utils/api.js')
const { qqmusicResolve } = await load('apps/resolve.js')
const { qqmusicSong } = await load('apps/song.js')
const helpers = await load('utils/external-resolve.js')
const { getUserSession } = await load('utils/session.js')
const entry = fs.readFileSync(path.join(runtime, 'apps/song.js'), 'utf8')
const start = entry.indexOf('async function resolvePlay(')
const end = entry.indexOf('export class qqmusicSong', start)
assert.ok(start >= 0 && end > start)
const resolvePlay = vm.compileFunction(entry.slice(start, end) + ';return resolvePlay',
  ['songUrlBest', 'libraryItemPlay', 'platformQualityPref', 'QUALITY_LABEL'])(
  api.songUrlBest, api.libraryItemPlay, () => 'flac', { flac: 'FLAC', '192k': '192K' })
const official = { songmid: 'QQSAME001', songname: '同一首歌', source: 'qq', local: false, channelKind: 'official' }
const local = { ...official, local: true, libraryId: 'lib_selected_variant', quality: '192k', channelKind: 'local' }
let calls = [], invalidItem = false, passed = 0
const server = http.createServer((req, res) => {
  const u = new URL(req.url, cfg.apiBase)
  calls.push(u)
  res.setHeader('Content-Type', 'application/json')
  const ok = data => res.end(JSON.stringify({ result: 100, data }))
  if (u.pathname === '/search') return ok({ list: u.searchParams.get('local') === '0' ? [official] : [local, official] })
  if (u.pathname === '/song') return ok({ file: { media_mid: 'QQSAME001', size_flac: 100 } })
  if (u.pathname === '/song/url') {
    res.end(JSON.stringify({ result: 100, data: cfg.apiBase + '/audio', quality: 'flac',
      local: u.searchParams.get('local') === '1', playChannel: u.searchParams.get('local') === '1' ? 'library' : 'official' }))
    return
  }
  if (u.pathname === '/library/item') return ok({ id: invalidItem ? 'lib_other' : u.searchParams.get('id'),
    songmid: 'QQSAME001', source: 'qq', quality: '192k', ext: 'm4a', exists: true,
    fileUrl: cfg.apiBase + '/library/file?id=' + u.searchParams.get('id') })
  if (u.pathname === '/resolve/spotify/playlist') return ok({ playlist: { name: '解析歌单', totalTracks: 1 },
    tracks: [{ name: '同一首歌', matched: true, match: official }] })
  if (u.pathname === '/audio') return res.end('fixture audio bytes')
  res.statusCode = 500
  res.end(JSON.stringify({ result: 500, errMsg: 'unexpected fixture request' }))
})
const check = async (name, fn) => { calls = []; await fn(); passed++; console.log('PASS ' + name) }
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  cfg.apiBase = 'http://127.0.0.1:' + server.address().port
  const songs = await api.searchSongs('同一首歌', { userKey: 'listener' })
  await check('菜单保留同曲本地与官方两条，选官方时请求 local=0', async () => {
    assert.equal(songs.length, 2)
    assert.equal(songs[0].local, true)
    const play = await resolvePlay(songs[1], cfg, 'listener')
    assert.ok(play.url)
    assert.equal(play.local, false)
    assert.equal(calls.find(u => u.pathname === '/song/url').searchParams.get('local'), '0')
    assert.ok(!calls.some(u => u.pathname === '/library/item'))
  })
  await check('选本地按记录 ID 取文件，保留所选音质而不重新匹配', async () => {
    const play = await resolvePlay({ ...songs[0], mvVid: 'existing-mv' }, cfg, 'listener')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].pathname, '/library/item')
    assert.equal(calls[0].searchParams.get('id'), local.libraryId)
    assert.equal(play.libraryId, local.libraryId)
    assert.equal(play.quality, '192k')
    assert.equal(play.ext, 'm4a')
    assert.equal(play.local, true)
    assert.equal(play.mvVid, 'existing-mv')
    assert.match(play.url, /lib_selected_variant$/)
  })
  await check('本地记录丢失或 ID 不符时不换播其它文件', async () => {
    invalidItem = true
    try {
      const play = await resolvePlay(songs[0], cfg, 'listener')
      assert.equal(play.url, '')
      assert.match(play.error, /记录不可用/)
      assert.equal(calls.length, 1)
    } finally { invalidItem = false }
  })
  await check('第三方在线条目不被本地文件替换', async () => {
    const play = await resolvePlay({ ...songs[1], songmid: 'bi_fixture', source: 'bilibili', external: true }, cfg, 'listener')
    assert.ok(play.url)
    assert.equal(calls.find(u => u.pathname === '/song/url').searchParams.get('local'), '0')
  })
  await check('直接播放只搜在线渠道，主动 B站点歌仍可用', async () => {
    const app = new qqmusicSong()
    let selected
    app.playOne = async (_e, args) => { selected = args.song; return true }
    const e = { msg: '#qqm播放 同一首歌', user_id: 'listener', reply: async () => true }
    assert.equal(await app.playDirect(e), true)
    assert.equal(selected.local, false)
    assert.equal(calls[0].pathname, '/search')
    assert.equal(calls[0].searchParams.get('local'), '0')
    calls = []
    assert.equal(await app.playDirectOnPlatform(e, 'bilibili', '同一首歌'), true)
    assert.equal(calls[0].searchParams.get('source'), 'bilibili')
    assert.equal(calls[0].searchParams.get('local'), '0')
  })
  await check('分享解析会话仍优先本地', async () => {
    const play = await resolvePlay(songs[1], cfg, 'listener', true)
    assert.equal(play.local, true)
    assert.equal(calls.find(u => u.pathname === '/song/url').searchParams.get('local'), '1')
  })
  await check('关闭本地总开关后，旧菜单及解析也不查库', async () => {
    cfg.localLibrary = false
    try {
      await resolvePlay(songs[0], cfg, 'listener', true)
      assert.ok(!calls.some(u => u.pathname === '/library/item'))
      assert.equal(calls.find(u => u.pathname === '/song/url').searchParams.get('local'), '0')
    } finally { cfg.localLibrary = true }
  })
  const resolver = new qqmusicResolve()
  const rule = resolver.rule[0]
  const reg = rule.reg instanceof RegExp ? rule.reg : new RegExp(String(rule.reg))
  await check('自动路由不再匹配 B站链接、短链和视频号，音乐分享保持可用', async () => {
    for (const text of ['https://www.bilibili.com/video/BV1xx411c7mD', 'https://b23.tv/abc', 'BV1xx411c7mD', 'av123456']) {
      assert.equal(reg.test(text), false, text)
      assert.equal(helpers.isExternalMusicMessage(text), false, text)
    }
    for (const text of ['https://y.qq.com/n/ryqq/songDetail/QQSAME001',
      'https://open.spotify.com/track/' + 'T'.repeat(22), 'https://music.apple.com/cn/album/example/123']) assert.ok(reg.test(text), text)
  })
  for (const text of ['BV1xx411c7mD', 'https://b23.tv/abc', 'https://www.bilibili.com/video/BV1xx411c7mD',
    '{"app":"com.tencent.structmsg","meta":{"detail_1":{"qqdocurl":"https://b23.tv/abc"}}}',
    '<msg serviceID="1" templateID="structmsg"><item url="https://www.bilibili.com/video/BV1xx411c7mD"/></msg>']) {
    await check('B站消息放行且不请求、不回复、不修改事件: ' + text.slice(0, 40), async () => {
      const e = { msg: text, raw_message: text, user_id: 'listener', reply: async () => { throw Error('must not reply') } }
      assert.equal(await resolver.resolve(e), false)
      assert.equal(await resolver.handle(e, text, cfg), false)
      if (typeof resolver.accept === 'function') assert.equal(await resolver.accept(e), undefined)
      assert.equal(calls.length, 0)
      assert.equal(e.msg, text)
      assert.equal(e._qqmusicResolved, undefined)
    })
  }
  for (const type of ['json', 'xml']) {
    await check('空文本的 B站结构化卡片放行: ' + type, async () => {
      const data = type === 'json'
        ? { app: 'com.tencent.structmsg', meta: { detail_1: { qqdocurl: 'https://b23.tv/abc' } } }
        : '<msg templateID="structmsg"><item url="https://b23.tv/abc"/></msg>'
      const e = { msg: '', user_id: 'listener', message: [{ type, data }], reply: async () => { throw Error('must not reply') } }
      assert.equal(await resolver.resolve(e), false)
      if (typeof resolver.accept === 'function') assert.equal(await resolver.accept(e), undefined)
      assert.equal(calls.length, 0)
      assert.equal(e.msg, '')
      assert.equal(e._qqmusicResolved, undefined)
    })
  }
  await check('解析出的歌单会话保留本地优先标记', async () => {
    const e = { user_id: 'listener', group_id: 'source-choice-fixture', reply: async () => true }
    assert.equal(await resolver.handle(e, 'https://open.spotify.com/playlist/' + 'P'.repeat(22), cfg), true)
    const session = await getUserSession(e.group_id, e.user_id)
    assert.equal(session.preferLocal, true)
    assert.equal(calls[0].searchParams.get('local'), '1')
  })
  console.log(`RESULT: ${passed} passed`)
} finally {
  await new Promise(resolve => server.close(resolve))
}
process.exit(0)
