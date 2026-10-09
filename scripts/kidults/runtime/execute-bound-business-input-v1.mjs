import {createHash} from 'node:crypto';
import {executeBusinessInputStage} from './execute-business-input-stage-v1.mjs';
import {canonicalJsonDigest} from '../market/current-sold-batch-v1.mjs';

const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const KEYS=['envelope','receiptRegistry','purposeRights'];
const fail=code=>{throw new Error(`BOUND_BUSINESS_INPUT_${code}`);};
// The caller must obtain binding independently of these bytes. This checks integrity,
// not the authority of the binding or the acquisition. Never emits a domain receipt.
export function executeBoundBusinessInput({files,binding,sourceSha,runId,now=new Date()}){
  if(!SHA.test(sourceSha||'')||typeof runId!=='string'||!runId
    ||binding?.source_sha!==sourceSha||binding?.canonical_run_id!==runId)fail('SOURCE_RUN_BINDING');
  if(binding?.schema_version!=='business-input-file-binding-v1')fail('SCHEMA');
  if(!files||!binding.file_digests
    ||Object.keys(files).sort().join(',')!==[...KEYS].sort().join(',')
    ||Object.keys(binding.file_digests).sort().join(',')!==[...KEYS].sort().join(','))fail('FILE_SET');
  const parsed={};
  for(const key of KEYS){
    const bytes=files[key],expected=binding.file_digests[key];
    if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>2*1024*1024)fail('BOUNDED_BYTES');
    if(typeof expected!=='string'||!DIGEST.test(expected))fail('DIGEST_REQUIRED');
    if(`sha256:${createHash('sha256').update(bytes).digest('hex')}`!==expected)fail(`DIGEST_MISMATCH:${key}`);
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);parsed[key]=JSON.parse(text);}
    catch{fail(`JSON:${key}`);}
  }
  const stage=executeBusinessInputStage({...parsed,sourceSha,runId,now,
    expectedRegistryDigest:canonicalJsonDigest(parsed.receiptRegistry)});
  const result={...stage,id:'kidults-bound-business-input-v1',
    evidence_scope:'FILE_INTEGRITY_AND_CONTENT_VALIDATION_ONLY',
    file_integrity_verified:true,binding_authority_authenticated:false,
    file_binding_digest:canonicalJsonDigest(binding),file_digests:{...binding.file_digests}};
  delete result.content_digest;
  return {...result,content_digest:canonicalJsonDigest(result)};
}
