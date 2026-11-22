import assert from 'node:assert/strict'
import {
  formatSearchMessage,
  mapLibraryItem,
  normalizeGroupIds,
  normalizePick,
} from '../utils/library-web.js'

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
assert.equal(item.title, '晴天')
assert.equal(item.available, true)
assert.equal(mapLibraryItem({ id: 'lib_x', filePresent: false, status: 'missing' }).available, false)
assert.deepEqual(normalizeGroupIds('123456, 123456 987654'), ['123456', '987654'])
assert.deepEqual(normalizeGroupIds(['123456', 'bad']), ['123456'])
assert.equal(normalizePick('2', 5), 2)
assert.equal(normalizePick('99', 5), 5)

const text = formatSearchMessage({ q: '晴天', total: 1, items: [item] })
assert.match(text, /找到 1 首/)
assert.match(text, /1\. 晴天 - 周杰伦 · flac/)
assert.match(formatSearchMessage({ q: '', total: 0, items: [] }), /暂时没有/)

console.log('library web helpers OK')
