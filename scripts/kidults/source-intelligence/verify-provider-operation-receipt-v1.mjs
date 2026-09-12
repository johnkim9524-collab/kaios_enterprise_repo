#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const [receiptPath,operation,endpoint,headSha,runId,runAttempt,nonce]=process.argv.slice(2);
const fail=c=>{throw new Error(c)};
if(!receiptPath)fail('OPERATION_RECEIPT_REQUIRED_BEFORE_NETWORK');
if(!fs.existsSync(receiptPath))fail('OPERATION_RECEIPT_NOT_FOUND_BEFORE_NETWORK');
const r=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
const required=['receipt_id','issuer','operation','provider_owner','endpoint_origin','purpose','cadence','collect','store','derive','commercial_use','exact_head_sha','workflow_run_id','workflow_run_attempt','approval_nonce','issued_at','expires_at'];
for(const f of required)if(r[f]===undefined||r[f]===null||r[f]==='')fail('RECEIPT_FIELD:'+f);
if(r.issuer==='KPMO'||r.issuer==='ASI'||r.self_authored===true)fail('INDEPENDENT_ISSUER_REQUIRED');
if(r.operation!==operation)fail('OPERATION_MISMATCH');
let expectedOrigin;
try{expectedOrigin=new URL(endpoint).origin}catch{fail('ENDPOINT_INVALID')}
if(r.endpoint_origin!==expectedOrigin)fail('ENDPOINT_ORIGIN_MISMATCH');
if(r.exact_head_sha!==headSha||!/^[a-f0-9]{40}$/.test(headSha))fail('EXACT_HEAD_MISMATCH');
if(String(r.workflow_run_id)!==String(runId)||String(r.workflow_run_attempt)!==String(runAttempt))fail('RUN_BINDING_MISMATCH');
if(r.approval_nonce!==nonce||nonce.length<16)fail('NONCE_MISMATCH');
if(Date.parse(r.issued_at)>Date.now()+300000||Date.parse(r.expires_at)<=Date.now())fail('RECEIPT_EXPIRED_OR_NOT_YET_VALID');
for(const atom of ['collect','store','derive','commercial_use'])if(r[atom]!=='ALLOW')fail('RIGHT_NOT_ALLOWED:'+atom);
if(r.cadence!=='ONE_SHOT'&&r.cadence!=='RECURRING')fail('CADENCE_INVALID');
const replayKey=crypto.createHash('sha256').update([r.receipt_id,r.approval_nonce,r.exact_head_sha,r.workflow_run_id,r.workflow_run_attempt,r.operation].join(':')).digest('hex');
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_OPERATION_PREFLIGHT_V1',result:'PASS',receipt_id:r.receipt_id,replay_key:'sha256:'+replayKey,operation:r.operation,endpoint_origin:r.endpoint_origin,expires_at:r.expires_at,network_authorized_after_this_check_only:true},null,2));
