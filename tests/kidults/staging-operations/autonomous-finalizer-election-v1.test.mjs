import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertFinalizerElection,validateReservationConsumption,FINALIZER_WORKFLOWS} from '../../../scripts/kidults/kpmo/lib/autonomous-finalizer-election-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
const envelope={authorization_generation:'pr-42-original',nonce_digest:'sha256:'+'a'.repeat(64),head_sha:'b'.repeat(40)};
const response={ok:true,contract_version:'2.0.0',action:'CONSUME_RESERVATION',...envelope,run_id:'123',merge_sha:'c'.repeat(40),state:'CONSUMED',conditional_write:true,pk:'RESERVE#pr-42-original',sk:'NONCE#'+envelope.nonce_digest};
const verify=r=>validateReservationConsumption({response:r,envelope,runId:'123',mergeSha:'c'.repeat(40)});
test('remote consumption binds original operation and conditional backend result',()=>{
 assert.equal(verify(response).remote_binding.authorization_generation,envelope.authorization_generation);
});
for(const field of Object.keys(response))test('rejects missing or contradictory consume '+field,()=>{
 const missing={...response};delete missing[field];assert.throws(()=>verify(missing));
 assert.throws(()=>verify({...response,[field]:'contradictory'}));
});
test('old backend ok-only cannot seal a new-contract terminal',()=>assert.throws(()=>verify({ok:true,action:'CONSUME_RESERVATION',pk:response.pk,sk:response.sk})));
for(const workflow of FINALIZER_WORKFLOWS)test('existing registered finalizer can contend after full quorum: '+workflow,()=>{
 assert.equal(assertFinalizerElection({policy,workflow}).state,'RESERVATION_ELECTION_REQUIRED');
});
test('candidate cannot self-register workflow or relax quorum',()=>{
 assert.throws(()=>assertFinalizerElection({policy,workflow:'Attacker'}));
 const altered=structuredClone(policy);altered.bounded_recovery.normal_ops_finalizer.requires_kpmo_and_machine_verifier=false;
 assert.throws(()=>assertFinalizerElection({policy:altered,workflow:FINALIZER_WORKFLOWS[0]}));
});
test('a late completing role does not depend on the early verifier remaining alive',()=>{
 // Original fanout invokes all three approval/finalizer workflows. The verifier
 // can end its wait; the later role's existing finalizer still sees full quorum.
 const arrivals=[{workflow:FINALIZER_WORKFLOWS[2],at:0},{workflow:FINALIZER_WORKFLOWS[0],at:10},{workflow:FINALIZER_WORKFLOWS[1],at:130}];
 const approvals=new Set();let reservation=null;const merges=[];
 for(const arrival of arrivals){approvals.add(arrival.workflow);if(approvals.size<3)continue;
   assertFinalizerElection({policy,workflow:arrival.workflow});
   if(reservation===null){reservation={generation:envelope.authorization_generation,owner:arrival.workflow};merges.push(arrival.workflow);}
 }
 assert.deepEqual(merges,[FINALIZER_WORKFLOWS[1]]);
 assert.equal(reservation.generation,envelope.authorization_generation);
});
test('runner retains quorum-before-election and winner-before-mutation ordering',()=>{
 const source=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
 assert.ok(source.indexOf('const quorum=validateQuorum')<source.indexOf('assertFinalizerElection({policy'));
 assert.ok(source.indexOf("action:'CREATE_RESERVATION'")<source.indexOf('await publishLandingStatus(\'pending\''));
 assert.ok(source.indexOf("state:'FINALIZER_FOLLOWER'")<source.indexOf('await rebindDraftReady'));
 assert.ok(source.indexOf('validateReservationConsumption({')<source.indexOf('const immutableCopy=sealImmutableReceipt'));
});
