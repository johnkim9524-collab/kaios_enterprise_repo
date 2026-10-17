import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildGithubReadResumeTerminalReceipt,githubReadResumeReceiptKey,sealGithubReadResumeReceipt} from '../../../scripts/kidults/kpmo/lib/github-read-resume-immutable-receipt-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';

const event={workflow_run:{id:4321,run_attempt:2,head_sha:'a'.repeat(40)}};
const result={state:'READ_ONLY_CHECKPOINT_RESUMED',method:'GET',actual_authority_granted:false};
const consumer={run_id:'9876',run_attempt:1};
const makeReceipt=()=>buildGithubReadResumeTerminalReceipt({result,event,consumer,exactMainSha:'a'.repeat(40),createdAt:'2026-10-13T00:00:00.000Z'});

test('terminal receipt binds exact main, original and consumer run without checkpoint or nonce material',()=>{
  const receipt=makeReceipt();
  assert.equal(receipt.receipt_digest,sha256(canonicalJson(Object.fromEntries(Object.entries(receipt).filter(([key])=>key!=='receipt_digest')))));
  assert.equal(githubReadResumeReceiptKey(receipt),'receipts/read-resume/4321/2/'+'a'.repeat(40)+'/9876-1.json');
  assert.equal(JSON.stringify(receipt).includes('nonce'),false);
  assert.equal(JSON.stringify(receipt).includes('checkpoint'),false);
  assert.equal(receipt.outcome.actual_authority_granted,false);
});

test('seal writes once with compliance retention then physically reads back the same version and bytes',async()=>{
  const receipt=makeReceipt(),bucket='kidults-autonomous-receipts-staging',keyArn='arn:aws:kms:ap-northeast-2:528314240275:key/12345678-1234-1234-1234-123456789012';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'read-resume-store-test-'));
  let stored,puts=0;const calls=[];
  const aws=async args=>{
    calls.push(args[1]);
    if(args[1]==='put-object'){
      puts++;stored=fs.readFileSync(args[args.indexOf('--body')+1]);
      return {VersionId:'version-1'};
    }
    if(args[1]==='head-object')return {VersionId:'version-1',ContentLength:stored.length,
      ChecksumSHA256:Buffer.from(sha256(stored).slice(7),'hex').toString('base64'),ObjectLockMode:'COMPLIANCE',
      ObjectLockRetainUntilDate:'2036-10-13T00:00:00.000Z',ServerSideEncryption:'aws:kms',SSEKMSKeyId:keyArn};
    if(args[1]==='get-object'){
      const outputIndex=args.indexOf('--checksum-mode')+2;
      fs.writeFileSync(args[outputIndex],stored);return {};
    }
    throw Error(`UNEXPECTED_AWS:${args[1]}`);
  };
  try{
    const sealed=await sealGithubReadResumeReceipt({receipt,bucket,keyArn,aws,tempRoot:dir});
    assert.equal(puts,1);assert.equal(sealed.state,'OBJECT_LOCK_COMPLIANCE_VERIFIED');
    assert.equal(sealed.version_id,'version-1');assert.equal(sealed.body_readback_verified,true);
    assert.deepEqual(calls,['put-object','head-object','get-object']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('rejects receipt drift and never reports a terminal for authority-granting outcomes',async()=>{
  const receipt=makeReceipt();
  await assert.rejects(()=>sealGithubReadResumeReceipt({receipt:{...receipt,exact_main_sha:'b'.repeat(40)},bucket:'kidults-autonomous-receipts-staging',
    keyArn:'arn:aws:kms:ap-northeast-2:528314240275:key/12345678-1234-1234-1234-123456789012',aws:async()=>{throw Error('MUST_NOT_CALL');}}),/DIGEST/);
  assert.throws(()=>buildGithubReadResumeTerminalReceipt({result:{...result,actual_authority_granted:true},event,consumer,
    exactMainSha:'a'.repeat(40)}),/RESULT/);
  assert.throws(()=>buildGithubReadResumeTerminalReceipt({result:{...result,state:'UNKNOWN'},event,consumer,
    exactMainSha:'a'.repeat(40)}),/RESULT/);
  assert.throws(()=>buildGithubReadResumeTerminalReceipt({result,event,consumer,exactMainSha:'bad'}),/EXACT_MAIN_SHA/);
});
