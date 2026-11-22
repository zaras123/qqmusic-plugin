import assert from 'node:assert/strict'
import {
  formatSearchMessage,
  mapLibraryItem,
  normalizeGroupIds,
  normalizePick,
  normalizeTargets,
} from '../dist/utils/library-web.js'

const item = mapLibraryItem({
  id: 'lib_abc123',
  songmid: '003abc',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  duration: 269,
  quality: 'flac',
  source: 'qq',
  filePresent: true,
  status: 'ok',
})
assert.equal(item.id, 'lib_abc123')
assert.equal(item.available, true)
assert.equal(mapLibraryItem({ id: 'lib_x', filePresent: false, status: 'missing' }).available, false)
assert.deepEqual(normalizeGroupIds('123456, 123456 987654'), ['123456', '987654'])
assert.deepEqual(normalizeTargets('onebot:10001|123456789'), [
  { platform: 'onebot:10001', uin: '10001', group_id: '123456789', name: '' },
])
assert.deepEqual(normalizeTargets('onebot|10001|123456789')[0].uin, '10001')
assert.equal(normalizePick('2', 5), 2)
assert.match(formatSearchMessage({ q: '晴天', total: 1, items: [item] }), /晴天 - 周杰伦/)
assert.match(formatSearchMessage({ q: '', total: 0, items: [] }), /暂时没有/)
console.log('karin library web helpers OK')
