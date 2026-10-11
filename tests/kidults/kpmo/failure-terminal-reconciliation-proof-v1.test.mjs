import {test} from 'node:test';import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {failureAssuranceRecoveryObjectKey} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
import {verifyFailureTerminalReconciliation} from '../../../scripts/kidults/kpmo/lib/failure-terminal-reconciliation-proof-v1.mjs';
import {failureTerminalFixture as fixture} from './failure-terminal-reconciliation-fixture-v1.mjs';
test('readback reconciles only original debt and never grants authority',()=>{const f=fixture();const r=verifyFailureTerminalReconciliation(f.result,f.options);assert.equal(r.scope,'ORIGINAL_TERMINAL_DEBT_ONLY');assert.equal(r.actual_authority_granted,false);assert.equal(r.platform_closure,false);});
for(const [name,mutate] of [
 ['different nonce',f=>f.options.original.nonce_digest='sha256:'+'0'.repeat(64)],
 ['other PR',f=>f.result.request.pull_request=2214],
 ['wrong source',f=>f.options.sourceSha='0'.repeat(40)],
 ['borrowed finalizer',f=>f.options.runId=501],
 ['missing immutable ACK',f=>f.result.consistent_read.immutable_ack=null],
 ['wrong version readback',f=>f.result.immutable_readback.version_id='other'],
 ['different terminal body',f=>f.result.consistent_read.terminal.source_sha='0'.repeat(40)],
 ['retention too short',f=>f.result.immutable.retain_until='2027-10-12T00:00:00Z'],
 ['wrong KMS account',f=>f.result.immutable.encryption_key_arn='arn:aws:kms:ap-northeast-2:0:key/x'],
 ['duplicate approval run',f=>f.result.consistent_read.approvals[1].approval_run_id='600'],
 ['finalizer approval collision',f=>f.result.consistent_read.approvals[0].approval_run_id='500'],
 ['authority overclaim',f=>f.result.actual_authority_granted=true],
 ['terminal-null consumed',f=>f.result.consistent_read.terminal=null],
])test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>verifyFailureTerminalReconciliation(f.result,f.options));});
