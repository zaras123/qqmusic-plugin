/**
 * Local library compatibility regression. Uses generated audio and mocked bot callbacks.
 * QQMUSIC_TEST_API_ROOT optionally enables the real API's search/song/library routes.
 * Requires ffmpeg on PATH (or FFMPEG_PATH); never reads a live account's configuration.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const karin = fs.existsSync(path.join(root, 'tsconfig.json'))
const runtime = karin ? path.join(root, 'dist') : root
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqmusic-plugin-library-'))
process.env.QQMUSIC_PLUGIN_STATE_PATH = path.join(temp, 'state')
global.logger = { info() {}, warn() {}, error() {}, debug() {}, mark() {} }
global.segment = {
  image: file => ({ type: 'image', file }),
  record: file => ({ type: 'record', file }),
  file: (file, name) => ({ type: 'file', file, name }),
  music: (type, id) => ({ type: 'music', data: { type, id } }),
}
const { default: axios } = await import('axios')
let remoteDownloads = 0
const interceptor = axios.interceptors.request.use(config => {
  if(new URL(config.url).hostname !== '127.0.0.1'){remoteDownloads++;throw new Error('Test prohibits remote HTTP requests')}
  return config
})
let server, lib, checks = 0, upstream = 0, details = 0, cfg = {}, base = ''
const digest = b => crypto.createHash('sha256').update(b).digest('hex')
const check = (name, value) => { assert.ok(value, name); checks++; console.log('PASS ' + name) }
const load = file => import(pathToFileURL(path.join(runtime, file)).href)
try {
  const audioFile = path.join(temp, 'fixture.m4a')
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','8','-c:a','aac','-b:a','192k',audioFile], { windowsHide: true })
  const audio = fs.readFileSync(audioFile)
  const { default: Config } = await load('components/Config.js')
  Config.getConfig = name => name === 'qqmusic' ? { ...cfg } : {}
  const helpers = await load('utils/library-compat.js')
  const api = await load('utils/api.js')
  const send = await load('utils/send.js')
  const cards = await load('utils/card-data.js')
  check('本地签名下载地址不改协议或域名',JSON.stringify(send.buildDownloadCandidates('https://library.example/library/file?token=fixture'))===JSON.stringify(['https://library.example/library/file?token=fixture']))
  check('第三方及伪装域名不参与QQ CDN切换',send.buildDownloadCandidates('https://api.example/audio').length===1&&send.buildDownloadCandidates('https://ws.stream.qqmusic.qq.com.example/audio').length===1)
  check('官方QQ音乐CDN仍支持故障切换',send.buildDownloadCandidates('https://isure.stream.qqmusic.qq.com/M800fixture.mp3?vkey=fixture').some(u=>u.includes('aqqmusic.tc.qq.com/M800fixture.mp3?vkey=fixture')))
  let localSong = { songmid: 'bi_BV1SA41157Nt', songid: 'bi_BV1SA41157Nt', songName: '暗号（现场 · The One）', singerName: '周杰伦', source: 'bilibili', quality: '192k', version: 'live', versionLabel: '现场 · The One', local: true, external: true, libraryId: 'lib_fixture', interval: 8 }
  let app
  if (process.env.QQMUSIC_TEST_API_ROOT) {
    Object.assign(process.env, { QQMUSIC_LIBRARY_DIR: path.join(temp,'library'), QQMUSIC_LIBRARY_AUTO:'0', QQMUSIC_LIBRARY_SUBS:'0', QQMUSIC_LIBRARY_PLANS:'0', QQMUSIC_API_TOKEN:'plugin-library-fixture', QQMUSIC_SHARED_CREDENTIALS:'0' })
    const requireApi = createRequire(path.join(path.resolve(process.env.QQMUSIC_TEST_API_ROOT), 'package.json'))
    lib = requireApi('./util/library')
    const item = lib.putItem({ songmid:localSong.songmid, source:'bilibili', title:'【4K60FPS】周杰伦《暗号》神级现场！The One演唱会live', artist:'测试UP主', quality:'192k', ext:'.m4a', duration:8 }, audio)
    localSong = lib.searchSongs('周杰伦 暗号').list[0]
    check('真实API识别长视频标题和演唱者', item.artist === '周杰伦' && item.title.includes('暗号') && localSong.local)
    const express = requireApi('express')
    app = express()
    const cache = new (requireApi('./util/cache'))()
    const request = async input => {
      if(input.data?.songinfo?.param?.song_mid==='003fixtureQQ01') {
        details++
        return {songinfo:{data:{track_info:{mid:'003fixtureQQ01',id:123456,name:'晴天',singer:[{name:'周杰伦'}],interval:8,file:{media_mid:'mediaQQFixture'}}}}}
      }
      upstream++; throw new Error('unexpected upstream request')
    }
    app.get('/search', (req,res,next) => req.query.key === 'filter-fixture' ? res.json({ result:100, data:{ list:[localSong, { ...localSong, local:false, songmid:'bi_online' }, {songmid:'kw_online',source:'kuwo',external:true}, {songmid:'qq_online',source:'qq'}] } }) : next())
    for (const [prefix,handlers] of [['/search',requireApi('./module/search')],['/song',requireApi('./module/song')],['/library',requireApi('./module/library')]]) {
      for (const [suffix,fn] of Object.entries(handlers)) if (typeof fn === 'function' && suffix.startsWith('/')) {
        app.all(prefix+(suffix==='/'?'':suffix), async(req,res) => {
          req.auth={kind:'master'}
          try { await fn({req,res,request,cache,auth:req.auth,userKey:'listener',globalCookie:{userCookie:()=>({}),userCookieWithPublic:()=>({}),toHeader:()=>''}}) }
          catch(e) { res.status(500).json({error:e.message}) }
        })
      }
    }
  } else {
    app = (req,res) => {
      const u = new URL(req.url, base)
      res.setHeader('Content-Type','application/json')
      if (u.pathname === '/search') {
        const list = u.searchParams.get('key') === 'filter-fixture' ? [localSong,{...localSong,local:false,songmid:'bi_online'},{songmid:'kw_online',source:'kuwo',external:true},{songmid:'qq_online',source:'qq'}] : [localSong]
        res.end(JSON.stringify({result:100,data:{list,local:true}}))
      } else if (u.pathname === '/song/url') {
        res.end(JSON.stringify({result:100,data:base+'/audio',local:true,libraryId:'lib_fixture',quality:'192k',ext:'m4a',source:'bilibili',sourceLabel:'本地曲库',playChannel:'library'}))
      } else if (u.pathname === '/audio') {
        res.setHeader('Content-Type','audio/mp4');res.setHeader('Content-Length',audio.length)
        res.end(req.method==='HEAD'?undefined:audio)
      } else { res.statusCode=404;res.end('{}') }
    }
  }
  server = http.createServer(app)
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  base='http://127.0.0.1:'+server.address().port
  cfg={apiBase:base,apiToken:'plugin-library-fixture',quality:'flac',forceMaster:false,publicUserKey:'',sendNativeCard:true,sendCustomCard:false,sendTextInfo:false,sendVocal:true,uploadFile:true,keepFileSec:0,statsEnable:false,togetherEnable:false,togetherAuto:false,downloadTimeout:5000}
  check('本地字段兼容旧嵌套响应',helpers.playLibraryFields({}, {local:true,quality:'192k',source:'bilibili',ext:'.m4a',external:1}).external)
  check('扩展名拒绝路径，允许实际M4A',helpers.audioFormatExtension('../mp3')===''&&helpers.audioFormatExtension('.M4A')==='.m4a')
  const filtered=await api.searchSongs('filter-fixture',{fill:true,fillSources:[]})
  check('关闭在线补歌仍保留本地B站曲目，过滤在线补歌',filtered.some(s=>s.local&&s.source==='bilibili')&&!filtered.some(s=>s.songmid==='bi_online'||s.songmid==='kw_online')&&filtered.some(s=>s.songmid==='qq_online'))
  const songs=await api.searchSongs('周杰伦 暗号',{fill:true,fillSources:[]})
  const song=songs[0]
  check('点歌保留本地标签、BV、演唱者和现场版本',song.local&&song.songmid===localSong.songmid&&song.singerName==='周杰伦'&&song.version==='live'&&song.libraryId)
  const play=await api.songUrlBest(song.songmid,{quality:'flac',userKey:'listener',probe:true})
  check('取流保留实际192k/M4A，不误报FLAC',play.local&&play.quality==='192k'&&play.ext==='m4a'&&play.external&&play.source==='bilibili'&&play.qualityLabel.includes('本地曲库')&&!play.degradeNote)
  const card=cards.buildListCardData('周杰伦 暗号',songs)
  check('列表显示本地曲库、实际音质和版本',card.songs[0].sourceTag.includes('本地')&&card.songs[0].sourceTag.includes('192k')&&card.songs[0].version==='live'&&card.sourceCounts.some(s=>s.label==='本地曲库'))
  const dl=await send.downloadAudio(play.url,temp,'song',5000,play.quality,play.ext)
  check('真实HTTP下载格式与原音频哈希一致',path.extname(dl.filePath)==='.m4a'&&digest(fs.readFileSync(dl.filePath))===digest(audio))
  const refreshKeys=[]
  server.prependListener('request',req=>{const u=new URL(req.url,base);if(u.pathname==='/song/url')refreshKeys.push(u.searchParams.get('userKey'))})
  const messages=[],uploads=[]
  const e={user_id:'listener',group_id:'fixture-group',reply:async m=>{messages.push(m);return {message_id:'fixture'}},bot:{adapter:{id:'QQ',name:'ICQQ',protocol:'icqq',standard:'icqq'},icqq:true},group:{sendFile:async(file,_pid,name)=>{uploads.push({name,hash:digest(fs.readFileSync(file))});return true}}}
  if(karin){e.contact={scene:'group',peer:'fixture-group'};e.bot.uploadFile=async(_contact,file,name)=>{uploads.push({name,hash:digest(fs.readFileSync(file))});return true}}
  const delivered=await send.deliverSong(e,song,play)
  check('语音发送回调执行',delivered.ok&&messages.flat().some(m=>m&&m.type==='record'))
  check('群文件使用歌手歌名及实际M4A，字节不变',uploads.length===1&&uploads[0].name.includes('周杰伦')&&uploads[0].name.includes('暗号')&&uploads[0].name.endsWith('.m4a')&&uploads[0].hash===digest(audio))
  check('B站本地曲目不会发成QQ原生音乐卡',!messages.flat().some(m=>m&&m.type==='music'&&m.data.type==='qq'))
  cfg.sendVocal=false
  const retried=await send.deliverSong(e,song,{...play,url:base+'/fixture-expired'})
  check('过期链接自动刷新后仍成功下载',retried.ok&&uploads.length===2&&uploads[1].hash===digest(audio))
  check('下载重试保留请求者账号槽位',refreshKeys.length===1&&refreshKeys[0]==='listener')
  check('本地失败不改写域名、不尝试QQ CDN',remoteDownloads===0)
  check('本地命中整条链路未调用官方或第三方上游',upstream===0)
  const qqSong={...song,songmid:'QQ_CARD_QINGTIAN',songid:123456,source:'qq',external:false,local:false,songName:'晴天',singerName:'周杰伦'}
  const before=messages.length
  await send.deliverSong(e,qqSong,play)
  const localCards=messages.slice(before).flat().filter(m=>m&&m.type==='music')
  check('QQ卡片命中本地后仅发带本地直链的自定义卡',localCards.length===1&&localCards[0].data.type==='custom'&&localCards[0].data.audio===play.url)
  const nativeBefore=messages.length
  await send.deliverSong(e,qqSong,{...play,local:false,external:false,source:'qq',playChannel:'client'})
  check('本地未命中仍保持官方原生卡',messages.slice(nativeBefore).flat().some(m=>m&&m.type==='music'&&m.data.type==='qq'))
  if(lib){
    lib.putItem({songmid:'ext_qingtian_fixture',source:'nekomusic',title:'晴天',artist:'周杰伦',duration:8,quality:'192k',ext:'.m4a'},audio)
    const {qqmusicResolve}=await load('apps/resolve.js')
    const parsed=api.parseQQMusicCard(JSON.stringify({app:'com.tencent.structmsg',meta:{music:{title:'晴天',desc:'周杰伦',jumpUrl:'https://y.qq.com/n/ryqq/songDetail/003fixtureQQ01'}}}))
    const resolved=await new qqmusicResolve().cardToSong(parsed,'listener')
    const resolvedPlay=await api.songUrlBest(resolved.songmid,{mediaId:resolved.media_mid,quality:'flac',userKey:'listener'})
    check('真实QQ分享卡解析后匹配第三方入库晴天',resolved.songName==='晴天'&&resolved.singerName==='周杰伦'&&resolvedPlay.local&&resolvedPlay.source==='nekomusic'&&resolvedPlay.quality==='192k')
    const start=messages.length,uploadStart=uploads.length
    await send.deliverSong(e,resolved,resolvedPlay)
    check('卡片解析到发送全链路使用本地音频',messages.slice(start).flat().some(m=>m?.data?.type==='custom'&&m.data.audio===resolvedPlay.url)&&uploads[uploadStart]?.hash===digest(audio))
    check('全链路仅查询公开详情，零官方及第三方音频请求',details===2&&upstream===0&&remoteDownloads===0)
  }
  console.log('RESULT: '+checks+' passed ('+(karin?'karin':'yunzai')+', '+(lib?'real API':'fixture API')+')')
} finally {
  axios.interceptors.request.eject(interceptor)
  if(server) await new Promise(r=>server.close(r))
  if(lib) lib.flushIndex({force:true})
  fs.rmSync(temp,{recursive:true,force:true})
}
// Karin dependencies may hold framework timers; this is a standalone CLI test.
process.exit(0)
