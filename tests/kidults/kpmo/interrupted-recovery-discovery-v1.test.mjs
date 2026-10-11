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
 f.call=()=>discoverInterruptedRecoveryCandidates({sourceSha:sha('e'),upstream:{created_at:'2026-10-11T09:59:00Z'},get:f.get,readBytes:async()=>f.bytes,archiveReader:f.archiveReader,now:()=>now});return f;
}
test('real failure archive supplies only a hint, followed by exact merged graph/native readback',async()=>{const f=fixture(),r=await f.call();assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].request.original_run_id,'100');assert.ok(f.calls.some(r=>r.includes('event=repository_dispatch&status=failure')));});
test('UNKNOWN #1677 never becomes a candidate or PR read',async()=>{const f=fixture();f.tuple.pull_request=1677;f.build();assert.equal((await f.call()).candidates.length,0);assert.equal(f.calls.some(r=>r==='pulls/1677'),false);});
test('legacy/missing immutable original tuple is explicit unresolved observation',async()=>{const f=fixture();delete f.receipt.original_reservation;f.build();const r=await f.call();assert.equal(r.candidates.length,0);assert.equal(r.unrecoverable_legacy_or_missing_artifacts,1);});
for(const [name,mutate] of [['borrowed run',f=>f.artifact.workflow_run.id=101],['digest',f=>f.artifact.digest='sha256:'+'0'.repeat(64)],['original run spoof',f=>{f.tuple.original_run_id='101';f.build();}]])test('failure hint rejects '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(f.call());});

test('expired original artifact remains unresolved without archive read or global scan failure',async()=>{const f=fixture();f.artifact.expired=true;const r=await f.call();assert.equal(r.candidates.length,0);assert.equal(r.unresolved[0].state,'EXPIRED_ORIGINAL_ARTIFACT_READ_ONLY_UNRESOLVED');assert.equal(r.unrecoverable_legacy_or_missing_artifacts,1);});
