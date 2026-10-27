/** Offline external-link resolver test; uses a local API fixture only. */
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = root
const load = (file) => import(pathToFileURL(path.join(runtime, file)).href)
const { default: Config } = await load('components/Config.js')
const cfg = {
  enable: true,
  enableResolve: true,
  resolveLinks: true,
  resolveExternal: true,
  apiBase: '',
  apiToken: 'external-fixture-token',
  forceMaster: false,
}
Config.getConfig = () => cfg
const helpers = await load('utils/external-resolve.js')
const { qqmusicResolve } = await load('apps/resolve.js')

let count = 0
const check = (name, value) => {
  assert.ok(value, name)
  count++
  console.log(`PASS ${name}`)
}
const calls = []
const track = {
  songmid: 'bi_BV1LocalTrack',
  songName: '晴天',
  singerName: '周杰伦',
  source: 'bilibili',
  quality: '192k',
  local: true,
  libraryId: 'lib_fixture',
  version: 'live',
  versionLabel: '现场',
  duration: 8,
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) })
  res.setHeader('Content-Type', 'application/json')
  const ok = (data) => res.end(JSON.stringify({ result: 100, data }))
  if (url.pathname === '/resolve/spotify') {
    return ok({
      spotify: { id: 'T'.repeat(22), name: '晴天', artist: '周杰伦', duration: 8000 },
      match: track,
      matched: true,
      note: '本地曲库命中',
    })
  }
  if (url.pathname === '/resolve/spotify/playlist') {
    return ok({
      playlist: { name: '通勤歌单', owner: 'fixture', totalTracks: 2 },
      tracks: [
        { ...track, matched: true, match: track },
        {
          name: '没有音源',
          artist: '未知',
          matched: false,
          match: null,
        },
      ],
    })
  }
  if (url.pathname === '/resolve/apple') {
    return ok({
      apple: { id: '123', name: '稻香', artist: '周杰伦', duration: 8000 },
      match: { ...track, songmid: '003AppleLocal', songName: '稻香' },
      matched: true,
    })
  }
  if (url.pathname === '/resolve/apple/album') {
    return ok({
      album: { name: '魔杰座', artist: '周杰伦', totalTracks: 1 },
      tracks: [
        {
          name: '稻香',
          artist: '周杰伦',
          matched: true,
          match: { ...track, songmid: '003AppleAlbum', songName: '稻香' },
        },
      ],
    })
  }
  if (url.pathname === '/bilibili/video') {
    return ok({
      list: [
        {
          songmid: 'bi_BV1Video',
          songName: 'B站样本',
          singerName: 'UP主',
          source: 'bilibili',
          quality: '132k',
          duration: 8000,
        },
      ],
      total: 1,
    })
  }
  res.statusCode = 404
  res.end(JSON.stringify({ result: 404, errMsg: 'missing fixture route' }))
})

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  cfg.apiBase = `http://127.0.0.1:${server.address().port}`

  check(
    '识别 Spotify 国际区单曲链接',
    helpers.detectExternalRef('https://open.spotify.com/intl-zh/track/' + 'T'.repeat(22) + '?si=x')
      ?.kind === 'track'
  )
  check(
    '识别 Spotify URI',
    helpers.detectExternalRef(`spotify:album:${'A'.repeat(22)}`)?.platform === 'spotify'
  )
  check(
    '识别 Apple 单曲 ?i= 形式',
    helpers.detectExternalRef(
      'https://music.apple.com/cn/album/example/123?i=456'
    )?.kind === 'track'
  )
  check(
    '识别 Apple 专辑链接',
    helpers.detectExternalRef('https://music.apple.com/cn/album/example/123')?.kind === 'album'
  )
  check(
    '识别 B站标准链接和短链',
    helpers.detectExternalRef('https://www.bilibili.com/video/BV1xx411c7mD')?.platform ===
      'bilibili' &&
      helpers.detectExternalRef('https://b23.tv/abc')?.platform === 'bilibili' &&
      helpers.detectExternalRef('BV1xx411c7mD')?.id === 'BV1xx411c7mD'
  )
  check(
    '拒绝对相似伪域名做外部解析',
    helpers.detectExternalRef('https://open.spotify.com.evil.example/track/' + 'T'.repeat(22)) ===
      null
  )

  const spotifyTrack = helpers.detectExternalRef(
    `https://open.spotify.com/track/${'T'.repeat(22)}`
  )
  const single = await helpers.resolveExternalRef(spotifyTrack, { userKey: 'listener' })
  check(
    'Spotify 单曲请求走 /resolve/spotify 并带账号槽位',
    calls.at(-1).path === '/resolve/spotify' &&
      calls.at(-1).query.userKey === 'listener' &&
      calls.at(-1).query.local === '1'
  )
  check(
    '本地命中保留实际来源、版本和192k音质',
    single.songs[0].local &&
      single.songs[0].source === 'bilibili' &&
      single.songs[0].version === 'live' &&
      single.songs[0].quality === '192k'
  )

  const playlist = await helpers.resolveExternalRef(
    helpers.detectExternalRef(`https://open.spotify.com/playlist/${'P'.repeat(22)}`)
  )
  check(
    '歌单请求开启匹配并限制本次30首',
    calls.at(-1).path === '/resolve/spotify/playlist' &&
      calls.at(-1).query.match === '1' &&
      calls.at(-1).query.limit === '30'
  )
  check(
    '歌单只保留有可播音源的条目并保留总数',
    playlist.songs.length === 1 && playlist.matched === 1 && playlist.total === 2
  )

  const appleTrack = await helpers.resolveExternalRef(
    helpers.detectExternalRef('https://music.apple.com/cn/album/example/123?i=456')
  )
  const appleAlbum = await helpers.resolveExternalRef(
    helpers.detectExternalRef('https://music.apple.com/cn/album/example/123')
  )
  check(
    'Apple 单曲和专辑分别调用正确路由',
    calls.some((c) => c.path === '/resolve/apple') &&
      calls.some((c) => c.path === '/resolve/apple/album') &&
      appleTrack.songs[0].songmid === '003AppleLocal' &&
      appleAlbum.songs[0].songmid === '003AppleAlbum'
  )

  const bili = await helpers.resolveExternalRef(
    helpers.detectExternalRef('https://www.bilibili.com/video/BV1xx411c7mD')
  )
  check(
    'B站视频走官方视频元数据并保留原音轨',
    calls.at(-1).path === '/bilibili/video' &&
      bili.songs[0].songmid === 'bi_BV1Video' &&
      bili.songs[0].quality === '132k'
  )

  const resolver = new qqmusicResolve()
  const rule = resolver.rule[0]
  const reg = rule.reg instanceof RegExp ? rule.reg : new RegExp(String(rule.reg))
  check(
    '插件消息路由会进入 Spotify、Apple 和B站链接',
    reg.test(`https://open.spotify.com/track/${'T'.repeat(22)}`) &&
      reg.test('https://music.apple.com/cn/album/example/123') &&
      reg.test('https://www.bilibili.com/video/BV1xx411c7mD')
  )

  let seen = ''
  resolver.handle = async (_e, text) => {
    seen = text
    return true
  }
  const handled = await resolver.resolve({
    msg: `分享歌曲 https://open.spotify.com/track/${'T'.repeat(22)}`,
    user_id: 'listener',
  })
  check(
    'resolve 入口识别非QQ音乐分享并交给统一处理器',
    handled && seen.includes('open.spotify.com')
  )

  console.log(`RESULT: ${count} passed`)
} finally {
  await new Promise((resolve) => server.close(resolve))
}
