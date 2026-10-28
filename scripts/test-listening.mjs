/** Local HTTP and real plugin modules. No real platform account or external network is used. */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = fs.existsSync(path.join(repo, 'utils/listening.js')) ? repo : path.join(repo, 'dist')
const load = rel => import(pathToFileURL(path.join(runtime, rel)).href)
const { default: Config } = await load('components/Config.js')
const originalConfig = Config.getConfig
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqm-plugin-listening-'))
process.env.QQMUSIC_STATS_FILE = path.join(temp, 'stats.json')
let base, requests = [], records = [], planRecords = [], next = 1, redirect = false, badProfile = false, searchGate, boundOwner = '', kgOwn = true, tokenMeta = {}
const owner = { userKey: 'fixture-user', messageId: 'fixture-message', selfId: 'fixture-bot' }
const makeJob = (extra = {}) => ({ id: 'fixture-job-' + next++, platform: 'qq', status: 'queued', requestedSeconds: 600,
  submittedSeconds: 0, confirmedDelta: 0, inFlightSeconds: 0, metric: '', ...extra })
const server = http.createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk
  const url = new URL(req.url, 'http://fixture'), body = raw ? JSON.parse(raw) : {}, query = Object.fromEntries(url.searchParams)
  requests.push({ path: url.pathname, method: req.method, body, query, headers: req.headers })
  const send = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result: 100, data })) }
  if (url.pathname === '/login/status') { send({ userKey: boundOwner || query.userKey, bound: !!boundOwner, login: false, ...tokenMeta }); return }
  if (redirect && url.pathname === '/listening/start') { res.writeHead(303, { Location: '/unexpected-redirect' }); res.end(); return }
  if (url.pathname === '/kugou/status') { send({ loggedIn: true, hasOwn: kgOwn, source: kgOwn ? 'user' : 'shared-file' }); return }
  if (url.pathname === '/search') {
    if (searchGate) await searchGate
    send({ list: [{ songmid: '003fixtureQQ01', songname: '晴天', source: 'qq' }] }); return
  }
  if (url.pathname === '/listening/start') {
    const prior = records.find(j => j.requestId === body.requestId)
    if (prior) { send(prior); return }
    const job = makeJob({ platform: body.platform, requestedSeconds: body.minutes * 60, requestId: body.requestId }); records.unshift(job); send(job); return
  }
  if (url.pathname === '/listening/jobs') { send(records); return }
  if (url.pathname === '/listening/plans') { send(planRecords); return }
  if (url.pathname === '/listening/plan/add') {
    const plan = { id:'listen_fixture1234',platform:body.platform,targetType:body.targetType,target:body.target,roundSeconds:body.roundSeconds,
      repeat:body.repeat,totalRounds:body.totalRounds,scheduleTime:body.scheduleTime,status:'idle',statusLabel:'等待计划',currentJob:'',lastError:'',roundsCompleted:0,roundDisplay:'0/'+(body.repeat==='continuous'?'持续':body.totalRounds) }
    planRecords.unshift(plan); send(plan); return
  }
  if (url.pathname === '/listening/plan/action') { send(planRecords.find(p => p.id === body.id) || { changed:true }); return }
  if (url.pathname === '/listening/job' || url.pathname === '/listening/stop') {
    const id = body.id || query.id, job = records.find(j => j.id === id)
    if (!job) { res.statusCode = 404; res.end('{}'); return }
    if (url.pathname.endsWith('/stop')) job.status = 'stopped'
    if (query.refresh === '1') { job.status = 'completed'; job.confirmedDelta = job.requestedSeconds }
    send(job); return
  }
  if (url.pathname === '/listening/profile') { send({ seconds: badProfile ? null : 3600, metric: query.platform === 'qq' ? 'today' : 'total' }); return }
  res.statusCode = 404; res.end('{}')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port
Config.getConfig = () => ({ apiBase: base, apiToken: 'synthetic-plugin-token', publicAccount: 'other-public-owner', forceMasterAccount: true })
const M = await load('utils/listening.js'), API = await load('utils/api.js'), H = await load('utils/help-card.js')
const client = M.createListeningClient()
const run = text => client.execute(M.parseListeningCommand(text), owner)
const reset = () => { requests = []; records = []; planRecords = []; redirect = false; badProfile = false; searchGate = undefined; boundOwner = ''; kgOwn = true; tokenMeta = {} }
after(async () => { Config.getConfig = originalConfig; await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }) })

test('all help examples parse and do not overlap local stats or song selection', () => {
  for (const item of M.LISTENING_HELP_SECTION.items) assert.notEqual(M.parseListeningCommand(item.example)?.action, 'invalid', item.example)
  for (const text of ['#qqm听歌', '#qqm听歌榜', '#qqm听1', '#qqm勋章', '#qqm点歌 晴天']) assert.equal(M.parseListeningCommand(text), null)
  assert.equal(M.parseListeningCommand('#QQM刷歌 KG 1 确认').platform, 'kugou')
  assert.equal(M.parseListeningCommand('#qqm刷歌 10 晴天 确认').platform, 'qq')
  assert.equal(M.parseListeningCommand('#qqm刷歌计划 QQ 歌手 周杰伦 60 一直 00:05 确认').targetType, 'singer')
  assert.equal(M.parseListeningCommand('#qqm刷歌计划 QQ 专辑 叶惠美 60 20次 00:05 确认').totalRounds, 20)
  assert.equal(M.parseListeningCommand('#qqm刷歌计划暂停 listen_0123456789abcdef 确认').operation, 'pause')
})
test('bad parameters and missing confirmation make no HTTP calls', async () => {
  reset()
  for (const text of ['#qqm刷歌 QQ 10 晴天', '#qqm刷歌停止', '#qqm刷歌 QQ 0 晴天 确认', '#qqm刷歌 QQ 1441 晴天 确认',
    '#qqm刷歌 QQ 1.5 晴天 确认', '#qqm刷歌 QQ 1 确认', '#qqm刷歌 酷狗 1 晴天 确认', '#qqm刷歌 网易云 10 确认', '#qqm刷歌统计 constructor']) {
    assert.equal(M.parseListeningCommand(text).action, 'invalid', text); await run(text)
  }
  assert.equal(requests.length, 0)
})
test('QQ keyword uses official-only search then confirmed JSON POST under own account', async () => {
  reset(); const text = await run('#qqm刷歌 QQ 10 晴天 确认')
  assert.match(text, /官方匹配：晴天/); assert.match(text, /排队中/)
  const [, search, start] = requests
  assert.equal(search.path, '/search'); assert.equal(search.query.local, '0'); assert.equal(search.query.fill, '0')
  assert.equal(start.path, '/listening/start'); assert.equal(start.method, 'POST'); assert.equal(start.body.id, '003fixtureQQ01'); assert.equal(start.body.confirm, 1)
  assert.equal(start.headers['x-qqmusic-user'], owner.userKey); assert.equal(start.body.userKey, owner.userKey)
  assert.equal(start.headers['x-qqmusic-public-user'], undefined); assert.equal(start.body.publicUserKey, undefined)
  assert.match(start.body.requestId, /^[A-Za-z0-9_.-]{1,80}$/)
})
test('a direct QQ songmid skips searching', async () => {
  reset(); await run('#qqm刷歌 QQ 2 003fixtureQQ01 确认')
  assert.equal(requests.length, 2); assert.equal(requests[1].body.minutes, 2)
})
test('Kugou starts without a song identifier', async () => {
  reset(); await run('#qqm刷歌 酷狗 10 确认')
  assert.equal(requests.length, 3); assert.equal(requests[2].body.platform, 'kugou'); assert.equal(requests[2].body.id, undefined)
})
test('the same delivered message has a stable idempotency key', async () => {
  reset(); await run('#qqm刷歌 酷狗 1 确认'); await run('#qqm刷歌 酷狗 1 确认')
  assert.equal(records.length, 1); const starts = requests.filter(r => r.path === '/listening/start'); assert.equal(starts[0].body.requestId, starts[1].body.requestId)
})
test('concurrent starts from the same user are blocked before a second write', async () => {
  reset(); let release; searchGate = new Promise(resolve => { release = resolve })
  const first = run('#qqm刷歌 QQ 1 晴天 确认')
  await assert.rejects(() => run('#qqm刷歌 酷狗 1 确认'), { listeningCode: 'client-busy' })
  release(); await first; assert.equal(requests.filter(r => r.path === '/listening/start').length, 1)
})
test('status reads saved state without requesting platform statistics', async () => {
  reset(); records = [makeJob({ status: 'running' })]
  assert.match((await run('#qqm刷歌状态')).text, /提交中/)
  assert.deepEqual(requests.map(r => r.path).slice(0,3).sort(), ['/listening/jobs','/listening/plans','/login/status'])
  assert.ok(!requests.some(r => r.path === '/listening/job'))
})
test('platform selector stops the intended job with confirmed POST', async () => {
  reset(); const qq = makeJob({ platform: 'qq', status: 'running' }), kg = makeJob({ platform: 'kugou', status: 'running' }); records = [qq, kg]
  assert.match(await run('#qqm刷歌停止 酷狗 确认'), /已停止/)
  const stop = requests[2]; assert.equal(stop.method, 'POST'); assert.equal(stop.body.id, kg.id); assert.equal(stop.body.confirm, 1); assert.equal(qq.status, 'running')
})
test('foreign task IDs never reach the get or stop endpoint even with a master API token', async () => {
  reset(); records = [makeJob()]
  for (const text of ['#qqm刷歌状态 foreign-task', '#qqm刷歌停止 foreign-task 确认', '#qqm刷歌刷新 foreign-task']) await assert.rejects(() => run(text), { listeningCode: 'not-owned' })
  assert.ok(requests.every(r => ['/login/status','/listening/jobs','/listening/plans'].includes(r.path)))
})
test('finished task refresh only queries counters and never resubmits', async () => {
  reset(); records = [makeJob({ status: 'partial', submittedSeconds: 600 })]
  assert.match(await run('#qqm刷歌刷新 QQ'), /平台增量已确认/)
  assert.ok(requests.some(r => r.path === '/listening/job' && r.query.refresh === '1')); assert.ok(requests.every(r => r.method === 'GET'))
})
test('active task refresh is explained without an upstream refresh request', async () => {
  reset(); records = [makeJob({ status: 'running' })]
  assert.match(await run('#qqm刷歌刷新 QQ'), /还在执行/); assert.equal(requests.length, 2)
})
test('record list is bounded to five jobs and does not poll the platform', async () => {
  reset(); records = Array.from({ length: 8 }, () => makeJob())
  assert.equal((await run('#qqm刷歌记录')).match(/任务：/g).length, 5); assert.equal(requests.length, 2)
})
test('platform profile keeps today and total metrics distinct and rejects missing counters', async () => {
  reset(); assert.match(await run('#qqm刷歌统计 QQ'), /今日听歌时长：1小时/); assert.match(await run('#qqm刷歌统计 酷狗'), /累计听歌时长：1小时/)
  badProfile = true; await assert.rejects(() => run('#qqm刷歌统计 QQ'), { listeningCode: 'invalid-response' })
})
test('partial and uncertain writes are not described as successful credited playback', () => {
  const text = M.formatListeningJob(makeJob({ status: 'partial', submittedSeconds: 60, inFlightSeconds: 60, reason: 'acknowledgement-uncertain' }))
  assert.match(text, /增量未完全确认/); assert.match(text, /平台统计增量：0秒/); assert.match(text, /结果待核对批次：1分/); assert.doesNotMatch(text, /刷歌成功|已完成/)
})
test('error translation never exposes raw HTTP errors, cookies or prototype properties', () => {
  for (const code of ['constructor', '__proto__', 'random-code']) {
    const text = M.listeningError({ message: 'cookie=synthetic-secret', payload: { code }, config: { Authorization: 'synthetic-secret' } })
    assert.equal(typeof text, 'string'); assert.doesNotMatch(text, /synthetic-secret|function Object/)
  }
  assert.match(M.listeningError({ payload: { code: 'login-required' } }), /自己的/)
})
test('mutating requests do not follow POST-to-GET redirects', async () => {
  reset(); redirect = true; await assert.rejects(() => run('#qqm刷歌 酷狗 1 确认'))
  assert.ok(!requests.some(r => r.path === '/unexpected-redirect'))
})
test('all listening paths are classified as personal account requests', () => {
  for (const sub of ['start', 'jobs', 'job', 'profile', 'stop']) assert.equal(API.isPerUserScopePath('/listening/' + sub), true)
})
test('a guest token bound to another user cannot create, inspect, stop or profile that account', async () => {
  reset(); boundOwner = 'different-owner'
  for (const text of ['#qqm刷歌 酷狗 1 确认', '#qqm刷歌状态', '#qqm刷歌停止 确认', '#qqm刷歌统计 QQ']) {
    await assert.rejects(() => run(text), { listeningCode: 'bound-account-mismatch' })
  }
  assert.ok(requests.every(r => r.path === '/login/status')); assert.equal(records.length, 0)
})
test('both help modes expose task commands only to masters, dedicated help shares the section', () => {
  for (const build of [H.buildHelpCardData, H.buildGuideCardData]) {
    assert.ok(build({ isMaster: true }).sections.flatMap(s => s.items).some(i => i.example === '#qqm刷歌帮助'))
    assert.ok(!build({ isMaster: false }).sections.flatMap(s => s.items).some(i => i.example === '#qqm刷歌帮助'))
  }
  const data = H.buildListeningHelpCardData({ isMaster: true })
  assert.equal(data.sections.length, 1); assert.ok(data.sections[0].items.length >= 12); assert.equal(data.statCommands, String(data.sections[0].items.length))
  assert.equal(H.buildListeningHelpCardData({ isMaster: false }).sections.length, 0)
})
test('app class registers its handler and rejects nonmasters with only the framework base isolated', async () => {
  const appFile = path.join(runtime, 'apps/listening.js'), baseFile = path.join(temp, 'base.mjs'), fixtureFile = path.join(temp, 'app.mjs')
  fs.writeFileSync(baseFile, 'export async function loadPluginBase(){return class Plugin {constructor(options){Object.assign(this,options)}}}')
  // Keep the actual compiled class and its real API/common helpers; isolate framework initialization only.
  let source = fs.readFileSync(appFile, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_all, _quote, rel) => JSON.stringify(pathToFileURL(path.resolve(path.dirname(appFile), rel)).href))
  source = source.replace(JSON.stringify(pathToFileURL(path.join(runtime, 'utils/plugin-base.js')).href), JSON.stringify(pathToFileURL(baseFile).href))
  fs.writeFileSync(fixtureFile, source)
  const mod = await import(pathToFileURL(fixtureFile).href)
  assert.deepEqual(Object.keys(mod), ['qqmusicListening'])
  const instance = new mod.qqmusicListening(), rule = instance.rule[0]
  assert.equal(rule.permission, 'master'); assert.equal(typeof instance[rule.fnc], 'function'); assert.ok(new RegExp(rule.reg).test('#qqm刷歌状态'))
  const replies = []; let calls = 0
  instance.client = () => ({ execute: async (_command, context) => { calls++; assert.equal(context.userKey, 'karin-user'); return 'fixture status' } })
  await instance.listening({ msg: '#qqm刷歌状态', isMaster: false, userId: 'other', reply: async t => replies.push(t) })
  assert.equal(calls, 0); assert.match(replies[0], /仅限主人/)
  await instance.listening({ msg: '#qqm刷歌状态', isMaster: true, userId: 'karin-user', reply: async t => replies.push(t) })
  assert.equal(calls, 1); assert.equal(replies[1], 'fixture status')
})

test('long English names search normally while explicit mid identifiers skip searching', async () => {
  reset(); await run('#qqm刷歌 QQ 1 TheScientist 确认')
  assert.ok(requests.some(r => r.path === '/search' && r.query.key === 'TheScientist'))
  reset(); await run('#qqm刷歌 QQ 1 mid:ABCDEFGHIJKLMN 确认')
  assert.equal(requests.filter(r => r.path === '/search').length, 0)
  assert.equal(requests.find(r => r.path === '/listening/start').body.id, 'ABCDEFGHIJKLMN')
})
test('status payload names the song currently being brushed', () => {
  const text = M.formatListeningJob(makeJob({ status:'running', songTitle:'晴天', songArtist:'周杰伦' }))
  assert.match(text, /歌曲：晴天 - 周杰伦/)
  const card = M.buildListeningStatusCard(makeJob({ status:'running', songTitle:'晴天', songArtist:'周杰伦' }), [])
  assert.equal(card.song, '晴天'); assert.equal(card.artist, '周杰伦')
})
test('daily singer plan carries target type, per-round duration and 24-hour schedule', async () => {
  reset(); const text = await run('#qqm刷歌计划 QQ 歌手 周杰伦 60 一直 00:05 确认')
  const add = requests.find(r => r.path === '/listening/plan/add')
  assert.match(text, /每天：00:05/); assert.equal(add.body.targetType, 'singer'); assert.equal(add.body.roundSeconds, 3600)
  assert.equal(add.body.repeat, 'continuous'); assert.equal(add.body.confirm, 1)
})
test('fixed album plan carries its total round limit', async () => {
  reset(); await run('#qqm刷歌计划 QQ 专辑 叶惠美 30 20次 01:30 确认')
  const add = requests.find(r => r.path === '/listening/plan/add')
  assert.equal(add.body.repeat, 'rounds'); assert.equal(add.body.totalRounds, 20); assert.equal(add.body.scheduleTime, '01:30')
})

test('master API credentials cannot cause Kugou tasks to borrow the service shared account', async () => {
  reset(); kgOwn = false
  await assert.rejects(() => run('#qqm刷歌 酷狗 1 确认'), { listeningCode: 'login-required' })
  await assert.rejects(() => run('#qqm刷歌统计 酷狗'), { listeningCode: 'login-required' })
  assert.ok(requests.every(r => ['/login/status', '/kugou/status'].includes(r.path)))
  assert.equal(records.length, 0)
})

test('main help is a bounded directory and every advertised category has a nonempty detail card', () => {
  for (const build of [H.buildHelpCardData, H.buildGuideCardData]) {
    for (const isMaster of [true, false]) {
      const data = build({ isMaster }), entries = data.sections.filter(s => /帮助$/.test(s.title))
      assert.ok(entries.length >= 2)
      assert.ok(data.sections.every(s => s.title === '多平台音源' || s.items.length <= 6))
      for (const entry of entries.flatMap(s => s.items)) {
        const key = /^#qqm(.+)帮助$/.exec(entry.example)?.[1]
        assert.ok(key, entry.example)
        const detail = H.buildCategoryHelpCardData({ isMaster }, key)
        assert.ok(detail?.sections.length, entry.example)
        assert.ok(H.formatHelpCardText(detail).includes(detail.title))
      }
      const text = H.formatHelpCardText(data)
      assert.ok(text.includes('#qqm点歌帮助'))
      assert.equal(text.includes('#qqm刷歌帮助'), isMaster)
      assert.equal(text.includes('#qqm账号帮助'), isMaster)
      assert.equal(text.includes('#qqm管理帮助'), isMaster)
    }
  }
  assert.equal(H.buildCategoryHelpCardData({}, '不存在'), null)
  assert.equal(H.buildCategoryHelpCardData({}, '管理').sections.length, 0)
  assert.equal(H.buildManageCardData({}).sections.length, 0)
  assert.ok(H.buildManageCardData({ isMaster: true }).sections[0].items.length >= 10)
  assert.equal(H.buildListeningHelpCardData({ isMaster: true }).title, '刷歌帮助')
})

test('short daily command has the same validated payload as the full spelling', () => {
  assert.deepEqual(M.parseListeningCommand('#qqm刷歌每天 酷狗 确认'), M.parseListeningCommand('#qqm刷歌计划 酷狗 歌曲 累计时长 1440 一直 00:05 确认'))
  assert.deepEqual(M.parseListeningCommand('#qqm刷歌每天 酷狗 08:30 确认'), M.parseListeningCommand('#qqm刷歌计划 酷狗 歌曲 累计时长 1440 一直 08:30 确认'))
  assert.equal(M.parseListeningCommand('#qqm刷歌每天 24小时 周杰伦 确认').roundSeconds, 86400)
  assert.equal(M.parseListeningCommand('#qqm刷歌每天 周杰伦 12小时 确认').roundSeconds, 43200)
  assert.equal(M.parseListeningCommand('#qqm刷歌每天 QQ 确认').action, 'invalid')
  assert.deepEqual(M.parseListeningCommand('#qqm刷歌每天 周杰伦 确认'),
    M.parseListeningCommand('#qqm刷歌计划 QQ 歌手 周杰伦 60 一直 00:05 确认'))
  assert.deepEqual(M.parseListeningCommand('#qqm刷歌每天 专辑 叶惠美 30分 20次 8:30 确认'),
    M.parseListeningCommand('#qqm刷歌计划 QQ 专辑 叶惠美 30 20次 08:30 确认'))
  assert.equal(M.parseListeningCommand('#qqm刷歌每天 歌曲 The Scientist 确认').target, 'The Scientist')
  for (const text of ['#qqm刷歌每天 周杰伦', '#qqm刷歌每天 周杰伦 0分 确认', '#qqm刷歌每天 周杰伦 0次 确认',
    '#qqm刷歌每天 周杰伦 3651次 确认', '#qqm刷歌每天 周杰伦 24:01 确认', '#qqm刷歌每天 周杰伦 1.5分 确认', '#qqm刷歌每天 周杰伦 -3次 确认', '#qqm刷歌暂停']) {
    assert.equal(M.parseListeningCommand(text).action, 'invalid', text)
  }
})

test('Kugou daily command persists a 24-hour plan without a fake song lookup', async () => {
  reset()
  const text = await run('#qqm刷歌每天 酷狗 确认')
  const body = requests.find(r => r.path === '/listening/plan/add').body
  assert.equal(body.platform, 'kugou'); assert.equal(body.targetType, 'song'); assert.equal(body.target, '累计时长')
  assert.equal(body.roundSeconds, 86400); assert.equal(body.repeat, 'continuous'); assert.equal(body.scheduleTime, '00:05')
  assert.ok(!requests.some(r => r.path === '/search'))
  assert.match(text, /酷狗/)
})

test('short daily creation reaches the real client and persists default schedule in the API', async () => {
  reset()
  const text = await run('#qqm刷歌每天 周杰伦 确认')
  const body = requests.find(r => r.path === '/listening/plan/add').body
  assert.equal(body.platform, 'qq'); assert.equal(body.targetType, 'singer'); assert.equal(body.target, '周杰伦')
  assert.equal(body.roundSeconds, 3600); assert.equal(body.repeat, 'continuous'); assert.equal(body.scheduleTime, '00:05')
  assert.match(text, /计划：listen_fixture1234/)
})

test('short controls resolve only owned plans and refuse ambiguous or missing targets before writing', async () => {
  reset()
  await assert.rejects(() => run('#qqm刷歌暂停 确认'), { listeningCode: 'no-plan' })
  assert.ok(!requests.some(r => r.path === '/listening/plan/action'))
  await run('#qqm刷歌每天 周杰伦 确认')
  const first = planRecords[0]
  for (const verb of ['暂停', '继续', '立即', '删除']) {
    requests = []
    await run('#qqm刷歌' + verb + ' 确认')
    assert.equal(requests.find(r => r.path === '/listening/plan/action').body.id, first.id)
  }
  planRecords.push({ ...first, id: 'listen_second', target: '林俊杰' })
  requests = []
  await assert.rejects(() => run('#qqm刷歌暂停 确认'), { listeningCode: 'plan-ambiguous' })
  assert.ok(!requests.some(r => r.path === '/listening/plan/action'))
  await run('#qqm刷歌暂停 林俊杰 确认')
  assert.equal(requests.at(-1).body.id, 'listen_second')
  requests = []
  await assert.rejects(() => run('#qqm刷歌计划暂停 foreign_id 确认'), { listeningCode: 'no-plan' })
  assert.ok(!requests.some(r => r.path === '/listening/plan/action'))
  planRecords.push({ ...first, id: 'listen_third' })
  await assert.rejects(() => run('#qqm刷歌暂停 周杰伦 确认'), { listeningCode: 'plan-ambiguous' })
  await run('#qqm刷歌暂停 ' + first.id + ' 确认')
  assert.equal(requests.at(-1).body.id, first.id)
})

test('master commands use an independently bound token slot consistently instead of comparing it to chat ID', async () => {
  reset(); boundOwner = 'independent-slot'
  tokenMeta = { tokenKind: 'guest', tokenId: boundOwner, bound: true, tokenShared: false }
  const context = { ...owner, isMaster: true }
  const text = await client.execute(M.parseListeningCommand('#qqm刷歌每天 周杰伦 确认'), context)
  assert.match(text, /独立 API Token 绑定/)
  assert.equal(requests.find(r => r.path === '/listening/plan/add').body.userKey, boundOwner)
  assert.ok(requests.filter(r => r.path !== '/login/status').every(r => (r.body.userKey || r.query.userKey) === boundOwner))
  requests = []
  await client.execute(M.parseListeningCommand('#qqm刷歌暂停 确认'), context)
  assert.equal(requests.at(-1).path, '/listening/plan/action'); assert.equal(requests.at(-1).body.userKey, boundOwner)
  requests = []
  await client.execute(M.parseListeningCommand('#qqm刷歌 QQ 1 晴天 确认'), context)
  assert.equal(requests.find(r => r.path === '/search').query.userKey, boundOwner)
  assert.equal(requests.find(r => r.path === '/listening/start').body.userKey, boundOwner)
})

test('bound slot adoption never permits ordinary senders, shared tokens or ambiguous legacy metadata', async () => {
  reset(); boundOwner = 'independent-slot'
  tokenMeta = { tokenKind: 'guest', tokenId: boundOwner, bound: true, tokenShared: false }
  await assert.rejects(() => run('#qqm刷歌统计 QQ'), { listeningCode: 'bound-account-mismatch' })
  tokenMeta.tokenShared = true
  await assert.rejects(() => client.execute(M.parseListeningCommand('#qqm刷歌统计 QQ'), { ...owner, isMaster: true }), { listeningCode: 'shared-token-readonly' })
  tokenMeta = { tokenKind: 'master', bound: false }
  await assert.rejects(() => client.execute(M.parseListeningCommand('#qqm刷歌统计 QQ'), { ...owner, isMaster: true }), { listeningCode: 'bound-account-mismatch' })
  assert.ok(requests.every(r => r.path === '/login/status'))
})
