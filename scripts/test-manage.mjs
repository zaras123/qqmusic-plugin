import assert from 'node:assert/strict'
import {
  splitConfirm,
  upstreamWriteError,
  parsePlaylistCmd,
  parseDislikeCmd,
  parseCommentCmd,
  parseSoundPowerCmd,
  parsePrivateMsgCmd,
} from '../utils/manage.js'

let passed = 0
const check = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`)
    process.exitCode = 1
  }
}

check('确认词必须在结尾', () => {
  assert.deepEqual(splitConfirm('123:1 确认'), { ok: true, rest: '123:1' })
  assert.equal(splitConfirm('确认 123:1').ok, false)
})

check('写操作业务码错误能被识别', () => {
  assert.equal(upstreamWriteError({ code: 0 }), '')
  assert.equal(upstreamWriteError({ code: 123, errMsg: '失败' }), '失败')
  assert.equal(upstreamWriteError({ message: '普通返回' }), '')
})

check('歌单/收藏命令解析', () => {
  const make = parsePlaylistCmd('#qqm歌单新建 测试歌单 确认')
  assert.equal(make.action, 'playlistCreate')
  assert.equal(make.ok, true)
  assert.equal(make.name, '测试歌单')

  const album = parsePlaylistCmd('#qqm收藏专辑 9001,9002 确认')
  assert.equal(album.action, 'favAlbum')
  assert.deepEqual(album.ids, [9001, 9002])
  assert.equal(parsePlaylistCmd('#qqm收藏专辑取消 9001 确认').action, 'unfavAlbum')
  assert.equal(parsePlaylistCmd('#qqm收藏歌单 7011 确认').action, 'favSonglist')
})

check('不喜欢的类型与 ID 解析', () => {
  const add = parseDislikeCmd('#qqm不喜欢歌曲 123 确认')
  assert.equal(add.action, 'addDislike')
  assert.equal(add.type, 1)
  assert.deepEqual(add.ids, [123])
  assert.equal(parseDislikeCmd('#qqm清空不喜欢 确认').action, 'cancelAllDislike')
})

check('评论命令解析', () => {
  const add = parseCommentCmd('#qqm发评论 歌曲 123 好听 确认')
  assert.equal(add.action, 'commentAdd')
  assert.equal(add.biztype, 1)
  assert.equal(add.bizId, '123')
  assert.equal(add.content, '好听')
  assert.equal(parseCommentCmd('#qqm删评论 cm_123 确认').cmId, 'cm_123')
})

check('音响力命令解析', () => {
  assert.equal(parseSoundPowerCmd('#qqm音响力点赞 10001 确认').action, 'soundpowerLike')
  assert.equal(parseSoundPowerCmd('#qqm音响力取消点赞 10001 确认').action, 'soundpowerUnlike')
  assert.equal(parseSoundPowerCmd('#qqm音响力隐私 1 确认').status, 1)
})

check('私信命令解析', () => {
  const send = parsePrivateMsgCmd('#qqm私信发送 10001 1 你好 确认')
  assert.equal(send.action, 'privateSend')
  assert.deepEqual(send.args, { userId: '10001', msgType: 1, content: '你好' })
  assert.equal(parsePrivateMsgCmd('#qqm私信删除会话 s_1 确认').args.sessionId, 's_1')
  assert.equal(parsePrivateMsgCmd('#qqm私信删除消息 s_1 m_1 确认').args.msgId, 'm_1')
  assert.equal(parsePrivateMsgCmd('#qqm私信全部已读 enc_1 确认').args.cmdFlag, 1)
})

console.log(`\n账号操作纯函数 ${passed}/7 通过`)
if (process.exitCode) process.exit(process.exitCode)
