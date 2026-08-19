import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const root=process.argv[2]||path.join(os.tmpdir(),'kidults-private-market-store-r1');
const now=new Date('2026-08-20T00:00:00.000Z');
const payload={kind:'SYNTHETIC_SENTINEL_NOT_PROVIDER_DATA',event_id:'sentinel-001',value:'non-market-test-only'};
const encKey=createHash('sha256').update('ephemeral-local-encryption-key').digest();
const hmacKey=Buffer.from('ephemeral-local-hmac-key-never-provider-secret');
const canonical=v=>JSON.stringify(v,Object.keys(v).sort());
const sha=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}`;
const hmac=v=>createHmac('sha256',hmacKey).update(v).digest('hex');

await fs.rm(root,{recursive:true,force:true});
await fs.mkdir(root,{recursive:true,mode:0o700});
await fs.chmod(root,0o700);
const audit=[];
const receiptId='receipt-sentinel-001';
const payloadText=JSON.stringify(payload);
const iv=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',encKey,iv);
const ciphertext=Buffer.concat([cipher.update(payloadText,'utf8'),cipher.final()]);
const tag=cipher.getAuthTag();
const privateObject={alg:'AES-256-GCM',iv:iv.toString('hex'),tag:tag.toString('hex'),ciphertext:ciphertext.toString('base64')};
const objectPath=path.join(root,'private-object.enc.json');
await fs.writeFile(objectPath,JSON.stringify(privateObject),{mode:0o600});
await fs.chmod(objectPath,0o600);
audit.push({at:now.toISOString(),action:'STORE',receipt_id:receiptId,result:'PASS'});

const acquiredAt=now.toISOString();
const expiresAt=new Date(now.getTime()+24*60*60*1000).toISOString();
const receiptFields={
  receipt_id:receiptId,
  provider_id:'synthetic-sentinel-provider-none',
  claim_class:'STRUCTURE_TEST_ONLY',
  source_reference_hash:sha('synthetic://sentinel/001'),
  payload_sha256:sha(payloadText),
  acquired_at:acquiredAt,
  expires_at:expiresAt,
  rights_decision_ref:'SYNTHETIC_TEST_ONLY_NO_PROVIDER_RIGHTS_DECISION',
  private_object_ref_hash:sha(objectPath)
};
const receiptCanonical=JSON.stringify(receiptFields,Object.keys(receiptFields).sort());
const receipt={...receiptFields,tamper_hmac_sha256:hmac(receiptCanonical)};
const receiptPath=path.join(root,'opaque-receipt.json');
await fs.writeFile(receiptPath,JSON.stringify(receipt),{mode:0o600});
await fs.chmod(receiptPath,0o600);
audit.push({at:now.toISOString(),action:'RECEIPT_CREATE',receipt_id:receiptId,result:'PASS'});

const verifyReceipt=r=>{
  const {tamper_hmac_sha256,...fields}=r;
  const c=JSON.stringify(fields,Object.keys(fields).sort());
  return hmac(c)===tamper_hmac_sha256;
};
if(!verifyReceipt(receipt)) throw new Error('RECEIPT_HMAC_VERIFY_FAILED');
const tampered={...receipt,payload_sha256:'sha256:'+'0'.repeat(64)};
if(verifyReceipt(tampered)) throw new Error('TAMPER_NOT_REJECTED');
audit.push({at:now.toISOString(),action:'TAMPER_NEGATIVE_TEST',receipt_id:receiptId,result:'REJECTED_AS_EXPECTED'});

const stored=JSON.parse(await fs.readFile(objectPath,'utf8'));
const decipher=createDecipheriv('aes-256-gcm',encKey,Buffer.from(stored.iv,'hex'));
decipher.setAuthTag(Buffer.from(stored.tag,'hex'));
const decrypted=Buffer.concat([decipher.update(Buffer.from(stored.ciphertext,'base64')),decipher.final()]).toString('utf8');
if(decrypted!==payloadText) throw new Error('AT_REST_DECRYPTION_ROUNDTRIP_FAILED');
audit.push({at:now.toISOString(),action:'READ_VERIFY',receipt_id:receiptId,result:'PASS'});

const expiredAt=new Date(now.getTime()+25*60*60*1000);
if(expiredAt<=new Date(receipt.expires_at)) throw new Error('TTL_TEST_CLOCK_INVALID');
await fs.rm(objectPath,{force:true});
audit.push({at:expiredAt.toISOString(),action:'TTL_DELETE',receipt_id:receiptId,result:'PASS'});
let objectExists=true;try{await fs.stat(objectPath);}catch{objectExists=false;}
if(objectExists) throw new Error('TTL_DELETE_FAILED');

const auditPath=path.join(root,'audit.jsonl');
await fs.writeFile(auditPath,audit.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
await fs.chmod(auditPath,0o600);
const rootMode=(await fs.stat(root)).mode&0o777;
const receiptMode=(await fs.stat(receiptPath)).mode&0o777;
const auditMode=(await fs.stat(auditPath)).mode&0o777;
if(rootMode!==0o700||receiptMode!==0o600||auditMode!==0o600) throw new Error('LEAST_PRIVILEGE_MODE_FAILED');

const result={
  id:'kidults-private-market-store-empirical-r1',
  status:'LOCAL_DEV_SENTINEL_EMPIRICAL_PASS_NOT_PROVIDER_EVIDENCE',
  provider_network_requests:0,
  provider_payloads_used:0,
  synthetic_sentinel_only:true,
  at_rest_encryption_roundtrip:'PASS',
  opaque_receipt_hmac_verify:'PASS',
  tamper_mutation_rejected:'PASS',
  ttl_delete:'PASS',
  audit_events:audit.length,
  root_mode:'0700',receipt_mode:'0600',audit_mode:'0600',
  active_market_claim:'NONE',
  rights_terminalized:false,
  historical_cleanup_complete:false,
  private_provider_runtime_verified:false,
  production:'HOLD',public_release:'HOLD',
  truth_boundary:'This proves only LOCAL/DEV private-store mechanics using synthetic sentinel data. It does not prove provider rights, provider reacquisition, remote private runtime, historical cleanup, active market evidence, Candidate eligibility, public release or Production.'
};
console.log(JSON.stringify(result,null,2));
