/** Mocked official CDN + API, actual download/FFmpeg/send: recovery must validate before sending. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL,fileURLToPath} from 'node:url'
const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const plugin=process.argv[2]||ownRoot
const parent=path.resolve(process.env.QQMUSIC_VOICE_TEST_DIR||'output')
fs.mkdirSync(parent,{recursive:true})
const root=fs.mkdtempSync(path.join(parent,'voice-recovery-'))
const runtime=fs.existsSync(path.join(plugin,'utils/send.js'))?plugin:path.join(plugin,'dist')
Object.assign(process.env,{QQMUSIC_PLUGIN_STATE_PATH:root,QQMUSIC_YUNZAI_PATH:root,QQMUSIC_KARIN_PATH:root,QQMUSIC_TEMP_PATH:root})
const cfg={apiBase:'',apiToken:'',sendVocal:true,uploadFile:true,sendTextInfo:false,sendNativeCard:false,sendCustomCard:false,keepFileSec:0,tempDir:path.join(root,'downloads'),statsEnable:false,togetherEnable:false,togetherAuto:false,downloadTimeout:3000}
const {default:Config}=await import(pathToFileURL(path.join(runtime,'components/Config.js')).href);Config.getConfig=()=>cfg
global.segment={record:file=>({type:'record',file}),file:(file,name)=>({type:'file',file,name})}
global.logger={info(){},warn(){},error(){},debug(){}}
const send=await import(pathToFileURL(path.join(runtime,'utils/send.js')).href)
const src=path.join(root,'good.flac')
const digest=b=>crypto.createHash('sha256').update(b).digest('hex')
let server,base,passed=0,direct=0,resolved=0,proxied=0,returnBad=false,lastQuery
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)}
try{
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=500:sample_rate=44100','-t','18','-c:a','flac',src],{windowsHide:true})
 const full=fs.readFileSync(src)
 const packets=JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_entries','packet=pos,pts_time','-of','json',src],{windowsHide:true,encoding:'utf8'})).packets
 const broken=full.subarray(0,Number(packets.find(p=>Number(p.pts_time)>=6).pos))
 server=http.createServer((req,res)=>{
  const u=new URL(req.url,base||'http://fixture')
  if(u.pathname==='/song/url'){resolved++;lastQuery=u.searchParams;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:100,data:base+'/cdn/fresh.mflac0',quality:'flac',file:'F000fixture.flac',encrypted:false,playChannel:'client',audioRevision:'fixture-revision'}));return}
  if(u.pathname==='/song/file'){proxied++;res.setHeader('Content-Type','audio/flac');res.setHeader('X-QQM-Decrypted','rc4');res.end(returnBad?broken:full);return}
  if(u.pathname==='/partial.flac'){res.writeHead(206,{'Content-Type':'audio/flac'});res.end(broken);return}
  direct++;res.setHeader('Content-Type','audio/flac');res.end(u.pathname==='/good.flac'?full:broken)
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;cfg.apiBase=base
 const invoke=async(url,extra={})=>{
  const messages=[],voices=[],uploads=[]
  const event={user_id:'fixture',group_id:'fixture-group',bot:{adapter:{id:'QQ',name:'ICQQ',protocol:'icqq',standard:'icqq'}},contact:{scene:'group',peer:'fixture-group'},
   group:{sendFile:async(file,...args)=>{uploads.push(digest(fs.readFileSync(file)));return true}},
   reply:async message=>{messages.push(message);if(message?.type==='record'){if(extra.failVoice)throw new Error('fixture adapter rejected voice');assert.ok(fs.existsSync(message.file));voices.push(message.file)};return {message_id:'fixture'}}}
  if(path.basename(plugin)!=='qqmusic-plugin-main')event.bot.uploadFile=async(_contact,file)=>{uploads.push(digest(fs.readFileSync(file)));return true}
  const result=await send.deliverSong(event,{songmid:'QQAUDIOFIX001',songName:'fixture',singerName:'fixture',interval:18},
   {url,quality:'flac',file:'F000fixture.flac',encrypted:false,playChannel:'official',...extra})
  return {result,messages,voices,uploads}
 }
 await check('明文标记但URL为mflac0时先走API解密',async()=>{
  const before=direct,out=await invoke(base+'/cdn/F0M0fixture.mflac0')
  assert.equal(out.result.ok,true);assert.equal(direct,before);assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('官方坏直链绕过旧缓存重新取流且只发送验收通过的音频',async()=>{
  const before=resolved,out=await invoke(base+'/bad.flac')
  assert.equal(out.result.ok,true);assert.equal(resolved-before,1);assert.equal(lastQuery.get('fresh'),'1');assert.equal(lastQuery.get('local'),'0')
  assert.equal(out.voices.length,1);assert.deepEqual(out.uploads,[digest(full)])
 })
 await check('第二次仍损坏时停止且不无限重试',async()=>{
  returnBad=true;const before=resolved,out=await invoke(base+'/bad.flac');returnBad=false
  assert.equal(out.result.ok,false);assert.equal(resolved-before,1);assert.equal(out.voices.length,0);assert.equal(out.uploads.length,0)
 })
 await check('本地库坏文件不擅自切换官方音源',async()=>{
  const before=resolved,out=await invoke(base+'/bad.flac',{local:true,playChannel:'library'})
  assert.equal(out.result.ok,false);assert.equal(resolved,before);assert.equal(out.uploads.length,0)
 })
 await check('未请求Range时拒绝206片段',async()=>{
  await assert.rejects(send.downloadAudio(base+'/partial.flac',cfg.tempDir,'partial',3000,'flac'),/206/)
 })
 await check('同毫秒并发下载使用不同文件',async()=>{
  const oldNow=Date.now;Date.now=()=>1793254940364
  try{const [a,b]=await Promise.all([send.downloadAudio(base+'/good.flac',cfg.tempDir,'same',3000,'flac'),send.downloadAudio(base+'/good.flac',cfg.tempDir,'same',3000,'flac')]);assert.notEqual(a.filePath,b.filePath)}
  finally{Date.now=oldNow}
 })
 await check('协议发送失败不回退远程URL且返回失败',async()=>{
  cfg.uploadFile=false;const out=await invoke(base+'/good.flac',{failVoice:true});cfg.uploadFile=true;
  assert.equal(out.result.ok,false);assert.ok(out.messages.filter(x=>x?.type==='record').every(x=>!/^https?:/i.test(x.file)));
 })
 await check('仅上传文件时也拒绝损坏音频',async()=>{
  cfg.sendVocal=false;returnBad=true
  try{
   const before=resolved,out=await invoke(base+'/bad.flac')
   assert.equal(out.result.ok,false);assert.equal(out.voices.length,0);assert.equal(out.uploads.length,0)
   assert.equal(resolved-before,1)
  }finally{cfg.sendVocal=true;returnBad=false}
 })
 console.log('RESULT: '+passed+' passed')
}finally{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(path.dirname(root)!==parent)throw Error('Unsafe test directory')
 fs.rmSync(root,{recursive:true,force:true})
}
process.exit(0)
