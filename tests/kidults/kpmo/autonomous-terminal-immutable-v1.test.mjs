import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {sealAutonomousTerminal,terminalObjectKey} from '../../../scripts/kidults/kpmo/lib/autonomous-terminal-immutable-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
const bucket='kidults-autonomous-test-staging',keyArn='arn:aws:kms:ap-northeast-2:528314240275:key/test-key';
const core={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',state:'RECEIPT_SEALED',
  binding:{authorization_generation:'pr-42-original-generation'},merge:{merge_sha:'a'.repeat(40)},
  durable_reservation:{state:'CONSUMED',conditional_write:true},postmerge:{state:'VERIFIED_PASS'},
  created_at:'2026-10-04T11:00:00.000Z',production:'HOLD',public:'HOLD',g5:'HOLD'};
const receipt={...core,receipt_digest:sha256(canonicalJson(core))};
function fixture({lost=false,tamper=false}={}){
  let object,puts=0,versions=0;
  const value=(args,key)=>args[args.indexOf(key)+1];
  const aws=args=>{
    if(args[1]==='put-object'){
      puts++;assert.equal(value(args,'--if-none-match'),'*');
      if(object)throw Error('PreconditionFailed');
      object={bytes:fs.readFileSync(value(args,'--body')),checksum:value(args,'--checksum-sha256'),retain:value(args,'--object-lock-retain-until-date')};versions++;
      if(lost)throw Error('lost response');return {VersionId:'one-version'};
    }
    if(!object)throw Error('403');
    if(args[1]==='head-object')return {VersionId:'one-version',ContentLength:object.bytes.length,
      ChecksumSHA256:object.checksum,ObjectLockMode:'COMPLIANCE',ObjectLockRetainUntilDate:object.retain,
      ServerSideEncryption:'aws:kms',SSEKMSKeyId:keyArn};
    if(args[1]==='get-object'){
      const p=args[args.indexOf('--checksum-mode')+2];fs.writeFileSync(p,tamper?Buffer.alloc(object.bytes.length):object.bytes);return {};
    }
    throw Error('unexpected AWS operation');
  };
  return {seal:r=>sealAutonomousTerminal({receipt:r||receipt,bucket,keyArn,aws,tempRoot:os.tmpdir()}),counts:()=>({puts,versions})};
}
test('immutable identity uses original binding generation and repeated seals create one version',()=>{
  assert.equal(terminalObjectKey(receipt),`receipts/pr-42-original-generation/${'a'.repeat(40)}/terminal.json`);
  const f=fixture(),first=f.seal(),second=f.seal();assert.equal(first.version_id,second.version_id);
  assert.deepEqual(f.counts(),{puts:1,versions:1});assert.equal(second.reused_existing_version,true);
  assert.equal(first.body_readback_verified,true);
});
test('lost write reply reconciles authenticated existing bytes without another put',()=>{
  const f=fixture({lost:true});assert.equal(f.seal().state,'OBJECT_LOCK_COMPLIANCE_VERIFIED');assert.deepEqual(f.counts(),{puts:1,versions:1});
});
test('matching HEAD checksum cannot replace exact body readback',()=>{
  assert.throws(()=>fixture({tamper:true}).seal(),/IMMUTABLE_BODY/);
});
test('receipt drift cannot produce a second immutable object for the same generation',()=>{
  const f=fixture();f.seal();const drift={...core,created_at:'2026-10-04T12:00:00.000Z'};
  assert.throws(()=>f.seal({...drift,receipt_digest:sha256(canonicalJson(drift))}),/IMMUTABLE_CHECKSUM|IMMUTABLE_RETENTION/);
  assert.equal(f.counts().versions,1);
});
test('unknown write and forbidden HEAD never imply absence or authorize retry',()=>{
  let puts=0;assert.throws(()=>sealAutonomousTerminal({receipt,bucket,keyArn,tempRoot:os.tmpdir(),aws:args=>{
    if(args[1]==='put-object')puts++;throw Error('403');
  }}),/OUTCOME_UNKNOWN_RECONCILE_NO_RETRY/);assert.equal(puts,1);
});
test('invalid generation and unconsumed reservation fail before AWS',()=>{
  assert.throws(()=>terminalObjectKey({...receipt,binding:{}}),/GENERATION/);
  assert.throws(()=>terminalObjectKey({...receipt,binding:{authorization_generation:'../escape'}}),/GENERATION/);
  let calls=0;const changed={...core,durable_reservation:{state:'RESERVED'}};
  assert.throws(()=>sealAutonomousTerminal({receipt:{...changed,receipt_digest:sha256(canonicalJson(changed))},bucket,keyArn,tempRoot:os.tmpdir(),aws:()=>{calls++;}}),/RESERVATION/);assert.equal(calls,0);
});
