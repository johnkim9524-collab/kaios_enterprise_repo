#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script='scripts/kidults/source-intelligence/verify-provider-operation-receipt-v1.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-provider-boundary-'));
const now=Date.now();
const base={receipt_id:'external-approval-1',issuer:'INDEPENDENT_RIGHTS_AUTHORITY',operation:'SEAPORT_COHORT',provider_owner:'provider',endpoint_origin:'https://rpc.example',purpose:'INTERNAL_VALIDATION',cadence:'ONE_SHOT',collect:'ALLOW',store:'ALLOW',derive:'ALLOW',commercial_use:'ALLOW',exact_head_sha:'a'.repeat(40),workflow_run_id:'123',workflow_run_attempt:'1',approval_nonce:'0123456789abcdef',issued_at:new Date(now-60000).toISOString(),expires_at:new Date(now+3600000).toISOString()};
const args=['SEAPORT_COHORT','https://rpc.example/path','a'.repeat(40),'123','1','0123456789abcdef'];
const run=(value,override=args)=>{const p=path.join(temp,'r.json');fs.writeFileSync(p,JSON.stringify(value));return spawnSync(process.execPath,[script,p,...override],{encoding:'utf8'})};
if(run(base).status!==0)throw new Error('VALID_RECEIPT_REJECTED');
const mutations=[
 ['wrong-chain-operation',{operation:'OTHER'},args],
 ['expired',{expires_at:new Date(now-1).toISOString()},args],
 ['self-authored',{issuer:'KPMO'},args],
 ['commercial-hold',{commercial_use:'HOLD'},args],
 ['wrong-head',{},['SEAPORT_COHORT','https://rpc.example/path','b'.repeat(40),'123','1','0123456789abcdef']],
 ['wrong-origin',{},['SEAPORT_COHORT','https://evil.example','a'.repeat(40),'123','1','0123456789abcdef']],
 ['replay-binding',{},['SEAPORT_COHORT','https://rpc.example/path','a'.repeat(40),'124','1','0123456789abcdef']],
];
for(const [name,patch,override] of mutations)if(run({...base,...patch},override).status===0)throw new Error('NEGATIVE_ACCEPTED:'+name);
const absent=spawnSync(process.execPath,[script],{encoding:'utf8'});
if(absent.status===0||!absent.stderr.includes('OPERATION_RECEIPT_REQUIRED_BEFORE_NETWORK'))throw new Error('ABSENT_RECEIPT_NOT_FAIL_CLOSED');
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATION_PREFLIGHT_NEGATIVE_V1',result:'PASS',negative_cases:mutations.length+1,external_network_calls:0},null,2));
