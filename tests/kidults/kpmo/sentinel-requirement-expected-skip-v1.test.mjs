import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {SPECS,evaluateProducer,evaluateHealth} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {REPOSITORY,digest} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';

const sha='a'.repeat(40), observed='2026-09-08T08:00:00Z';
const spec=SPECS.find(x=>x.id==='REQUIREMENT');
const run={id:700,run_attempt:1,repository:{full_name:REPOSITORY},path:spec.path,head_branch:'main',head_sha:sha,event:'workflow_run',status:'completed',conclusion:'failure',created_at:'2026-09-08T07:00:00Z',run_started_at:'2026-09-08T07:00:01Z'};

function zipMember(name,raw){
  const n=Buffer.from(name),v=Buffer.from(raw),c=deflateRawSync(v);let crc=0xffffffff;
  for(const byte of v){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const l=Buffer.alloc(30),h=Buffer.alloc(46),e=Buffer.alloc(22);
  l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(c.length,18);l.writeUInt32LE(v.length,22);l.writeUInt16LE(n.length,26);
  h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(8,10);h.writeUInt32LE(crc,16);h.writeUInt32LE(c.length,20);h.writeUInt32LE(v.length,24);h.writeUInt16LE(n.length,28);
  e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(h.length+n.length,12);e.writeUInt32LE(l.length+n.length+c.length,16);
  return Buffer.concat([l,n,c,h,n,e]);
}

function receipt(extra={}){
  return {id:'kidults-asi-requirement-coverage-admission-v1',version:'1.0.0',state:'VERIFIED_FAIL',admission:'INVALID_OR_FAILED',reason:'ARL_NOT_SUCCESS',repository:REPOSITORY,execution_sha:sha,arl_run_id:650,arl_run_attempt:1,arl_head_sha:sha,classification:'EXPECTED_NONAUTHORITATIVE_SKIP',classification_reason:'PRODUCER_EVENT_MISMATCH',should_run:false,promotion_authority:false,production:'HOLD',public_release:'HOLD',g5:'HOLD',...extra};
}
function fixture(value=receipt()){
  const bytes=zipMember('coverage-admission-v1.json',`${JSON.stringify(value)}\n`);
  const artifact={id:701,name:`kidults-asi-requirement-coverage-admission-v1-${run.id}-${run.run_attempt}`,expired:false,digest:digest(bytes),size_in_bytes:bytes.length,created_at:'2026-09-08T07:00:10Z',expires_at:'2026-12-01T00:00:00Z',workflow_run:{id:run.id,head_sha:sha}};
  return {bytes,artifact};
}

test('proven expected-nonauthoritative Requirement failure envelope is HOLD, never authoritative RED or PASS',()=>{
  const {bytes,artifact}=fixture();
  const result=evaluateProducer(spec,[run],{[run.id]:[artifact]},sha,observed,{[artifact.id]:bytes});
  assert.equal(result.state,'VERIFIED_HOLD');
  assert.equal(result.failure_class,'LATEST_EXPECTED_NONAUTHORITATIVE_SKIP');
  assert.equal(result.expected_non_authoritative_skip_verified,true);
  assert.equal(result.artifact_content_validated,true);
});

test('genuine Requirement failure without an expected-skip receipt remains RED',()=>{
  const result=evaluateProducer(spec,[run],{},sha,observed,{});
  assert.equal(result.state,'VERIFIED_FAIL');
  assert.equal(result.failure_class,'LATEST_APPLICABLE_FAILURE');
});

test('authority elevation in an expected-skip receipt is rejected RED',()=>{
  const {bytes,artifact}=fixture(receipt({promotion_authority:true}));
  const result=evaluateProducer(spec,[run],{[run.id]:[artifact]},sha,observed,{[artifact.id]:bytes});
  assert.equal(result.state,'VERIFIED_FAIL');
  assert.equal(result.failure_class,'REQUIREMENT_EXPECTED_SKIP_RECEIPT_REJECTED');
});

test('wrong-generation expected-skip receipt is rejected RED',()=>{
  const {bytes,artifact}=fixture(receipt({execution_sha:'b'.repeat(40)}));
  const result=evaluateProducer(spec,[run],{[run.id]:[artifact]},sha,observed,{[artifact.id]:bytes});
  assert.equal(result.state,'VERIFIED_FAIL');
  assert.equal(result.failure_class,'REQUIREMENT_EXPECTED_SKIP_RECEIPT_REJECTED');
});

test('duplicate expected-skip receipts are rejected RED without best-effort selection',()=>{
  const {bytes,artifact}=fixture();const duplicate={...artifact,id:702};
  const result=evaluateProducer(spec,[run],{[run.id]:[artifact,duplicate]},sha,observed,{[artifact.id]:bytes,[duplicate.id]:bytes});
  assert.equal(result.state,'VERIFIED_FAIL');
  assert.equal(result.failure_class,'REQUIREMENT_EXPECTED_SKIP_ARTIFACT_CARDINALITY_2');
});

test('verified expected skip cannot make the four-producer sentinel PASS by itself',()=>{
  const {bytes,artifact}=fixture();
  const result=evaluateHealth({repository:REPOSITORY,source_sha:sha,observed_at:observed,observer_run_id:900,observer_run_attempt:1,runs:{REQUIREMENT:[run]},artifacts_by_run:{[run.id]:[artifact]},archives_by_id:{[artifact.id]:bytes}});
  assert.equal(result.state,'VERIFIED_HOLD');
  assert.equal(result.failed_producers.length,0);
  assert.ok(result.waiting_producers.includes('REQUIREMENT'));
  assert.equal(result.whole_platform_authority,false);
  assert.equal(result.promotion_eligible,false);
  assert.equal(result.production,'HOLD');assert.equal(result.public,'HOLD');assert.equal(result.g5,'HOLD');
});
