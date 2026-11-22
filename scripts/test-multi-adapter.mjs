import assert from 'node:assert/strict'
import { groupEventOf, groupPlatforms } from '../utils/bridge.js'
import { normalizeTargets } from '../utils/library-web.js'

const sent = []
global.Bot = new Map([
  [
    '10001',
    {
      uin: '10001',
      adapter: { id: 'QQ', name: 'icqq' },
      gl: new Map([['11111', { group_name: 'ICQQ群' }]]),
      pickGroup(gid) {
        return { group_id: gid, sendMsg: async (msg) => sent.push(['icqq', gid, msg]) }
      },
    },
  ],
  [
    '10002',
    {
      uin: '10002',
      adapter: { id: 'QQ', name: 'OneBotv11' },
      gl: new Map([['22222', { group_name: 'OneBot群' }]]),
      async sendApi(action, params) {
        sent.push([action, params.group_id, params.message])
        return { data: {} }
      },
    },
  ],
  [
    '10003',
    {
      uin: '10003',
      adapter: { id: 'qqbot', name: 'QQBot' },
      gl: new Map([['33333', { group_name: 'QQBot群' }]]),
      pickGroup(gid) {
        return { group_id: gid, sendMsg: async (msg) => sent.push(['qqbot', gid, msg]) }
      },
    },
  ],
])

const platforms = await groupPlatforms()
assert.equal(platforms.length, 3)
assert.ok(platforms.some((row) => row.platform === 'onebot:10002'))
assert.ok(platforms.some((row) => row.platform === 'qqbot:10003'))
assert.ok(platforms.some((row) => row.platform === 'icqq:10001'))

const onebot = groupEventOf({
  groupId: '22222',
  preferUin: '10002',
  platform: 'onebot:10002',
})
assert.ok(onebot)
await onebot.reply('hello')
assert.deepEqual(sent.at(-1), ['send_group_msg', '22222', 'hello'])

const qqbot = groupEventOf({ groupId: '33333', platform: 'qqbot:10003' })
assert.ok(qqbot)
await qqbot.reply('qqbot')
assert.deepEqual(sent.at(-1), ['qqbot', '33333', 'qqbot'])

const targets = normalizeTargets([
  { platform: 'onebot:10002', group_id: '22222', name: 'OneBot群' },
  'icqq:10001|11111',
  '33333',
])
assert.equal(targets.length, 3)
assert.equal(targets[0].platform, 'onebot:10002')
assert.equal(targets[1].platform, 'icqq:10001')
assert.equal(targets[1].group_id, '11111')
assert.equal(targets[2].group_id, '33333')

console.log('multi adapter tests ok')
