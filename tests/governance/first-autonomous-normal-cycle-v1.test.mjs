import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const runner = path.join(root, 'scripts/governance/run-first-autonomous-normal-cycle-v1.mjs');
const hex = (c, n) => c.repeat(n);
function fixture(dir) {
  const now = Date.now();
  const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(), tree=spawnSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).stdout.trim();
  const scope=path.join(dir,'scope.json'); fs.writeFileSync(scope,'{"task":"bounded-reversible-cycle"}\n');
  const receipt = {
    id:'kidults-delegated-autonomous-authority-receipt-v1',version:'1.0.0',state:'AUTHORIZED',authorization_id:`DAIA-2300-${hex('a',12)}`,
    repository:'johnkim9524-collab/kaios_enterprise_repo',base_sha:hex('1',40),head_sha:head,head_tree_sha:tree,scope_digest:`sha256:${crypto.createHash('sha256').update(fs.readFileSync(scope)).digest('hex')}`,action:'TEST_AND_VALIDATION',
    track_approval:{agent_id:'TRACK-A-01',role:'ACCOUNTABLE_TRACK_AGENT',decision:'APPROVE',approved_at:new Date(now).toISOString()},kpmo_approval:{agent_id:'KPMO-01',role:'KPMO',decision:'APPROVE',approved_at:new Date(now).toISOString()},
    tests:['first-cycle-regression','failure-recovery-negative'],rollback:{strategy:'restore exact baseline bytes',verified:true},issued_at:new Date(now-1000).toISOString(),expires_at:new Date(now+600000).toISOString(),nonce_digest:`sha256:${hex('5',64)}`,production:'HOLD',public:'HOLD',g5:'HOLD'
  };
  const authority = path.join(dir,'authority.json'); fs.writeFileSync(authority,JSON.stringify(receipt));
  const kpmoMarker = path.join(dir,'kpmo-bootstrap.json'); fs.writeFileSync(kpmoMarker,JSON.stringify({id:'kidults-ai-agent-bootstrap-consumption-v1',agent_id:'KPMO-01',task_id:'first-cycle',session_id:'kpmo-session',consumed_at:new Date().toISOString()}));
  const trackMarker = path.join(dir,'track-bootstrap.json'); fs.writeFileSync(trackMarker,JSON.stringify({id:'kidults-ai-agent-bootstrap-consumption-v1',agent_id:'TRACK-A-01',task_id:'first-cycle',session_id:'track-session',consumed_at:new Date().toISOString()}));
  return { receipt, authority, kpmoMarker, trackMarker, scope, ledger:path.join(dir,'durable-ledger') };
}
function run(scenario, mutate) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'first-cycle-test-')); const f=fixture(dir); if(mutate) mutate(f,dir);
  const output=path.join(dir,'receipt.json'); const r=f.receipt;
  const env={...process.env,EXPECTED_REPOSITORY:r.repository,EXPECTED_BASE_SHA:r.base_sha,EXPECTED_HEAD_SHA:r.head_sha,EXPECTED_HEAD_TREE_SHA:r.head_tree_sha,EXPECTED_SCOPE_DIGEST:r.scope_digest,EXPECTED_NONCE_DIGEST:r.nonce_digest};
  const result=spawnSync(process.execPath,[runner,`--authority-receipt=${f.authority}`,`--kpmo-bootstrap-marker=${f.kpmoMarker}`,`--track-bootstrap-marker=${f.trackMarker}`,`--scope-file=${f.scope}`,`--ledger-root=${f.ledger}`,`--output=${output}`,`--scenario=${scenario}`],{cwd:root,encoding:'utf8',env});
  return {result,output};
}
test('recover cycle proves failure, byte-exact rollback, retry, audit, and HOLD',()=>{const {result,output}=run('recover');assert.equal(result.status,0,result.stderr);const r=JSON.parse(fs.readFileSync(output));assert.equal(r.state,'COMPLETE_VERIFIED');assert.equal(r.attempts,2);assert.equal(r.rollback_verified,true);assert.deepEqual([r.production,r.public,r.g5],['HOLD','HOLD','HOLD']);assert.deepEqual(r.transitions.map(x=>x.state),['PLANNED','APPROVED','EXECUTING','FAILURE_DETECTED','ROLLED_BACK','EXECUTING','RECOVERED','AUDITED']);});
test('success cycle completes once without a false rollback claim',()=>{const {result,output}=run('success');assert.equal(result.status,0,result.stderr);const r=JSON.parse(fs.readFileSync(output));assert.equal(r.attempts,1);assert.equal(r.rollback_verified,false);});
test('violation path quarantines and requires newly bootstrapped replacement',()=>{const {result,output}=run('violation');assert.equal(result.status,0,result.stderr);const r=JSON.parse(fs.readFileSync(output));assert.equal(r.state,'HOLD');assert.equal(r.replacement_bootstrap_required,true);assert.ok(r.transitions.some(x=>x.state==='AGENT_QUARANTINED'));assert.ok(r.transitions.some(x=>x.state==='REPLACEMENT_BLOCKED'));});
test('mismatched KPMO bootstrap identity fails closed',()=>{const {result}=run('recover',(f)=>fs.writeFileSync(f.kpmoMarker,JSON.stringify({id:'kidults-ai-agent-bootstrap-consumption-v1',agent_id:'OTHER',task_id:'first-cycle',session_id:'kpmo-session',consumed_at:new Date().toISOString()})));assert.notEqual(result.status,0);assert.match(result.stderr,/KPMO_BOOTSTRAP_IDENTITY_MISMATCH/);});
test('same Track and KPMO identity fails closed',()=>{const {result}=run('recover',(f)=>{f.receipt.kpmo_approval.agent_id=f.receipt.track_approval.agent_id;fs.writeFileSync(f.authority,JSON.stringify(f.receipt));fs.writeFileSync(f.kpmoMarker,JSON.stringify({id:'kidults-ai-agent-bootstrap-consumption-v1',agent_id:f.receipt.track_approval.agent_id,task_id:'first-cycle',session_id:'kpmo-session',consumed_at:new Date().toISOString()}));});assert.notEqual(result.status,0);assert.match(result.stderr,/APPROVER_IDENTITIES_NOT_DISTINCT|DELEGATED_AUTHORITY_NOT_CONSUMED/);});
test('authority receipt is single-use across processes sharing the durable ledger',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'first-cycle-replay-'));const f=fixture(dir),r=f.receipt,env={...process.env,EXPECTED_REPOSITORY:r.repository,EXPECTED_BASE_SHA:r.base_sha,EXPECTED_HEAD_SHA:r.head_sha,EXPECTED_HEAD_TREE_SHA:r.head_tree_sha,EXPECTED_SCOPE_DIGEST:r.scope_digest,EXPECTED_NONCE_DIGEST:r.nonce_digest};const invoke=(name)=>spawnSync(process.execPath,[runner,`--authority-receipt=${f.authority}`,`--kpmo-bootstrap-marker=${f.kpmoMarker}`,`--track-bootstrap-marker=${f.trackMarker}`,`--scope-file=${f.scope}`,`--ledger-root=${f.ledger}`,`--output=${path.join(dir,name)}`,'--scenario=success'],{cwd:root,encoding:'utf8',env});assert.equal(invoke('one.json').status,0);const replay=invoke('two.json');assert.notEqual(replay.status,0);assert.match(replay.stderr,/DELEGATED_AUTHORITY_NOT_CONSUMED/);});
test('current scope drift fails closed',()=>{const {result}=run('recover',(f)=>fs.writeFileSync(f.scope,'{"task":"drifted"}\n'));assert.notEqual(result.status,0);assert.match(result.stderr,/CURRENT_SCOPE_DIGEST_MISMATCH/);});
