import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fetchBoundedPublicGitPack,gitPacketLine as packet} from '../../../scripts/kidults/kpmo/lib/bounded-git-public-transport-v1.mjs';
import {gitObjectId} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs';
const commit=Buffer.from('tree '+ 'a'.repeat(40)+'\nauthor fixture <fixture@example.invalid> 0 +0000\ncommitter fixture <fixture@example.invalid> 0 +0000\n\nfixture\n'),sha=gitObjectId('commit',commit);
let size=commit.length,head=[0x90|(size&15)];size=Math.floor(size/16);while(size){let b=size&127;size=Math.floor(size/128);if(size)b|=128;head.push(b);}
const raw=Buffer.concat([Buffer.from('PACK'),Buffer.from([0,0,0,2,0,0,0,1]),Buffer.from(head),deflateSync(commit)]),pack=Buffer.concat([raw,createHash('sha1').update(raw).digest()]);
const advert=Buffer.concat([packet('version 2\n'),packet('fetch=shallow\n'),packet('object-format=sha1\n'),Buffer.from('0000')]);
const result=Buffer.concat([packet('shallow-info\n'),packet('shallow '+sha+'\n'),Buffer.from('0001'),packet('packfile\n'),packet(Buffer.concat([Buffer.from([1]),pack])),Buffer.from('0000')]);
function fixture({advertisement=advert,body=result,status=200,type='application/x-git-upload-pack-result'}={}){const trace=[];return{trace,request:async(url,options)=>{trace.push({url,options});return new Response(trace.length===1?advertisement:body,{status,headers:{'content-type':trace.length===1?'application/x-git-upload-pack-advertisement':type}});}};}
test('anonymous bounded protocol performs exactly two fixed-origin reads without checkout or credentials',async()=>{
  const f=fixture(),p=await fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request});assert.equal(f.trace.length,2);assert.deepEqual((await p.readObject(sha)).bytes,commit);
  for(const {url,options} of f.trace){assert.ok(url.startsWith('https://github.com/johnkim9524-collab/kaios_enterprise_repo.git/'));assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal('Authorization' in options.headers,false);}
  assert.equal(f.trace[0].options.method,'GET');assert.equal(f.trace[1].options.method,'POST');
  const body=f.trace[1].options.body.toString();assert.ok(body.includes('want '+sha));assert.ok(body.includes('deepen 1'));assert.doesNotMatch(body,/thin-pack|filter |want-ref|packfile-uris|include-tag/);
  assert.equal(p.receipt().requests,2);assert.equal(p.receipt().shared_dispatcher_request_accounting_verified,false);assert.equal(p.receipt().authorization_created,false);
});
for(const sourceShas of [[],['main'],[sha,sha]])test('invalid source set '+JSON.stringify(sourceShas),async()=>{const f=fixture();await assert.rejects(fetchBoundedPublicGitPack({sourceShas,request:f.request}),/CONFIGURATION_INVALID/);assert.equal(f.trace.length,0);});
test('foreign origin, widened limits and credentials are not a fallback',async()=>{const f=fixture();for(const change of [{repository:'other/repo'},{limits:{responseBytes:64*1024*1024+1}},{limits:{retries:1}}])await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request,...change}),/CONFIGURATION_INVALID/);assert.equal(f.trace.length,0);});
for(const [name,advertisement] of [['v1',Buffer.concat([packet('version 1\n'),Buffer.from('0000')])],['no shallow',Buffer.concat([packet('version 2\n'),packet('fetch=filter\n'),Buffer.from('0000')])],['sha256',Buffer.concat([packet('version 2\n'),packet('fetch=shallow\n'),packet('object-format=sha256\n'),Buffer.from('0000')])]])test('unsupported capability '+name+' aborts before POST',async()=>{const f=fixture({advertisement});await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request}),/PROTOCOL_INVALID|CAPABILITY_INVALID/);assert.equal(f.trace.length,1);});
for(const [name,body,code] of [['external URI',Buffer.concat([packet('packfile-uris\n'),Buffer.from('0000')]),'SECTION_INVALID'],['remote failure',Buffer.concat([packet('packfile\n'),packet(Buffer.from([3,65])),Buffer.from('0000')]),'REMOTE_ABORT'],['truncated',result.subarray(0,-1),'PACKET_TRUNCATED'],['unknown channel',Buffer.concat([packet('packfile\n'),packet(Buffer.from([9,65])),Buffer.from('0000')]),'CHANNEL_INVALID'],['missing finish',result.subarray(0,-4),'PACK_INCOMPLETE'],['data after finish',Buffer.concat([result,packet('unexpected\n')]),'TRAILING_PACKETS']])test('protocol failure '+name+' never returns source objects',async()=>{const f=fixture({body});await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request}),new RegExp(code));assert.equal(f.trace.length,2);});
test('stream byte budget stops before returning a pack',async()=>{const f=fixture();await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request,limits:{responseBytes:32}}),/RESPONSE_BYTES_EXHAUSTED/);});
test('HTTP failure and HTML response have no retry or sign-in fallback',async()=>{for(const opts of [{status:403},{type:'text/html'}]){const f=fixture(opts);await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request}),/RESPONSE_INVALID/);assert.ok(f.trace.length<=2);}});
test('timeout bounds an unresponsive request even if callback ignores AbortSignal',async()=>{let calls=0;await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:async()=>{calls++;return new Promise(()=>{});},limits:{milliseconds:5}}),/TIME_EXHAUSTED/);assert.equal(calls,1);});
test('unbound shallow boundary does not produce partial input',async()=>{const f=fixture();await assert.rejects(fetchBoundedPublicGitPack({sourceShas:['b'.repeat(40)],request:f.request}),/OBJECT_MISSING|SHALLOW_INVALID/);});

test('exact GitHub smart-HTTP service preamble preserves strict v2 validation',async()=>{
  const f=fixture({advertisement:Buffer.concat([packet('# service=git-upload-pack\n'),Buffer.from('0000'),advert])});
  const p=await fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request});assert.equal(p.receipt().requests,2);
  const bad=fixture({advertisement:Buffer.concat([packet('# service=git-receive-pack\n'),Buffer.from('0000'),advert])});
  await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:bad.request}),/PROTOCOL_INVALID/);assert.equal(bad.trace.length,1);
});

test('empty stream fragments fail before POST without consuming a source',async()=>{
 let calls=0;await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array());controller.enqueue(advert);controller.close();}}),{headers:{'content-type':'application/x-git-upload-pack-advertisement'}});}}),/EMPTY_CHUNK_INVALID/);assert.equal(calls,1);
});
test('fragment count is bounded independently of payload bytes',async()=>{
 let calls=0;await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],limits:{chunks:2},request:async()=>{calls++;return new Response(new ReadableStream({start(controller){for(const b of advert)controller.enqueue(Uint8Array.of(b));controller.close();}}),{headers:{'content-type':'application/x-git-upload-pack-advertisement'}});}}),/CHUNK_BUDGET_EXHAUSTED/);assert.equal(calls,1);
});
test('shared Dispatcher global error and diagnostics survive transport failure',async()=>{
 const error=Object.assign(new Error('DISPATCH_READ_BUDGET_EXHAUSTED'),{code:'DISPATCH_READ_BUDGET_EXHAUSTED',global:true,read_diagnostics:{request_count:256}});let calls=0;
 await assert.rejects(fetchBoundedPublicGitPack({sourceShas:[sha],request:async()=>{calls++;throw error;}}),e=>e===error);assert.equal(calls,1);
});

test('GitHub shallow pkt-line may omit its optional final LF without registering extra sources',async()=>{
 const body=Buffer.concat([packet('shallow-info\n'),packet('shallow '+sha),Buffer.from('0001'),packet('packfile\n'),packet(Buffer.concat([Buffer.from([1]),pack])),Buffer.from('0000')]);const f=fixture({body});
 const p=await fetchBoundedPublicGitPack({sourceShas:[sha],request:f.request});assert.equal(p.receipt().source_count,1);assert.deepEqual((await p.readObject(sha)).bytes,commit);
});
