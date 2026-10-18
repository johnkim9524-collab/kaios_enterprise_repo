import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {discoverInterruptedRecoveryCandidates} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-discovery-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha=x=>x.repeat(40),now=Date.parse('2026-10-11T10:00:00Z');
function zipReceipt(value){
 const name=Buffer.from('receipt.json'),body=Buffer.from(JSON.stringify(value));let crc=0xffffffff;
 for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+body.length,16);
 return Buffer.concat([local,name,body,central,name,end]);
}
function fixture(){
 const tuple={pull_request:42,base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),original_run_id:'100',original_run_attempt:1};
 const receipt={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',state:'QUARANTINED',authorization_generation:tuple.original_generation,original_reservation:tuple,merge_performed:true,terminal_evidence:null,retry_without_reconciliation:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 const f={tuple,receipt,run:{id:100,run_attempt:1,path:'.github/workflows/kidults-autonomous-track-authorization-v1.yml',event:'repository_dispatch',head_branch:'main',head_sha:sha('a'),status:'completed',conclusion:'failure',repository:{full_name:repo,id:1281328888},updated_at:'2026-10-11T08:00:00Z',run_started_at:'2026-10-11T07:50:00Z'},calls:[]};
 f.build=()=>{f.bytes=zipReceipt(f.receipt);
 f.artifact={id:500,name:'kidults-autonomous-internal-landing-finalizer-100-1',size_in_bytes:f.bytes.length,digest:'sha256:'+createHash('sha256').update(f.bytes).digest('hex'),expired:false,workflow_run:{id:100,head_sha:sha('a')},created_at:'2026-10-11T08:00:00Z',expires_at:'2027-01-01T00:00:00Z'};};f.build();
 f.get=async r=>{f.calls.push(r);if(r.includes('/runs?'))return r.includes('track-authorization')&&r.includes('status=failure')?{total_count:1,workflow_runs:[f.run]}:{total_count:0,workflow_runs:[]};
 if(r==='actions/runs/100/artifacts?per_page=100')return {total_count:1,artifacts:[f.artifact]};
 if(r==='actions/runs/100')return f.run;
 if(r==='branches/main')return {name:'main',protected:true,commit:{sha:sha('e')}};
 if(r==='pulls/42')return {number:42,merged:true,state:'closed',merge_commit_sha:sha('d'),merged_at:'2026-10-11T08:00:00Z',head:{sha:sha('b'),repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}};
 if(r==='git/commits/'+sha('d'))return {sha:sha('d'),tree:{sha:sha('c')},parents:[{sha:sha('a')},{sha:sha('b')}]};
 if(r.startsWith('compare/'))return {base_commit:{sha:sha('d')},merge_base_commit:{sha:sha('d')},behind_by:0,status:'ahead'};
 throw Error('unknown '+r);};
 f.archiveReader=(bytes,expected)=>{assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),expected);return {members:[{name:'receipt.json',encoding:'utf-8',text:JSON.stringify(f.receipt)}]};};
 f.call=(observedNow=now)=>discoverInterruptedRecoveryCandidates({sourceSha:sha('e'),upstream:{created_at:'2026-10-11T09:59:00Z',updated_at:'2026-10-11T09:59:00Z'},get:f.get,readBytes:async()=>f.bytes,archiveReader:f.archiveReader,now:()=>observedNow});return f;
}
test('real failure archive supplies only a hint, followed by exact merged graph/native readback',async()=>{const f=fixture(),r=await f.call();assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].request.original_run_id,'100');assert.ok(f.calls.some(r=>r.includes('event=repository_dispatch&status=failure')));});
test('roles derive the same recovery request from one shared authenticated timestamp',async()=>{
 const f=fixture(),one=await f.call(now+1000),two=await f.call(now+5000);
 assert.deepEqual(one.candidates[0].request,two.candidates[0].request);
 assert.equal(one.candidates[0].request.issued_at,'2026-10-11T09:59:00.000Z');
 await assert.rejects(f.call(now+1800000),/SHARED_REQUEST_WINDOW/);
});
test('UNKNOWN #1677 never becomes a candidate or PR read',async()=>{const f=fixture();f.tuple.pull_request=1677;f.build();assert.equal((await f.call()).candidates.length,0);assert.equal(f.calls.some(r=>r==='pulls/1677'),false);});
test('legacy/missing immutable original tuple is explicit unresolved observation',async()=>{const f=fixture();delete f.receipt.original_reservation;f.build();const r=await f.call();assert.equal(r.candidates.length,0);assert.equal(r.unrecoverable_legacy_or_missing_artifacts,1);});
for(const [name,mutate] of [['borrowed run',f=>f.artifact.workflow_run.id=101],['digest',f=>f.artifact.digest='sha256:'+'0'.repeat(64)],['original run spoof',f=>{f.tuple.original_run_id='101';f.build();}]])test('failure hint rejects '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(f.call());});

test('expired original artifact remains unresolved without archive read or global scan failure',async()=>{const f=fixture();f.artifact.expired=true;const r=await f.call();assert.equal(r.candidates.length,0);assert.equal(r.unresolved[0].state,'EXPIRED_ORIGINAL_ARTIFACT_READ_ONLY_UNRESOLVED');assert.equal(r.unrecoverable_legacy_or_missing_artifacts,1);});

function exactFixture(){
 const f=fixture();f.tuple.pull_request=2655;f.tuple.original_generation='pr-2655-original-generation';f.receipt.authorization_generation=f.tuple.original_generation;f.build();
 f.parent={kind:'TERMINAL_NULL_ASSURANCE_FAILURE_V1',source_sha:sha('e'),terminal_check_id:'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL',terminal_check_reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',terminal_check_evidence_refs:['100',500,f.artifact.digest]};
 const originalGet=f.get;f.get=async r=>{
   if(r==='actions/artifacts/500'){f.calls.push(r);return f.artifact;}
   if(r==='pulls/2655'){const index=f.calls.length;const p=await originalGet('pulls/42');f.calls[index]=r;return {...p,number:2655};}
   return originalGet(r);
 };
 f.reads=[];f.call=()=>discoverInterruptedRecoveryCandidates({sourceSha:sha('e'),upstream:{updated_at:'2026-10-11T09:59:00Z',recovery_parent:f.parent},get:f.get,readBytes:async r=>{f.reads.push(r);return f.bytes;},archiveReader:f.archiveReader,now:()=>now});
 f.rebind=()=>{f.build();f.parent.terminal_check_evidence_refs[2]=f.artifact.digest;};return f;
}
test('authenticated failure parent narrows discovery to exact original run/artifact and still verifies graph',async()=>{
 const f=exactFixture(),r=await f.call();assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].request.pull_request,2655);
 assert.equal(f.calls.filter(x=>x.includes('/runs?')).length,0);assert.equal(f.calls.filter(x=>x.includes('/artifacts?')).length,0);
 assert.deepEqual(f.reads,['actions/artifacts/500/zip']);assert.ok(f.calls.includes('git/commits/'+sha('d')));assert.ok(f.calls.includes('branches/main'));
});
for(const [name,mutate] of [
 ['wrong kind',f=>f.parent.kind='UNKNOWN'],['wrong source',f=>f.parent.source_sha=sha('a')],['missing refs',f=>delete f.parent.terminal_check_evidence_refs],
 ['extra ref',f=>f.parent.terminal_check_evidence_refs.push('extra')],['unsafe run',f=>f.parent.terminal_check_evidence_refs[0]='9999999999999999'],
 ['fractional artifact',f=>f.parent.terminal_check_evidence_refs[1]=500.5],['bad digest',f=>f.parent.terminal_check_evidence_refs[2]='bad'],
 ['wrong terminal check',f=>f.parent.terminal_check_id='OTHER'],
 ['array run',f=>f.parent.terminal_check_evidence_refs[0]=['100']],['object run',f=>f.parent.terminal_check_evidence_refs[0]={toString:()=> '100'}],
 ['boolean run',f=>f.parent.terminal_check_evidence_refs[0]=true],['array digest',f=>f.parent.terminal_check_evidence_refs[2]=[f.artifact.digest]]
])test('exact pointer rejects '+name+' before any API read',async()=>{const f=exactFixture();mutate(f);await assert.rejects(f.call(),/EXACT_PARENT_POINTER/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.reads,[]);});
for(const [name,mutate] of [
 ['run id',f=>f.run.id=101],['foreign repository',f=>f.run.repository.full_name='other/repo'],['wrong path',f=>f.run.path='.github/workflows/other.yml'],
 ['manual event',f=>f.run.event='workflow_dispatch'],['wrong branch',f=>f.run.head_branch='other'],['rerun',f=>f.run.run_attempt=2],['success',f=>f.run.conclusion='success'],
 ['artifact id',f=>f.artifact.id=501],['artifact name',f=>f.artifact.name='borrowed'],['artifact digest',f=>f.artifact.digest='sha256:'+'0'.repeat(64)],
 ['artifact run',f=>f.artifact.workflow_run.id=101],['artifact source',f=>f.artifact.workflow_run.head_sha=sha('f')],
 ['oversized artifact',f=>f.artifact.size_in_bytes=9*1024*1024],['artifact before run',f=>f.artifact.created_at='2026-10-11T07:49:00Z']
])test('exact original rejects '+name+' without archive or historical fallback',async()=>{const f=exactFixture();mutate(f);await assert.rejects(f.call());assert.deepEqual(f.reads,[]);assert.equal(f.calls.some(x=>x.includes('/runs?')),false);});
for(const [name,mutate] of [
 ['wrong PR',f=>{f.tuple.pull_request=42;f.rebind();}],['missing original',f=>{delete f.receipt.original_reservation;f.rebind();}],
 ['run spoof',f=>{f.tuple.original_run_id='101';f.rebind();}],['non-null terminal',f=>{f.receipt.terminal_evidence={};f.rebind();}],
 ['mutated archive bytes',f=>f.bytes=Buffer.alloc(f.bytes.length)],['duplicate receipt',f=>{const reader=f.archiveReader;f.archiveReader=(...a)=>{const p=reader(...a);return {members:[...p.members,...p.members]};};}]
])test('exact archive rejects '+name+' without fallback',async()=>{const f=exactFixture();mutate(f);await assert.rejects(f.call());assert.equal(f.calls.some(x=>x.includes('/runs?')),false);});
test('exact original still in conservative token window reads no artifact or archive',async()=>{const f=exactFixture();f.run.updated_at='2026-10-11T09:59:00Z';assert.equal((await f.call()).candidates.length,0);assert.deepEqual(f.calls,['actions/runs/100']);assert.deepEqual(f.reads,[]);});
test('exact expired artifact remains explicitly unresolved without archive',async()=>{const f=exactFixture();f.artifact.expired=true;const r=await f.call();assert.equal(r.candidates.length,0);assert.equal(r.unresolved[0].state,'EXPIRED_ORIGINAL_ARTIFACT_READ_ONLY_UNRESOLVED');assert.deepEqual(f.reads,[]);});
for(const stage of ['metadata','archive'])test('exact '+stage+' quota error is preserved with no retry or fallback',async()=>{
 const f=exactFixture(),error=Error('API_403 installation rate limit exceeded');if(stage==='metadata'){const get=f.get;f.get=async r=>{if(r==='actions/artifacts/500'){f.calls.push(r);throw error;}return get(r);};}
 else {const get=f.get;f.get=async r=>get(r);f.call=()=>discoverInterruptedRecoveryCandidates({sourceSha:sha('e'),upstream:{updated_at:'2026-10-11T09:59:00Z',recovery_parent:f.parent},get:f.get,readBytes:async r=>{f.reads.push(r);throw error;},archiveReader:f.archiveReader,now:()=>now});}
 await assert.rejects(f.call(),e=>e===error);assert.equal(f.calls.some(x=>x.includes('/runs?')),false);assert.ok(f.reads.length<=1);
});
for(const stage of ['main','merge graph'])test('exact discovery retains '+stage+' drift rejection',async()=>{const f=exactFixture(),get=f.get;f.get=async r=>{const p=await get(r);if(stage==='main'&&r==='branches/main')p.commit.sha=sha('f');if(stage==='merge graph'&&r==='git/commits/'+sha('d'))p.parents.reverse();return p;};await assert.rejects(f.call());});
test('generic discovery preserves all nine role/conclusion historical queries',async()=>{const f=fixture();await f.call();assert.equal(f.calls.filter(x=>x.includes('/runs?')).length,9);});
