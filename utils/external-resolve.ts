/**
 * External music links -> API resolver -> local-first playable song.
 * Types stay local because this boundary only receives untrusted API JSON.
 */
import { request } from './api.js'

export const EXTERNAL_LIMIT = 30

type ExternalPlatform = 'spotify' | 'apple' | 'bilibili'
type ExternalRef = {
  platform: ExternalPlatform
  kind: string
  id: string
  url: string
}

const LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  bilibili: 'B站',
}

const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist'])
const SAFE_APPLE_HOSTS = new Set(['music.apple.com', 'itunes.apple.com'])
const SAFE_BILI_HOSTS = new Set([
  'bilibili.com',
  'www.bilibili.com',
  'm.bilibili.com',
  'b23.tv',
  'www.b23.tv',
])

function cleanUrl(value = '') {
  return String(value)
    .trim()
    .replace(/[)\]}>，。；：！？、》」』"“”'`]+$/u, '')
}

function spotifyRefFromUrl(raw: string): ExternalRef | null {
  const uri = /spotify:(track|album|playlist):([A-Za-z0-9]{22})/i.exec(raw)
  if (uri) {
    return { platform: 'spotify', kind: uri[1].toLowerCase(), id: uri[2], url: raw }
  }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'open.spotify.com') return null
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .filter((part) => !/^intl-[a-z]{2}$/i.test(part))
  const kind = String(parts[0] || '').toLowerCase()
  const id = String(parts[1] || '')
  if (!SPOTIFY_KINDS.has(kind) || !/^[A-Za-z0-9]{22}$/.test(id)) return null
  return { platform: 'spotify', kind, id, url: url.toString() }
}

function appleRefFromUrl(raw: string): ExternalRef | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!SAFE_APPLE_HOSTS.has(url.hostname.toLowerCase())) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const albumAt = parts.findIndex((part) => part.toLowerCase() === 'album')
  const songAt = parts.findIndex((part) => part.toLowerCase() === 'song')
  const trackId = String(url.searchParams.get('i') || '').trim()
  if (trackId) {
    if (!/^\d+$/.test(trackId)) return null
    return { platform: 'apple', kind: 'track', id: trackId, url: url.toString() }
  }
  if (songAt >= 0) {
    const id = String(parts[songAt + 2] || '').replace(/\D/g, '')
    if (!id) return null
    return { platform: 'apple', kind: 'track', id, url: url.toString() }
  }
  if (albumAt >= 0) {
    const id = String(parts[albumAt + 2] || '').replace(/\D/g, '')
    if (!id) return null
    return { platform: 'apple', kind: 'album', id, url: url.toString() }
  }
  return null
}

function bilibiliRefFromUrl(raw: string): ExternalRef | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!SAFE_BILI_HOSTS.has(url.hostname.toLowerCase())) return null
  return {
    platform: 'bilibili',
    kind: 'video',
    id: (url.pathname.match(/\/(?:video\/)?(BV[A-Za-z0-9]+|av\d+)/i) || [])[1] || '',
    url: url.toString(),
  }
}

export function detectExternalRef(text = ''): ExternalRef | null {
  const source = String(text || '')
  const uri = source.match(/spotify:(?:track|album|playlist):[A-Za-z0-9]{22}/i)
  if (uri) {
    const found = spotifyRefFromUrl(uri[0])
    if (found) return found
  }
  const urls = source.match(/https?:\/\/[^\s<>"'`，。；：！？、（）【】《》]+/gi) || []
  for (const raw of urls) {
    const url = cleanUrl(raw)
    const found = spotifyRefFromUrl(url) || appleRefFromUrl(url) || bilibiliRefFromUrl(url)
    if (found) return found
  }
  const video = source.match(/\b(BV[1-9A-Za-z]{9,11}|av\d{5,})\b/)
  if (video) {
    return {
      platform: 'bilibili',
      kind: 'video',
      id: video[1],
      url: `https://www.bilibili.com/video/${video[1]}`,
    }
  }
  return null
}

export function isExternalMusicMessage(text = '') {
  const ref = detectExternalRef(text)
  return Boolean(ref && ref.platform !== 'bilibili')
}

export function platformLabelOf(platform = '') {
  return LABELS[String(platform).toLowerCase()] || String(platform || '外部平台')
}

function durationSeconds(value: unknown) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 86_400 ? Math.round(n / 1000) : Math.round(n)
}

export function externalCandidateToSong(
  candidate: Record<string, any> = {},
  metadata: Record<string, any> = {},
  ref: Partial<ExternalRef> = {}
) {
  const match = candidate?.match && candidate.match.songmid ? candidate.match : candidate
  if (!match || typeof match !== 'object' || !match.songmid) return null
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const title =
    match.songName ||
    match.songname ||
    match.name ||
    match.title ||
    meta.songName ||
    meta.songname ||
    meta.name ||
    meta.title ||
    ''
  const singer =
    match.singerName ||
    match.singername ||
    match.artist ||
    meta.singerName ||
    meta.singername ||
    meta.artist ||
    ''
  const duration = durationSeconds(match.interval || match.duration || meta.interval || meta.duration)
  const songmid = String(match.songmid || '')
  const local = match.local === true || match.playChannel === 'library'
  const channelKind = match.channelKind || (local ? 'local' : match.source && match.source !== 'qq' ? 'fill' : 'official')
  return {
    songmid,
    songid: match.songid || songmid,
    media_mid: match.media_mid || match.mediaId || songmid,
    songName: title || songmid,
    singerName: singer || '未知歌手',
    albumName: match.albumName || match.albumname || meta.albumName || meta.albumname || meta.album || '',
    cover: match.cover || meta.cover || '',
    interval: duration,
    duration: duration * 1000,
    source: match.source || '',
    sourceLabel: match.sourceLabel || '',
    quality: match.quality || '',
    qualityLabel: match.qualityLabel || '',
    local,
    channelKind,
    channelLabel: match.channelLabel || (channelKind === 'local' ? '本地音乐库' : channelKind === 'fill' ? '第三方填充渠道' : 'QQ音乐官方'),
    libraryId: match.libraryId || '',
    version: match.version || '',
    versionLabel: match.versionLabel || '',
    external: match.external === true || Boolean(match.source && match.source !== 'qq'),
    matchedBy: match.matchedBy || match.matchTried?.[0] || '',
    _detailFetched: true,
    _externalResolve: {
      platform: ref.platform || '',
      kind: ref.kind || '',
      url: ref.url || '',
      externalId: ref.id || '',
      matchedSource: match.source || '',
      local: match.local === true || match.playChannel === 'library',
    },
  }
}

function mappedTracks(rows: unknown, ref: ExternalRef) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => externalCandidateToSong(row, row, ref))
    .filter(Boolean)
}

function commonResult(ref: ExternalRef, extra: Record<string, any> = {}) {
  return {
    platform: ref.platform,
    label: platformLabelOf(ref.platform),
    kind: ref.kind,
    url: ref.url,
    id: ref.id,
    songs: [] as ReturnType<typeof externalCandidateToSong>[],
    matched: 0,
    total: 0,
    note: '',
    ...extra,
  }
}

export async function resolveExternalRef(
  ref: ExternalRef,
  { userKey = '', limit = EXTERNAL_LIMIT, local = true }: { userKey?: string; limit?: number; local?: boolean } = {}
) {
  if (!ref?.platform || !ref?.url) throw new Error('外部音乐链接无效')
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || EXTERNAL_LIMIT)))

  if (ref.platform === 'bilibili') {
    const body = await request('/bilibili/video', { url: ref.url, allPages: false }, 'get', userKey)
    const rows = body?.data?.list || []
    const songs = mappedTracks(rows, ref).slice(0, safeLimit)
    return commonResult(ref, {
      songs,
      matched: songs.length,
      total: Number(body?.data?.total || rows.length || 0),
      truncated: rows.length > songs.length,
    })
  }

  if (ref.kind === 'track') {
    const route = ref.platform === 'spotify' ? '/resolve/spotify' : '/resolve/apple'
    const body = await request(route, { url: ref.url, local: local ? 1 : 0 }, 'get', userKey)
    const data = body?.data || {}
    const metadata = ref.platform === 'spotify' ? data.spotify : data.apple
    const song = data.matched ? externalCandidateToSong(data.match, metadata, ref) : null
    return commonResult(ref, {
      songs: song ? [song] : [],
      matched: song ? 1 : 0,
      total: 1,
      note: data.note || '',
      metadata: metadata || null,
    })
  }

  const route =
    ref.platform === 'spotify'
      ? `/resolve/spotify/${ref.kind}`
      : '/resolve/apple/album'
  const body = await request(
    route,
    { url: ref.url, limit: safeLimit, match: 1, local: local ? 1 : 0 },
    'get',
    userKey
  )
  const data = body?.data || {}
  const rows = Array.isArray(data.tracks) ? data.tracks : []
  const songs = rows
    .filter((row: any) => row?.matched && row?.match?.songmid)
    .map((row: any) => externalCandidateToSong(row.match, row, ref))
    .filter(Boolean)
    .slice(0, safeLimit)
  const container = data[ref.kind] || data.album || data.playlist || {}
  return commonResult(ref, {
    songs,
    matched: songs.length,
    total: rows.length || Number(container.totalTracks || 0),
    truncated: Boolean(container.truncated || rows.length >= safeLimit),
    title: container.name || '',
    artist: container.artist || container.owner || '',
    cover: container.cover || '',
    note: data.note || '',
  })
}

