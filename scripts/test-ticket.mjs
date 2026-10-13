import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import { parseTicketCommand, ticketPrice, ticketLink, ticketRow, ticketScope, buildTicketList, buildTicketDetail, formatTicketList, formatTicketDetail } from '../utils/ticket.js'
import { setSession, getUserSession } from '../utils/session.js'
import { ticketArchive, ticketShow, ticketOptions, ticketSync } from '../utils/ticket-api.js'
import Config from '../components/Config.js'

test('parses ticket commands and rejects malformed filters', () => {
  const concert = parseTicketCommand('#qqm演唱会').filters
  assert.equal(concert.status, 'upcoming')
  assert.equal(concert.group, 'concert')
  assert.equal(concert.category, '')
  const past = parseTicketCommand('#qqm往期演唱会 周杰伦 城市=北京 页=2').filters
  assert.deepEqual([past.status, past.city, past.q, past.page], ['past', '北京', '周杰伦', 2])
  assert.equal(parseTicketCommand('#qqm演出 进行中 艺人=林俊杰').filters.status, 'ongoing')
  assert.ok(parseTicketCommand('#qqm演出 城市=').error)
  assert.ok(parseTicketCommand('#qqm演出 页=0').error)
  assert.ok(parseTicketCommand('#qqm演出 xxx=y').error)
  assert.deepEqual(parseTicketCommand('#qqm演出详情 m123'), { action: 'detail', key: 'm123' })
  assert.ok(parseTicketCommand('#qqm演出详情0').error)
  assert.equal(parseTicketCommand('#qqm演出同步 北京海淀').city, '北京海淀')
  assert.ok(parseTicketCommand('#qqm演出同步 北京 上海').error)
})

test('normalizes yuan prices and restricts outbound links', () => {
  assert.equal(ticketPrice(380, 1080), '380 - 1080 元')
  assert.equal(ticketPrice(380, 380), '380 元')
  assert.equal(ticketPrice(380, 0), '380 元起')
  assert.equal(ticketPrice(0, 0), '票价待公布')
  for (const raw of ['javascript:alert(1)', 'https://evil.test/', 'https://user:pass@y.qq.com/path', 'https://y.qq.com/path?apiToken=secret']) assert.equal(ticketLink(raw), '')
  assert.equal(ticketLink('https://y.qq.com/path'), 'https://y.qq.com/path')
})

test('renders truthful archive data and page-local indexes', () => {
  assert.equal(ticketRow({}).price, '票价待公布')
  assert.match(ticketRow({ artist: '歌手', artistSource: 'guessed' }).artist, /推测/)
  const data = buildTicketList({ list: [{ key: 'e1' }], page: 2, pageSize: 6, total: 7, meta: { count: 0 } }, { status: 'past', category: '演唱会', city: '', artist: '', q: '', page: 2, pageSize: 6 })
  assert.equal(data.rows[0].index, 1)
  assert.match(data.empty, /尚未收录/)
  assert.match(formatTicketList(data), /历史记录仅覆盖已归档/)
  const live = buildTicketList(
    { list: [], page: 1, pageSize: 6, total: 0, meta: { count: 0, refresh: { attempted: true, added: 2, updated: 1 } } },
    { status: 'upcoming', group: 'concert', category: '', city: '', artist: '', q: '', page: 1, pageSize: 6 }
  )
  assert.match(live.title, /演唱会/)
  assert.match(live.updated, /自动补全/)
  assert.match(live.empty, /实时演出/)
  const detail = buildTicketDetail({ key: 'e1', name: '演唱会', dataSource: 'archive', songs: ['晴天'], sessions: [{ tiers: [{ price: 380, soldOut: true }] }] })
  const text = formatTicketDetail(detail)
  assert.match(text, /简介提及曲目（不代表实际歌单）/)
  assert.match(text, /档案记录，非实时/)
  assert.match(text, /已售罄/)
  assert.equal(ticketScope({ self_id: 9, group_id: 7, user_id: 11 }), ticketScope({ self_id: 9, group_id: 7, user_id: 22 }))
})

test('each sender keeps an independent ticket list inside a shared group', async () => {
  const scope = ticketScope({ self_id: 9, group_id: 7, user_id: 11 })
  await setSession(scope, { type: 'ticket', user_id: 'ticket-user-11', data: [{ key: 'e11' }] }, 60)
  await setSession(scope, { type: 'ticket', user_id: 'ticket-user-22', data: [{ key: 'e22' }] }, 60)
  assert.equal((await getUserSession(scope, 'ticket-user-11')).data[0].key, 'e11')
  assert.equal((await getUserSession(scope, 'ticket-user-22')).data[0].key, 'e22')
  assert.equal(await getUserSession(scope, 'ticket-user-33'), null)
})

test('ticket API sends filters, detail IDs and one-city sync with bounded timeout', async () => {
  const originalConfig = Config.getConfig
  const originalAdapter = axios.defaults.adapter
  const calls = []
  try {
    Config.getConfig = () => ({ apiBase: 'https://ticket.test', apiToken: 'test-token' })
    axios.defaults.adapter = async (config) => {
      calls.push(config)
      let data = {}
      if (config.url.endsWith('/archive')) data = { list: [{ key: 'e1', name: '测试演出' }], total: 1, page: 1, meta: { count: 1 } }
      if (config.url.endsWith('/show')) data = { key: 'e1', name: '测试演出' }
      if (config.url.endsWith('/cities')) data = { cities: [{ name: '北京' }] }
      if (config.url.endsWith('/categories')) data = { list: [{ name: '演唱会' }] }
      if (config.url.endsWith('/sync')) data = { store: { shows: 1 }, errors: [] }
      return { data: { result: 100, data }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const filters = { status: 'past', city: '北京', category: '演唱会', page: 1, pageSize: 6 }
    const archive = await ticketArchive(filters, '42')
    assert.equal(archive.list[0].key, 'e1')
    assert.equal(archive.pageSize, 6)
    assert.equal((await ticketShow('e1', '42')).name, '测试演出')
    assert.equal((await ticketOptions('cities', '42'))[0].name, '北京')
    assert.equal((await ticketOptions('categories', '42'))[0].name, '演唱会')
    assert.equal((await ticketSync('北京', '42')).store.shows, 1)
    assert.deepEqual(calls.map((c) => c.url.split('/').at(-1)), ['archive', 'show', 'cities', 'categories', 'sync'])
    assert.deepEqual(calls[0].params, { ...filters, userKey: '42' })
    assert.equal(calls[1].params.id, 'e1')
    assert.equal(calls[4].method, 'post')
    assert.deepEqual(JSON.parse(calls[4].data), { city: '北京', limit: 1, detailLimit: 80, userKey: '42' })
    assert.equal(calls[4].timeout, 180000)
    assert.equal(calls[4].headers['x-api-token'], 'test-token')
  } finally {
    Config.getConfig = originalConfig
    axios.defaults.adapter = originalAdapter
  }
})
