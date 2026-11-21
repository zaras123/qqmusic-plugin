import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

// Use the branch's production entrypoint and synthetic API/CDN responses.
const root = fileURLToPath(new URL('../', import.meta.url))
const targets = ["dist/utils/api.js"]
const fake = name => 'https://cdn-fixture.invalid/' + name;
const qq = (name, quality = '128', rest = {}) => ({ url: fake(name), quality, ...rest });
const old = qq('cached');
const renewed = qq('renewed');
const qualityLadder = ['atmos_master', 'master', 'atmos', 'hires', 'flac', 'ape', '320', 'm4a', '128'];
function harness(relative, api, head = url => url === renewed.url ? 206 : 404) {
  const source = fs.readFileSync(path.join(root,relative),'utf8');
  const start = source.indexOf('export async function songUrl(');
  const finish = source.indexOf('export async function lyric(', start);
  assert.ok(start>=0 && finish>start, relative);
  const slice = source.slice(start,finish).replace(/^export /gm,'');
  const calls=[];
  const lookups=[];
  const sandbox = {
    Buffer, Error, UA:'fixture', QUALITY_LABEL:{}, QUALITY_LADDER:qualityLadder,
    isExternalPlatformMid:id=>id.startsWith('ne_'), songDetail:async()=>({}),
    summarizeFileSizes:()=>({}), logInfo:()=>{}, logWarn:()=>{},
    mapSongUrlBody:body=>body,
    emptyUrlResult:(quality,mediaId,extra)=>({quality,mediaId,...extra}),
    request:async(endpoint, params, method, userKey, options)=>{
      calls.push({endpoint,params,method,userKey,options});
      return api(params,calls.length);
    },
    axios:{
      head:async(url, opts)=>{
        lookups.push({method:'head',url,timeout:opts.timeout});
        return {status:head(url,lookups)};
      },
      get:async(url,opts)=>{
        lookups.push({method:'get',url,timeout:opts.timeout});
        assert.equal(opts.headers.Range,'bytes=0-1023');
        return {status:404,data:Buffer.alloc(0)};
      },
    },
  };
  const play = vm.runInNewContext(slice+'\nsongUrlBest',sandbox,{filename:relative});
  return { play, calls, lookups };
}
for (const rel of targets) {
  test(rel + ' refreshes a dead cached 128 link once even with fallback disabled', async()=>{
    const h=harness(rel,p=>p.fresh?renewed:old);
    const res=await h.play('fixtureSong',{quality:'128',fallback:false,userKey:'fixture-slot',mediaId:'fixture-media'});
    assert.equal(res.url,renewed.url);
    assert.equal(res.quality,'128');
    assert.equal(h.calls.length,2);
    const call=h.calls[1];
    assert.equal(call.endpoint,'/song/url');
    assert.equal(call.userKey,'fixture-slot');
    assert.equal(call.params.mediaId,'fixture-media');
    assert.equal(call.params.quality,'128');
    assert.equal(call.params.fallback,undefined);
    assert.equal(call.params.local,0);
    assert.equal(call.params.archive,0);
    assert.equal(call.options.timeout,4000);
    assert.equal(h.lookups.at(-1).timeout,2500);
  });
  test(rel + ' rechecks an unchanged URL if the first failure was transient', async()=>{
    let headCalls=0;
    const h=harness(rel,()=>old,()=>++headCalls===1?503:206);
    assert.equal((await h.play('fixtureSong',{quality:'128'})).url,old.url);
    assert.equal(h.calls.length,2);
    assert.equal(headCalls,2);
  });
  test(rel + ' healthy direct links and probe:false do not retry',async()=>{
    let h=harness(rel,()=>renewed);
    assert.equal((await h.play('fixtureSong',{quality:'128'})).url,renewed.url);
    assert.equal(h.calls.length,1);
    h=harness(rel,()=>old);
    assert.equal((await h.play('fixtureSong',{quality:'128',probe:false})).url,old.url);
    assert.equal(h.calls.length,1);
    assert.equal(h.lookups.length,0);
  });
  test(rel + ' confirmed dead links fail once after a bounded retry',async()=>{
    const h=harness(rel,()=>old);
    await assert.rejects(h.play('fixtureSong',{quality:'128'}),/128 CDN 不可用 已尝试: 128:cdn-dead/);
    assert.equal(h.calls.length,2);
    assert.equal(h.calls.filter(x=>x.params.fresh===1).length,1);
  });
  test(rel + ' a fresh link at a different tier does not bypass the requested tier policy',async()=>{
    const h=harness(rel,p=>p.fresh?{...renewed,quality:'m4a'}:old);
    await assert.rejects(h.play('fixtureSong',{quality:'128',fallback:false}),/128 CDN 不可用/);
    assert.equal(h.calls.length,2);
    assert.equal(h.lookups.some(x=>x.url===renewed.url),false);
  });
  test(rel + ' external and local links are not retried as official QQ links',async()=>{
    for (const [id,body] of [['ne_external',{...old,external:true}],['fixtureSong',{...old,local:true}]]) {
      const h=harness(rel,()=>body);
      await assert.rejects(h.play(id,{quality:'128'}),/128 CDN 不可用/);
      assert.equal(h.calls.length,1);
    }
    const h=harness(rel,()=>old); // use the prefix even for a response missing the external flag
    await assert.rejects(h.play('ne_external',{quality:'128'}),/128 CDN 不可用/);
    assert.equal(h.calls.length,1);
  });
  test(rel + ' lower tiers keep the existing fallback and use at most one fresh lookup total',async()=>{
    const h=harness(rel,p=>p.quality==='flac'?qq('unhealthy-flac','flac'):renewed);
    const res=await h.play('fixtureSong',{quality:'flac'});
    assert.equal(res.quality,'128');
    assert.equal(h.calls.length,3);
    assert.equal(h.calls.filter(x=>x.params.fresh===1).length,1);
    assert.equal(h.calls.at(-1).params.fallback,1);
    assert.equal(h.calls.at(-1).params.quality,'ape');
  });
  test(rel + ' no-link error does not initiate a CDN retry',async()=>{
    const h=harness(rel,()=>({url:'',tip:'fixture upstream refused'}));
    await assert.rejects(h.play('fixtureSong',{quality:'128'}),/fixture upstream refused/);
    assert.equal(h.calls.length,1);
    assert.equal(h.lookups.length,0);
  });
}
