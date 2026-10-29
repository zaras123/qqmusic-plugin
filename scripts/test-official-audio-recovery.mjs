/** Actual entry mapper + download/FFmpeg/send, with a local official/API fixture. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL,fileURLToPath} from 'node:url'
const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const plugin=process.argv[2]||ownRoot
const parent=path.resolve(process.env.QQMUSIC_VOICE_TEST_DIR||process.env.TEMP||'output')
fs.mkdirSync(parent,{recursive:true})
const root=fs.mkdtempSync(path.join(parent,'voice-recovery-'))
const runtime=fs.existsSync(path.join(plugin,'utils/send.js'))?plugin:path.join(plugin,'dist')
Object.assign(process.env,{QQMUSIC_PLUGIN_STATE_PATH:root,QQMUSIC_YUNZAI_PATH:root,QQMUSIC_KARIN_PATH:root,QQMUSIC_TEMP_PATH:root})
const cfg={apiBase:'',apiToken:'',sendVocal:true,uploadFile:true,sendTextInfo:false,sendNativeCard:false,sendCustomCard:false,
 keepFileSec:0,tempDir:path.join(root,'downloads'),statsEnable:false,togetherEnable:false,togetherAuto:false,downloadTimeout:3000}
const {default:Config}=await import(pathToFileURL(path.join(runtime,'components/Config.js')).href);Config.getConfig=()=>cfg
global.segment={record:file=>({type:'record',file}),file:(file,name)=>({type:'file',file,name})}
global.logger={info(){},warn(){},error(){},debug(){}}
const send=await import(pathToFileURL(path.join(runtime,'utils/send.js')).href)
const entry=fs.readFileSync(path.join(runtime,'apps/song.js'),'utf8')
const start=entry.indexOf('async function resolvePlay('),end=entry.indexOf('export class qqmusicSong',start)
assert.ok(start>=0&&end>start)
const entryFactory=vm.compileFunction(entry.slice(start,end)+';return resolvePlay',
 ['songUrlBest','platformQualityPref','QUALITY_LABEL'])
const throughEntry=play=>entryFactory(async()=>play,()=> 'flac',{flac:'FLAC'})(
 {songmid:'QQAUDIOFIX001',songName:'Fixture',singerName:'Artist',interval:18},cfg,'fixture')
const digest=b=>crypto.createHash('sha256').update(b).digest('hex')
let server,base,passed=0,direct=0,resolved=0,returnBad=false,lastQuery
let prepares=0,commits=0,lastCommit,lastPrepare,candidateBad=false,commitFails=false,canReplace=true,deliveryCount=0,commitAfterDelivery=0
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)}
try{
 const src=path.join(root,'good.flac')
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=500:sample_rate=44100','-t','18','-c:a','flac',src],{windowsHide:true})
 const full=fs.readFileSync(src),packets=JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_entries','packet=pos,pts_time','-of','json',src],{windowsHide:true,encoding:'utf8'})).packets
 const broken=full.subarray(0,Number(packets.find(p=>Number(p.pts_time)>=6).pos))
 server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,base||'http://fixture')
  if(u.pathname==='/song/url'){resolved++;lastQuery=u.searchParams;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:100,data:base+'/cdn/fresh.mflac0',quality:'flac',file:'F000fixture.flac',encrypted:false,playChannel:'client',audioRevision:'fixture-revision'}));return}
  if(u.pathname==='/library/fallback/prepare'){
   prepares++;let text='';for await(const p of req)text+=p;lastPrepare=JSON.parse(text)
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:100,data:{ticket:'fixture-ticket',canReplace,sha256:digest(full),
    song:{songmid:'QQAUDIOFIX001',interval:18},play:{result:100,data:base+'/library/fallback/file?ticket=fixture-ticket',quality:'flac',
     file:'F000fixture.flac',local:false,external:false,playChannel:'official-recovery',audioRevision:'fixture-v4'}}}));return
  }
  if(u.pathname==='/library/fallback/file'){res.setHeader('Content-Type','audio/flac');res.end(candidateBad?broken:full);return}
  if(u.pathname==='/library/fallback/commit'){
   commits++;commitAfterDelivery=deliveryCount;let text='';for await(const p of req)text+=p;lastCommit=JSON.parse(text)
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(commitFails?{result:409,errMsg:'local-file-changed'}:{result:100,data:{replaced:true,id:'lib_fixture'}}));return
  }
  if(u.pathname==='/song/file'){res.setHeader('Content-Type','audio/flac');res.setHeader('X-QQM-Decrypted','rc4');res.end(returnBad?broken:full);return}
  if(u.pathname==='/partial.flac'){res.writeHead(206,{'Content-Type':'audio/flac'});res.end(broken);return}
  if(u.pathname==='/missing-local.flac'){res.writeHead(404);res.end('missing');return}
  direct++;res.setHeader('Content-Type','audio/flac');res.end(u.pathname==='/good.flac'?full:broken)
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;cfg.apiBase=base
 const invoke=async(url,extra={})=>{
  const messages=[],voices=[],uploads=[];deliveryCount=0;let voiceAttempts=0
  const upload=async file=>{if(extra.failFile)throw Error('fixture file rejected');uploads.push(digest(fs.readFileSync(file)));deliveryCount++;return true}
  const event={user_id:'fixture',group_id:'fixture-group',bot:{adapter:{id:'QQ',name:'ICQQ',protocol:'icqq',standard:'icqq'}},contact:{scene:'group',peer:'fixture-group'},
   group:{sendFile:upload},reply:async message=>{messages.push(message);if(message?.type==='file'&&extra.failFile)throw Error('fixture file rejected');if(message?.type==='record'){
    if(extra.failVoice||(extra.failVoiceOnce&&voiceAttempts++===0))throw Error('fixture voice rejected');assert.ok(fs.existsSync(message.file));voices.push(message.file);deliveryCount++};return {message_id:'fixture'}}}
  if(path.basename(plugin)!=='qqmusic-plugin-main')event.bot.uploadFile=async(_contact,file)=>upload(file)
  const details={url,quality:'flac',file:'F000fixture.flac',encrypted:false,playChannel:'official',...extra}
  const play=extra.entry?await throughEntry(details):details
  const result=await send.deliverSong(event,{songmid:'QQAUDIOFIX001',songName:'Fixture',singerName:'Artist',interval:18},play)
  return {result,messages,voices,uploads}
 }
 const local={local:true,libraryId:'lib_fixture',playChannel:'library',entry:true}
 await check('actual song entry preserves source, DRM keys, library ID and API revision',async()=>{
  const fields={url:base+'/good.flac',quality:'flac',local:true,libraryId:'lib_fixture',encrypted:true,ekey:'fixture-ekey',
   vkey:'fixture-vkey',file:'F0M0fixture.mflac0',purl:'fixture-purl',audioRevision:'fixture-v4',playChannel:'library',external:true,mediaId:'fixture-media'}
  const mapped=await throughEntry(fields);for(const [key,value]of Object.entries(fields))assert.equal(mapped[key],value,key)
 })
 await check('encrypted suffix bypasses misleading plaintext flag',async()=>{
  const before=direct,out=await invoke(base+'/cdn/F0M0fixture.mflac0')
  assert.equal(out.result.ok,true);assert.equal(direct,before);assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('official bad direct URL retries fresh once',async()=>{
  const before=resolved,out=await invoke(base+'/bad.flac');assert.equal(out.result.ok,true);assert.equal(resolved-before,1)
  assert.equal(lastQuery.get('fresh'),'1');assert.equal(lastQuery.get('local'),'0');assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('official HTTP failure refresh never switches to local library',async()=>{
  const before=resolved,out=await invoke(base+'/missing-local.flac')
  assert.equal(out.result.ok,true);assert.equal(resolved-before,1)
  assert.equal(lastQuery.get('local'),'0');assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('second bad official result stops without sending',async()=>{
  returnBad=true;try{const before=resolved,out=await invoke(base+'/bad.flac');assert.equal(out.result.ok,false);assert.equal(resolved-before,1);assert.equal(out.voices.length,0);assert.equal(out.uploads.length,0)}finally{returnBad=false}
 })
 await check('healthy local audio remains first choice',async()=>{
  const before=prepares,count=commits,out=await invoke(base+'/good.flac',local)
  assert.equal(out.result.ok,true);assert.equal(prepares,before);assert.equal(commits,count)
 })
 await check('bad local file falls back and commits only after successful delivery',async()=>{
  const before=prepares,count=commits,out=await invoke(base+'/bad.flac',local)
  assert.equal(out.result.ok,true);assert.equal(prepares-before,1);assert.equal(commits-count,1)
  assert.equal(lastPrepare.badSha256,digest(broken));assert.equal(lastCommit.sha256,digest(full))
  assert.ok(commitAfterDelivery>0);assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('missing local HTTP file also falls back once',async()=>{
  const before=prepares,count=commits,out=await invoke(base+'/missing-local.flac',local)
  assert.equal(out.result.ok,true);assert.equal(prepares-before,1);assert.equal(commits-count,1);assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('bad fallback candidate sends nothing and never commits',async()=>{
  candidateBad=true;try{const count=commits,out=await invoke(base+'/bad.flac',local);assert.equal(out.result.ok,false);assert.equal(out.voices.length,0);assert.equal(out.uploads.length,0);assert.equal(commits,count)}finally{candidateBad=false}
 })
 await check('QQ protocol failure never marks local audio as corrupt',async()=>{
  const count=commits,before=prepares;canReplace=false
  try{const out=await invoke(base+'/good.flac',{...local,failVoice:true,failFile:true})
   assert.equal(out.result.ok,false);assert.equal(commits,count);assert.equal(prepares-before,1)}finally{canReplace=true}
 })
 await check('a local protocol failure retries official once without replacing healthy audio',async()=>{
  const count=commits,before=prepares;canReplace=false;cfg.uploadFile=false
  try{const out=await invoke(base+'/good.flac',{...local,failVoiceOnce:true})
   assert.equal(out.result.ok,true);assert.equal(prepares-before,1);assert.equal(commits,count);assert.equal(out.voices.length,1)}
  finally{canReplace=true;cfg.uploadFile=true}
 })
 await check('all fallback deliveries rejected means no library commit',async()=>{
  const count=commits,out=await invoke(base+'/bad.flac',{...local,failVoice:true,failFile:true})
  assert.equal(out.result.ok,false);assert.equal(commits,count)
 })
 await check('replacement failure does not undo successful official delivery',async()=>{
  commitFails=true;try{const out=await invoke(base+'/bad.flac',local);assert.equal(out.result.ok,true);assert.deepEqual(out.uploads,[digest(full)])}finally{commitFails=false}
 })
 await check('no library write permission still permits official playback',async()=>{
  canReplace=false;try{const count=commits,out=await invoke(base+'/bad.flac',local);assert.equal(out.result.ok,true);assert.equal(commits,count)}finally{canReplace=true}
 })
 await check('file-only mode also recovers and validates',async()=>{
  cfg.sendVocal=false;try{const count=commits,out=await invoke(base+'/bad.flac',local);assert.equal(out.result.ok,true);assert.equal(commits-count,1);assert.deepEqual(out.uploads,[digest(full)])}finally{cfg.sendVocal=true}
 })
 await check('unsolicited 206 is rejected',async()=>{
  await assert.rejects(send.downloadAudio(base+'/partial.flac',cfg.tempDir,'partial',3000,'flac'),/206/)
 })
 await check('same-millisecond downloads use separate files',async()=>{
  const oldNow=Date.now;Date.now=()=>1793254940364
  try{const [a,b]=await Promise.all([send.downloadAudio(base+'/good.flac',cfg.tempDir,'same',3000,'flac'),send.downloadAudio(base+'/good.flac',cfg.tempDir,'same',3000,'flac')]);assert.notEqual(a.filePath,b.filePath)}finally{Date.now=oldNow}
 })
 console.log('RESULT: '+passed+' passed')
}finally{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(path.dirname(root)!==parent)throw Error('Unsafe test directory')
 fs.rmSync(root,{recursive:true,force:true})
}
process.exit(0)
