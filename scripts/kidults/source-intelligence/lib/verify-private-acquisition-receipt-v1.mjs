import {createHmac,timingSafeEqual} from 'node:crypto';
const fields=['receipt_id','provider_id','claim_class','source_reference_hash','payload_sha256','acquired_at','expires_at','rights_decision_ref','private_object_ref_hash'];
const hash=/^sha256:[a-f0-9]{64}$/;
const fail=code=>{throw new Error(`PRIVATE_ACQUISITION_RECEIPT_${code}`);};
export function privateReceiptSigningText(receipt){
  return JSON.stringify(Object.fromEntries([...fields].sort().map(k=>[k,receipt[k]])));
}
// Key retrieval and source-specific rights authority must be established by the
// protected caller. Matching a caller-supplied key cannot prove that authority.
export function verifyPrivateAcquisitionReceipt({receipt,key,expected,now=new Date()}){
  if(!receipt||Object.keys(receipt).sort().join(',')!==[...fields,'tamper_hmac_sha256'].sort().join(','))fail('FIELDS');
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY');
  for(const field of fields)if(typeof receipt[field]!=='string'||!receipt[field]||receipt[field].length>512)fail('FIELD_VALUE');
  for(const field of ['source_reference_hash','payload_sha256','private_object_ref_hash'])if(!hash.test(receipt[field]))fail('HASH');
  if(!expected)fail('EXPECTED_BINDING');
  for(const field of ['provider_id','claim_class','rights_decision_ref','source_reference_hash','payload_sha256','private_object_ref_hash']){
    if(typeof expected[field]!=='string'||expected[field]!==receipt[field])fail(`BINDING:${field}`);
  }
  const acquired=Date.parse(receipt.acquired_at),expires=Date.parse(receipt.expires_at);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!Number.isFinite(acquired)||!Number.isFinite(expires)
    ||new Date(acquired).toISOString()!==receipt.acquired_at||new Date(expires).toISOString()!==receipt.expires_at)fail('TIME');
  if(acquired>now.getTime()||expires<=now.getTime()||expires-acquired<86400000||expires-acquired>30*86400000)fail('TTL');
  const mac=receipt.tamper_hmac_sha256;
  if(typeof mac!=='string'||!/^[a-f0-9]{64}$/.test(mac))fail('MAC_FORMAT');
  const computed=createHmac('sha256',key).update(privateReceiptSigningText(receipt)).digest();
  if(!timingSafeEqual(computed,Buffer.from(mac,'hex')))fail('MAC');
  return {state:'INTEGRITY_AND_BINDING_VERIFIED',receipt_id:receipt.receipt_id,
    authority_authenticated:false,provider_runtime_verified:false,promotion_eligible:false};
}
