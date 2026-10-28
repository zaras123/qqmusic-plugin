import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
const pluginRoot = process.env.QQMUSIC_PLUGIN_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parent = process.env.QQMUSIC_VOICE_TEST_DIR || path.join(pluginRoot, 'temp')
fs.mkdirSync(parent, { recursive: true })
const root = fs.mkdtempSync(path.join(parent, 'voice-integrity-'))
process.env.QQMUSIC_YUNZAI_PATH = root
process.env.QQMUSIC_KARIN_PATH = root
process.env.QQMUSIC_PLUGIN_STATE_PATH = root
process.env.QQMUSIC_TEMP_PATH = root
const codeRoot = fs.existsSync(path.join(pluginRoot, 'utils/send.js')) ? pluginRoot : path.join(pluginRoot, 'dist')
const { prepareVocalFile, deliverSong } = await import(pathToFileURL(path.join(codeRoot, 'utils/send.js')).href)
const { default: Config } = await import(pathToFileURL(path.join(codeRoot, 'components/Config.js')).href)
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], { encoding:'utf8',windowsHide:true }))
const seconds = file => Number(probe(file).format.duration)
const opts = { directExt:new Set(), maxBytes:0, lowQuality:false, expectedSeconds:18 }
const cfg = { sendVocal:true, uploadFile:true, sendTextInfo:false, keepFileSec:0, tempDir:path.join(root,'downloads'), downloadTimeout:3000 }
Config.getConfig = () => cfg
global.segment = { record:file => ({type:'record',file}), image:file=>({type:'image',file}), file:(file,name)=>({type:'file',file,name}) }
let passed = 0
const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name) }
let server
try {
  const source = path.join(root,'source.flac')
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=500:sample_rate=44100','-t','18','-c:a','flac',source],{windowsHide:true})
  const full = fs.readFileSync(source)
  // Cut exactly at a packet boundary: decoding can exit zero despite the missing tail.
  const packets = JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_entries','packet=pos,pts_time','-of','json',source],{encoding:'utf8',windowsHide:true})).packets
  const cut = Number(packets.find(p=>Number(p.pts_time)>=6).pos)
  const broken = full.subarray(0,cut)
  const truncated = path.join(root,'truncated.flac')
  fs.writeFileSync(truncated,broken)
  assert.equal(seconds(truncated),18)
  await check('完整帧边界截断：头部18秒但实际6秒，拒绝转换',async()=>{
    await assert.rejects(prepareVocalFile(truncated,opts),/音频不完整/)
    assert.equal(fs.readdirSync(root).filter(x=>x.startsWith('truncated_vocal')).length,0)
  })
  await check('小文件直传也必须完整解码',async()=>{
    await assert.rejects(prepareVocalFile(truncated,{...opts,directExt:new Set(['flac']),maxBytes:Infinity}),/音频不完整/)
  })
  await check('完整音源转码保留18秒',async()=>{
    assert.ok(Math.abs(seconds(await prepareVocalFile(source,opts))-18)<.3)
  })
  await check('完整小文件校验后保留原格式',async()=>{
    assert.equal(await prepareVocalFile(source,{...opts,directExt:new Set(['flac']),maxBytes:Infinity}),source)
  })
  await check('忽略遗留的6秒缓存',async()=>{
    const stale=path.join(root,'source_vocal.mp3')
    execFileSync('ffmpeg',['-v','error','-i',source,'-t','6',stale],{windowsHide:true})
    const got=await prepareVocalFile(source,opts)
    assert.notEqual(got,stale);assert.ok(seconds(got)>17.8)
  })
  await check('低音质输出为单声道16kHz且完整',async()=>{
    const got=await prepareVocalFile(source,{...opts,lowQuality:true})
    const stream=probe(got).streams.find(s=>s.codec_type==='audio')
    assert.equal(stream.channels,1);assert.equal(Number(stream.sample_rate),16000);assert.ok(seconds(got)>17.8)
  })
  await check('同时转码不会写入同一文件',async()=>{
    const files=await Promise.all([prepareVocalFile(source,opts),prepareVocalFile(source,opts)])
    assert.notEqual(files[0],files[1]);files.forEach(f=>assert.ok(seconds(f)>17.8))
  })
  await check('音频时长与歌曲元数据严重不符时拒绝',async()=>{
    await assert.rejects(prepareVocalFile(source,{...opts,expectedSeconds:60}),/音频不完整/)
  })
  const mp3=path.join(root,'free.mp3')
  execFileSync('ffmpeg',['-v','error','-i',source,'-c:a','libmp3lame','-b:a','128k',mp3],{windowsHide:true})
  const plainMp3=fs.readFileSync(mp3)
  server=http.createServer((req,res)=>{
    if(req.url==='/mp3'){res.writeHead(200,{'Content-Type':'audio/mpeg'});res.end(plainMp3);return}
    if(req.url==='/bad'){res.writeHead(200,{'Content-Type':'audio/flac'});res.end(broken)}
    else if(req.url==='/good'){res.writeHead(200,{'Content-Type':'audio/flac'});res.end(full)}
    else{res.writeHead(502);res.end('unavailable')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const url='http://127.0.0.1:'+server.address().port
  const invoke=async (suffix, channel='library', protocol='icqq')=>{
    const messages=[],uploads=[],voices=[]
    const event={bot:{adapter:{id:'QQ',name:protocol,protocol,standard:protocol==='icqq'?'icqq':'onebot11'},
      uploadFile:async(contact,file,name)=>uploads.push({bytes:fs.readFileSync(file),name})},contact:{scene:'group',peer:'1'},group_id:1,
      group:{sendFile:async(file,name)=>uploads.push({bytes:fs.readFileSync(file),name}),fs:{upload:async(file,pid,name)=>uploads.push({bytes:fs.readFileSync(file),name})}},
      reply:async msg=>{messages.push(msg);if(msg?.type==='record'){assert.ok(fs.existsSync(msg.file),'不得回退为远程未知音源');voices.push(seconds(msg.file))}},
    }
    const result=await deliverSong(event,{songName:'fixture',singerName:'test',interval:18},{url:url+suffix,quality:suffix==='/mp3'?'128':'flac',playChannel:channel,ext:suffix==='/mp3'?'.mp3':'.flac'})
    return {result,messages,uploads,voices}
  }
  await check('真实下载→校验→发送：坏音源不发语音也不上传坏文件',async()=>{
    const got=await invoke('/bad')
    assert.equal(got.result.ok,false);assert.equal(got.result.reason,'vocal_prepare_fail')
    assert.equal(got.voices.length,0);assert.equal(got.uploads.length,0)
    assert.ok(got.messages.some(x=>typeof x==='string'&&x.includes('校验失败')))
    assert.equal(fs.readdirSync(cfg.tempDir).length,0)
  })
  await check('真实下载→发送：完整语音和原始FLAC正常',async()=>{
    const got=await invoke('/good')
    assert.equal(got.result.ok,true);assert.equal(got.voices.length,1);assert.ok(got.voices[0]>17.8)
    assert.equal(got.uploads.length,1);assert.deepEqual(got.uploads[0].bytes,full)
    assert.equal(fs.readdirSync(cfg.tempDir).length,0)
  })
  await check('官方明文FLAC通过相同链路保持原始字节',async()=>{
    const got=await invoke('/good','official')
    assert.equal(got.result.ok,true);assert.deepEqual(got.uploads[0].bytes,full);assert.ok(got.voices[0]>17.8)
  })
  await check('普通官方128k明文MP3保持完整且不改原文件',async()=>{
    const got=await invoke('/mp3','official')
    assert.equal(got.result.ok,true);assert.deepEqual(got.uploads[0].bytes,plainMp3);assert.ok(got.voices[0]>17.8)
  })
  await check('下载502后不绕过校验直接发送URL',async()=>{
    const got=await invoke('/error')
    assert.equal(got.result.ok,false);assert.equal(got.voices.length,0);assert.equal(got.uploads.length,0)
  })
  await check('OneBot / Karin 原生上传路径仍发送完整文件',async()=>{
    const got=await invoke('/good','official','napcat')
    assert.equal(got.result.ok,true);assert.deepEqual(got.uploads[0].bytes,full);assert.equal(got.uploads.length,1);assert.ok(got.voices[0]>17.8)
  })
  if(process.env.QQMUSIC_TEST_BAD_AUDIO){
    await check('提供的损坏实机音频被拒绝',async()=>{
      await assert.rejects(prepareVocalFile(path.resolve(process.env.QQMUSIC_TEST_BAD_AUDIO),{directExt:new Set(['flac']),maxBytes:Infinity,lowQuality:false}),/vocal:/)
    })
  }
  console.log('All '+passed+' voice-integrity checks passed (no real QQ messages sent)')
} finally {
  if(server) await new Promise(resolve=>server.close(resolve))
  if(path.dirname(path.resolve(root))!==path.resolve(parent))throw new Error('unexpected-test-directory')
  fs.rmSync(root,{recursive:true,force:true})
}

// node-karin may keep framework watchers alive; all checks and cleanup above are awaited.
process.exit(0)
