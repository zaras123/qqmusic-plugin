import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import YAML from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = fs.existsSync(path.join(root, 'utils/api.js')) ? path.join(root, 'utils') : path.join(root, 'dist/utils')
const componentRoot = fs.existsSync(path.join(root, 'components/Config.js')) ? path.join(root, 'components') : path.join(root, 'dist/components')
const { default: Config } = await import(pathToFileURL(path.join(componentRoot, 'Config.js')).href)
const { request, normalizeSearchItem } = await import(pathToFileURL(path.join(runtime, 'api.js')).href)
const { channelTagOf } = await import(pathToFileURL(path.join(runtime, 'library-compat.js')).href)
const { buildListCardData } = await import(pathToFileURL(path.join(runtime, 'card-data.js')).href)
const original = Config.getConfig
const queries = []
const server = http.createServer((req, res) => {
  queries.push(new URL(req.url, 'http://fixture').searchParams)
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ result: 100, data: {} }))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

test.after(async () => {
  Config.getConfig = original
  await new Promise(resolve => server.close(resolve))
})

test('Karin WebUI exposes local library switch and default stays enabled', () => {
  const cfg = YAML.parse(fs.readFileSync(path.join(root, 'config/default_config/qqmusic.yaml'), 'utf8'))
  const schema = fs.readFileSync(path.join(root, 'web/schemas.ts'), 'utf8')
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  assert.equal(cfg.localLibrary, true)
  assert.match(schema, /field: 'localLibrary'/)
  assert.match(readme, /raw\.githubusercontent\.com\/zaras123\/qqmusic-plugin\/karin\/resources\/img\/logo\.png/)
  assert.ok(fs.existsSync(path.join(root, 'docs/local-library.md')))
})

test('localLibrary=false is sent to search, playback and link resolution', async () => {
  const base = 'http://127.0.0.1:' + server.address().port
  Config.getConfig = () => ({ apiBase: base, apiToken: '', localLibrary: false, forceMasterAccount: false })
  await request('/search', { key: '晴天', t: 0, local: 1 }, 'get', 'u')
  await request('/song/url', { id: '003fixture', quality: 'flac' }, 'get', 'u')
  await request('/resolve/spotify', { url: 'https://open.spotify.com/track/x' }, 'get', 'u')
  assert.equal(queries.length, 3)
  assert.ok(queries.every(q => q.get('local') === '0'))
})

test('localLibrary=true keeps the API local-first request enabled', async () => {
  const base = 'http://127.0.0.1:' + server.address().port
  queries.length = 0
  Config.getConfig = () => ({ apiBase: base, apiToken: '', localLibrary: true, forceMasterAccount: false })
  await request('/search', { key: '晴天', t: 0 }, 'get', 'u')
  assert.notEqual(queries[0].get('local'), '0')
})

test('search normalization preserves all three plugin channels', () => {
  const local = normalizeSearchItem({ songmid:'bi_local', songName:'晴天', singerName:'周杰伦', quality:'128k', local:true, channelKind:'local', channelLabel:'本地音乐库 · B站', sourceLabel:'B站' })
  const official = normalizeSearchItem({ songmid:'003official', songName:'晴天', singerName:'周杰伦', channelKind:'official', channelLabel:'QQ音乐官方' })
  const fill = normalizeSearchItem({ songmid:'kw_fill', songName:'晴天', singerName:'周杰伦', source:'kuwo', quality:'128k', channelKind:'fill', channelLabel:'填充渠道 · 酷我', sourceLabel:'酷我' })
  assert.equal(local.channelKind, 'local')
  assert.equal(official.channelKind, 'official')
  assert.equal(fill.channelKind, 'fill')
  assert.match(channelTagOf(local), /^本地库 · B站 · 128k$/)
  assert.equal(channelTagOf(official), 'QQ音乐官方')
  assert.match(channelTagOf(fill), /^填充 · 酷我 · 128k$/)
  const card = buildListCardData('晴天', [local, official, fill], {})
  assert.equal(card.songs[0].sourceTag, '本地库 · B站 · 128k')
  assert.equal(card.songs[1].sourceTag, 'QQ音乐官方')
  assert.equal(card.songs[2].sourceTag, '填充 · 酷我 · 128k')
  assert.deepEqual(card.sourceCounts.map((x) => x.label), ['本地 · B站', 'QQ官方', '填充 · 酷我'])
})
