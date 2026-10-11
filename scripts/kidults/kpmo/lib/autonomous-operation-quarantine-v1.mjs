import {operationKey} from '../../staging-operations/lib/resume-operation-v1.mjs';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const deny=()=>{throw new Error('DISPATCH_OPERATION_QUARANTINE_INVALID');};
const keys=(value,expected)=>value&&Object.getPrototypeOf(value)===Object.prototype
  &&Object.keys(value).sort().join(',')===expected.split(',').sort().join(',');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;

// This committed containment record creates no authority and changes no ledger
// outcome. A different main, head or session never releases an ambiguous PR.
export function validateOperationQuarantine(manifest,repository) {
  if(!keys(manifest,'id,version,repository,release_requires_authenticated_original_operation_reconciliation,entries,production,public,g5')
    ||manifest.id!=='kidults-autonomous-operation-quarantine-v1'||manifest.version!=='1.0.0'
    ||manifest.repository!==repository||manifest.release_requires_authenticated_original_operation_reconciliation!==true
    ||!Array.isArray(manifest.entries)||manifest.entries.length>100
    ||!['production','public','g5'].every(k=>manifest[k]==='HOLD'))deny();
  const seen=new Set();
  for(const entry of manifest.entries) {
    if(!keys(entry,'pull_request,state,operation_key,binding,evidence')||!positive(entry.pull_request)
      ||entry.state!=='UNKNOWN'||seen.has(entry.pull_request))deny();
    seen.add(entry.pull_request);
    const b=entry.binding,target=typeof b?.exact_target==='string'?b.exact_target.split(':'):[];
    if(b?.repository!==repository||b.root_mission_id!=='KIDULTS-AUTONOMOUS-LIFECYCLE'
      ||b.stage_id!==`lifecycle:${entry.pull_request}`||b.operation_kind!=='STALE_BASE_CONVERGENCE'
      ||target.length!==4||target[0]!==String(entry.pull_request)
      ||!target.slice(1).every(value=>/^[a-f0-9]{40}$/.test(value)))deny();
    if(b.payload_sha256!==sha256(canonicalJson({method:'PUT',body:{expected_head_sha:target[2]}})))deny();
    try{if(operationKey(b)!==entry.operation_key)deny();}catch{deny();}
    const e=entry.evidence;
    if(!keys(e,'run_id,run_attempt,source_sha,artifact_id,archive_sha256,member')
      ||!positive(e.run_id)||e.run_attempt!==1||!positive(e.artifact_id)
      ||! /^[a-f0-9]{40}$/.test(e.source_sha)||!hash(e.archive_sha256)
      ||e.member!==`lifecycle/pr-${entry.pull_request}-convergence.json`)deny();
  }
  return manifest;
}

export function quarantinedOperation(pr,manifest) {
  const entry=manifest?.entries.find(e=>e.pull_request===pr.number);
  if(!entry)return null;
  // Repository identity remains mandatory; PR numbers alone are not identity.
  if(pr.base?.repo?.full_name!==manifest.repository||pr.head?.repo?.full_name!==manifest.repository)deny();
  return {state:'QUARANTINED_UNKNOWN_OPERATION',pull_request:pr.number,
    reason:'ORIGINAL_UNKNOWN_OPERATION_READ_ONLY',original_operation_key:entry.operation_key,
    original_binding:entry.binding,evidence:entry.evidence,
    observed_head_sha:pr.head.sha,observed_base_sha:pr.base.sha,
    repository_mutation_performed:false,broker_invocation_authorized:false,
    autonomous_eligible:false,landing_authorization_created:false,merge_authorized:false,
    release_condition:'AUTHENTICATED_ORIGINAL_OPERATION_RECONCILIATION',
    production:'HOLD',public:'HOLD',g5:'HOLD'};
}
