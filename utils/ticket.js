// Pure ticket command/data helpers; prices from the API are already in yuan.
export const RE_TICKET = /^#?qqm\s*(?:(近期|未来|往期|历史|全部|进行中))?(演唱会|演出|票务)([\s\S]*)$/i
export const TICKET_PAGE_SIZE = 6
const STATUS = { 近期: 'soon', 未来: 'upcoming', 往期: 'past', 历史: 'past', 全部: 'all', 进行中: 'ongoing' }
const LABEL = { soon: '近期七天', upcoming: '未来及进行中', past: '往期', all: '全部', ongoing: '进行中' }
export const TICKET_NOTICE = '历史记录仅覆盖已归档演出，并非完整历史；时间、票价与余票以购票页为准。'
export const TICKET_HELP = [
  '【演出票务】',
  '#qqm演唱会 / #qqm近期演唱会 / #qqm往期演唱会',
  '#qqm演唱会 宋雨琦 / #qqm演出 北京 / #qqm演出 音乐节',
  '直接写艺人、城市或关键词即可；精确筛选用 城市= 艺人= 关键词=。',
  '#qqm演出 全部 页=2 / #qqm演出下一页 / #qqm演出上一页',
  '#qqm演出详情1 / #qqm演出详情 e21325',
  '#qqm演出城市 / #qqm演出分类',
  '查询会自动补全本地缺失的实时演出并保存；历史记录仍只覆盖已归档场次。',
  '演出按自己的查询列表选序号，十分钟内有效；与点歌列表独立。',
  TICKET_NOTICE,
].join('\n')

function positiveInt(raw) {
  if (!/^\d+$/.test(String(raw))) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export function parseTicketCommand(text = '') {
  const input = String(text).trim()
  if (/^#?qqm\s*演出详情/i.test(input)) {
    const detail = input.match(/^#?qqm\s*演出详情(.*)$/i)
    const id = detail?.[1]?.trim().toLowerCase() || ''
    if (/^[em]\d+$/.test(id) && positiveInt(id.slice(1))) return { action: 'detail', key: id }
    const index = positiveInt(id)
    return index ? { action: 'detail', index } : { error: '详情请填写当前页序号或演出编号，例如 #qqm演出详情1 或 #qqm演出详情 e21325' }
  }
  const m = input.match(RE_TICKET)
  if (!m) return null
  const tail = m[3].trim()
  if (tail === '帮助') return { action: 'help' }
  if (tail === '城市' || tail === '分类') return { action: tail === '城市' ? 'cities' : 'categories' }
  if (tail === '下一页' || tail === '上一页') return { action: 'page', delta: tail === '下一页' ? 1 : -1 }
  if (tail.startsWith('同步')) {
    const target = tail.slice(2).trim()
    if (!target || target.length > 30) return { error: '请填写城市或艺人名，例如 #qqm演出同步 北京 / #qqm演出同步 宋雨琦（仅主人）' }
    if (/[=：:]/.test(target)) return { error: '同步直接写城市或艺人名即可，例如 #qqm演出同步 北京。' }
    return { action: 'sync', city: target }
  }
  const filters = {
    status: STATUS[m[1]] || 'upcoming',
    category: '',
    group: m[2] === '演唱会' ? 'concert' : '',
    city: '',
    artist: '',
    q: '',
    page: 1,
    pageSize: TICKET_PAGE_SIZE,
  }
  const words = tail.split(/\s+/).filter(Boolean)
  if (STATUS[words[0]]) filters.status = STATUS[words.shift()]
  const keywords = []
  const names = { 城市: 'city', 分类: 'category', 艺人: 'artist', 歌手: 'artist', 关键词: 'q', 页: 'page' }
  for (const word of words) {
    const pair = /^([^=：:]+)[=：:]([\s\S]*)$/.exec(word)
    if (!pair) { keywords.push(word); continue }
    const key = names[pair[1]]
    if (!key) return { error: `不支持的筛选项：${pair[1]}。可用：城市、分类、艺人、关键词、页。` }
    const value = pair[2].trim()
    if (!value) return { error: `请填写${pair[1]}。` }
    if (key === 'page') {
      const n = positiveInt(value)
      if (!n || n > 100000) return { error: '页码必须为 1 到 100000 的整数。' }
      filters.page = n
    } else filters[key] = value === '全部' && key !== 'q' ? '' : value
  }
  filters.q = [filters.q, ...keywords].filter(Boolean).join(' ')
  if ([filters.city, filters.artist, filters.category, filters.q].some((v) => v.length > 100)) return { error: '筛选内容过长，请缩短到 100 字以内。' }
  return { action: 'list', filters }
}

export function ticketScope(e) {
  return `ticket:${JSON.stringify([String(e.self_id || e.bot?.uin || ''), e.group_id ? 'group' : 'private', String(e.group_id || e.user_id || '')])}`
}

function text(value, fallback = '') {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim() || fallback
}

export function ticketPrice(min, max = min) {
  const lo = Number(min), hi = Number(max)
  const validLo = min != null && min !== '' && Number.isFinite(lo) && lo > 0
  const validHi = max != null && max !== '' && Number.isFinite(hi) && hi > 0
  const yuan = (n) => String(Math.round(n * 100) / 100)
  if (!validLo && !validHi) return '票价待公布'
  if (validLo && validHi && hi > lo) return `${yuan(lo)} - ${yuan(hi)} 元`
  return `${yuan(validLo ? lo : hi)} 元${!validHi ? '起' : ''}`
}

// Only official public ticket links are ever sent; never expose API token URLs.
export function ticketLink(raw) {
  try {
    const u = new URL(String(raw || ''))
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port) return ''
    if (!/(^|\.)(qq\.com|kugou\.com|e-piaopiao\.com)$/.test(u.hostname)) return ''
    if ([...u.searchParams.keys()].some((k) => /token|cookie|secret|key/i.test(k))) return ''
    return u.href
  } catch { return '' }
}

function posterUrl(raw) {
  try {
    const u = new URL(String(raw || ''))
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && /(^|\.)(qq\.com|qpic\.cn|gtimg\.cn|kugou\.com|kgimg\.com)$/.test(u.hostname) ? u.href : ''
  } catch { return '' }
}

function range(start, end) {
  const a = text(start, '时间待公布'), b = text(end)
  return b && b !== a ? `${a} 至 ${b}` : a
}

export function ticketRow(show = {}, index = 1) {
  const artist = text(show.artist, '艺人待公布')
  return {
    index, key: text(show.key), name: text(show.name, '未命名演出'),
    artist: show.artistSource === 'guessed' ? `${artist}（根据标题推测）` : artist,
    city: text(show.city, '城市待公布'), venue: text(show.venue, '场馆待公布'), address: text(show.address),
    category: text(show.category), when: range(show.start, show.end),
    status: ({ past: '已结束', ongoing: '进行中', soon: '七天内开演', upcoming: '未开始' })[show.status] || '时间待确认',
    price: ticketPrice(show.minPrice, show.maxPrice), soldOut: show.soldOut === true,
    poster: posterUrl(show.poster), link: ticketLink(show.link),
  }
}

function updateTime(value) {
  const n = Number(value)
  if (!n || !Number.isFinite(n)) return '暂无更新记录'
  const d = new Date(n + 8 * 3600000)
  return Number.isNaN(d.getTime()) ? '暂无更新记录' : d.toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）'
}

export function buildTicketList(data, filters) {
  const rows = data.list.map((s, i) => ticketRow(s, i + 1))
  const auto = data.meta?.refresh || {}
  const label = filters.group === 'concert' ? '演唱会' : (filters.category || '演出')
  const refreshed = auto.attempted
    ? `本次自动补全：新增 ${Number(auto.added) || 0} 场 / 更新 ${Number(auto.updated) || 0} 场`
    : '档案缓存'
  const empty = Number(data.meta?.count) === 0
    ? (auto.attempted ? '已自动查询实时演出，但没有返回数据；请指定城市或稍后再试。' : '档案库尚未收录演出，请联系主人同步城市。')
    : (auto.attempted ? '没有符合条件的结果；已自动查询实时演出，可换个城市或关键词再试。' : '没有符合条件的已归档演出。')
  return {
    title: `${LABEL[filters.status] || '全部'}${label}`, detail: false,
    subtitle: [filters.city || '全国', filters.artist, filters.q].filter(Boolean).join(' / '),
    rows, pageText: `第 ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))} 页，共 ${data.total} 场`,
    notice: TICKET_NOTICE, updated: `档案更新：${updateTime(data.meta?.updatedAt)} · ${refreshed}`,
    empty,
  }
}

export function buildTicketDetail(show) {
  const row = ticketRow(show)
  const sessions = (Array.isArray(show.sessions) ? show.sessions : []).map((s) => ({
    name: text(s.name, '演出场次'), when: range(s.start, s.end),
    sale: s.saleStart ? `开售：${text(s.saleStart)}` : '',
    tiers: (Array.isArray(s.tiers) ? s.tiers : []).map((t) => ({
      level: text(t.level, '票档'), price: ticketPrice(t.price), state: t.soldOut === true ? '已售罄' : '余票以购票页为准',
    })),
  }))
  return {
    title: row.name, detail: true, subtitle: [row.city, row.category, row.key].filter(Boolean).join(' / '),
    row, sessions, songs: (Array.isArray(show.songs) ? show.songs : []).map((s) => text(s)).filter(Boolean),
    summary: text(show.summary), notice: TICKET_NOTICE,
    sourceNote: show.dataSource === 'archive' ? '档案记录，非实时票务状态' : '详情来自上游查询或短期缓存',
    warning: show.warnings?.length ? '部分详情暂不可用，以下内容可能包含档案回退数据。' : '',
    sale: show.saleStart ? `开售：${text(show.saleStart)}` : '',
  }
}

export function formatTicketList(data) {
  return [
    `【${data.title}】${data.subtitle}`, data.pageText,
    ...data.rows.map((s) => `${s.index}. ${s.name} [${s.status}]\n艺人：${s.artist}\n${s.when}\n${s.city} / ${s.venue}\n${s.price}${s.soldOut ? ' / 已售罄' : ''}`),
    !data.rows.length ? data.empty : '', data.updated, data.notice,
  ].filter(Boolean).join('\n\n')
}

export function formatTicketDetail(data) {
  const s = data.row
  return [
    `【${s.name}】`, `${s.status} / ${s.price}${s.soldOut ? ' / 已售罄' : ''}`,
    `艺人：${s.artist}`, s.when, `${s.city} / ${s.venue}`, s.address, data.sale,
    data.sourceNote, data.warning,
    ...data.sessions.map((session) => [session.name, session.when, session.sale, ...session.tiers.map((t) => `${t.level}：${t.price}（${t.state}）`), !session.tiers.length ? '票档待公布' : ''].filter(Boolean).join('\n')),
    !data.sessions.length ? '暂无场次与票档信息' : '',
    `简介提及曲目（不代表实际歌单）：${data.songs.length ? data.songs.join('、') : '暂无信息'}`,
    data.summary, data.notice,
  ].filter(Boolean).join('\n')
}

export function ticketError(error) {
  const msg = String(error?.message || '')
  if (msg.includes('HTTP 404')) return '票务接口不存在，请主人更新 qqmusic-api-enhanced。'
  if (/401|鉴权/.test(msg)) return '票务接口鉴权失败，请主人检查 API 密钥配置。'
  if (/403/.test(msg)) return '票务接口拒绝访问，请主人检查服务端访问权限。'
  if (/429/.test(msg)) return '查询过于频繁，请稍后重试。'
  if (/timeout|超时|ECONNABORTED/i.test(msg)) return '票务请求超时，请稍后重试；同步可能仍在服务端继续。'
  if (error?.code === 404) return '演出不存在或尚未归档，请重新查询列表。'
  return '演出查询失败，请稍后重试或联系主人检查票务服务。'
}
