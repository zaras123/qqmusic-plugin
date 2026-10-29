/** Actual parser + framework rule + handler, without sending messages or HTTP requests. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = fs.existsSync(path.join(root, 'utils/command.js')) ? root : path.join(root, 'dist')
const load = file => import(pathToFileURL(path.join(runtime, file)).href)
const { default: Config } = await load('components/Config.js')
Config.getConfig = () => ({ enable: true, enableSongRequest: true, unlockV2: true })
const { parseSongCmd } = await load('utils/command.js')
const { qqmusicSong } = await load('apps/song.js')
const app = new qqmusicSong()
const rule = app.rule.find(r => r.fnc === 'onSongCmd')
const reg = rule.reg instanceof RegExp ? rule.reg : new RegExp(rule.reg)
let passed = 0, called = ''
app.pickSong = async () => { called = '点歌'; return true }
app.playDirect = async () => { called = '播放'; return true }
for (const [text, plat, verb, keyword] of [
  ['#qqm点歌晴天', '', '点歌', '晴天'],
  ['#qqm点歌 晴天', '', '点歌', '晴天'],
  ['#qqm 点歌晴天', '', '点歌', '晴天'],
  ['#QQM点歌Love Story', '', '点歌', 'Love Story'],
  ['#qqm点歌　晴天', '', '点歌', '晴天'],
  ['#qqm播放晴天', '', '播放', '晴天'],
  ['#qqm网易云点歌晴天', '网易云', '点歌', '晴天'],
  ['#qqm网易云音乐点歌晴天', '网易云音乐', '点歌', '晴天'],
  ['#qqmB站播放晴天', 'B站', '播放', '晴天'],
  ['#qqmApple Music点歌Love Story', 'Apple Music', '点歌', 'Love Story'],
  ['#qqm点歌播放列表', '', '点歌', '播放列表'],
]) {
  assert.ok(reg.test(text), text)
  assert.deepEqual(parseSongCmd(text), { plat, verb, keyword }, text)
  called = ''
  assert.equal(await app.onSongCmd({ msg: text, reply: async () => { throw Error('Unexpected usage reply') } }), true)
  assert.equal(called, verb, text)
  passed++
  console.log('PASS ' + text)
}
for (const text of ['#qqm歌词晴天', '#qqm网易歌词 晴天', '#qqm平台', '#qqm源 网易', '#qqm网易ck', '#qqm网易清ck', '#qqm网易晴天']) {
  assert.equal(reg.test(text), false, text)
  passed++
}
for (const text of ['#qqm点歌', '#qqm播放', '#qqm网易云点歌']) {
  let usage = ''
  called = ''
  assert.ok(reg.test(text), text)
  assert.equal(await app.onSongCmd({ msg: text, reply: async message => { usage = message } }), true)
  assert.match(usage, /用法/)
  assert.equal(called, '')
  passed++
}
console.log(`RESULT: ${passed} passed`)
process.exit(0)
