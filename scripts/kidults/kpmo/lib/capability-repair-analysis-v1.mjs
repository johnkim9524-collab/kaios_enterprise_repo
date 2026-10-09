import {createHash} from 'node:crypto';
import {evaluateSemanticCapabilityDelta} from './semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from './independent-capability-verifier-v1.mjs';

const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const sha=/^[a-f0-9]{40}$/;
const engines=[['PRIMARY',evaluateSemanticCapabilityDelta],['INDEPENDENT',independentlyVerifyCapabilityDelta]];
const classifierPaths=new Set([
  'scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs',
  'scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs',
]);
const authorityPaths=new Set([
  'coordination/kidults/governance/autonomous-internal-landing-policy-v1.json',
  'coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json',
  'coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json',
]);
const invalid=()=>{throw new Error('CAPABILITY_REPAIR_ANALYSIS_INPUT_INVALID');};

// Diagnostic evidence only. Both whole-scope results remain authoritative for
// rejection. Per-file probes retain every immutable source for paired metadata
// verification, but never create a candidate, approval, generation or dispatch.
export function analyzeCapabilityRepair({repository,repositoryId,pullRequest,baseSha,headSha,treeSha,files,policy}) {
  if(typeof repository!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(repository)
    ||!/^\d+$/.test(String(repositoryId))||!Number.isSafeInteger(pullRequest)||pullRequest<1
    ||![baseSha,headSha,treeSha].every(value=>typeof value==='string'&&sha.test(value))
    ||!Array.isArray(files)||!files.length||files.length>128||!policy
    ||!Array.isArray(policy.delegated_internal_path_prefixes)||!Array.isArray(policy.delegated_internal_exact_path_exceptions))invalid();
  const seen=new Set();let bytes=0;
  for(const file of files){
    if(typeof file?.filename!=='string'||!file.filename||file.filename.includes('\n')||file.filename.includes('\r')
      ||file.filename.startsWith('/')||file.filename.split('/').some(part=>!part||part==='.'||part==='..')
      ||seen.has(file.filename)||typeof file.base_content!=='string'||typeof file.head_content!=='string')invalid();
    seen.add(file.filename);bytes+=Buffer.byteLength(file.base_content)+Buffer.byteLength(file.head_content);
  }
  if(bytes>4*1024*1024)invalid();
  const ordered=[...files].sort((a,b)=>a.filename<b.filename?-1:a.filename>b.filename?1:0);
  const sourceBinding=ordered.map(file=>({path:file.filename,base_digest:digest(file.base_content),head_digest:digest(file.head_content)}));
  const probe=(verifier,input)=>{
    try{const result=verifier(input);return {result:'VERIFIED_PASS',state:result.state};}
    catch(error){
      if(!/^(CAPABILITY_|INDEPENDENT_)[A-Z0-9_]+$/.test(String(error?.code||'')))throw error;
      return {result:'VERIFIED_FAIL',code:error.code};
    }
  };
  const wholeScope=engines.map(([engine,verifier])=>({engine,...probe(verifier,{files:ordered,policy})}));
  const governed=file=>policy.delegated_internal_path_prefixes.some(prefix=>file.filename.startsWith(prefix))
    ||policy.delegated_internal_exact_path_exceptions.includes(file.filename);
  const findings=[];
  for(const file of ordered.filter(governed)){
    // Disable unrelated path selection, preserving full source and unchanged
    // authority policy. A complete reviewed transition still uses all files.
    const isolated={...policy,delegated_internal_path_prefixes:[],delegated_internal_exact_path_exceptions:[file.filename]};
    for(const [engine,verifier]of engines){
      const result=probe(verifier,{files:ordered,policy:isolated});
      if(result.result==='VERIFIED_FAIL')findings.push({path:file.filename,engine,code:result.code});
    }
  }
  const classifierChanges=ordered.filter(file=>classifierPaths.has(file.filename)&&file.base_content!==file.head_content).map(file=>file.filename);
  const authorityChanges=ordered.filter(file=>authorityPaths.has(file.filename)&&file.base_content!==file.head_content).map(file=>file.filename);
  const accepted=wholeScope.every(result=>result.result==='VERIFIED_PASS');
  const report={id:'kidults-capability-repair-analysis-v1',version:'1.0.0',
    state:accepted?'DIAGNOSTIC_CLASSIFIERS_ACCEPTED':'CAPABILITY_REPAIR_REQUIRED',
    claim_scope:'DIAGNOSTIC_ONLY_NOT_PROTECTED_AUTHORIZATION',
    binding:{repository,repository_id:String(repositoryId),pull_request:pullRequest,base_sha:baseSha,head_sha:headSha,head_tree_sha:treeSha,
      changed_paths:ordered.map(file=>file.filename),scope_digest:digest(ordered.map(file=>file.filename).join('\n')),
      immutable_sources_digest:digest(JSON.stringify(sourceBinding))},
    whole_scope:wholeScope,findings,
    findings_scope:'FIRST_REJECTION_PER_GOVERNED_FILE_PER_ENGINE_NOT_ALL_PREDICATE_FAILURES',
    blocked_path_count:new Set(findings.map(item=>item.path)).size,
    classifier_changes:classifierChanges,authority_policy_changes:authorityChanges,
    activation_constraint:classifierChanges.length||authorityChanges.length?'CANDIDATE_CANNOT_AUTHORIZE_ITS_OWN_POLICY_ACTIVATION':'EXISTING_PROTECTED_CLASSIFICATION_REQUIRED',
    next_action:accepted?'RUN_FULL_EXISTING_PROTECTED_VALIDATION':'REPAIR_REPORTED_PATHS_THEN_REVALIDATE_FROM_PROTECTED_SOURCE',
    scan_budget:{maximum_files:128,maximum_source_bytes:4*1024*1024,source_bytes:bytes,network_reads:0},
    automatic_retry_performed:false,repository_mutation_performed:false,authority_created:false,
    autonomous_eligible:false,landing_authorization_created:false,merge_authorized:false,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...report,receipt_digest:digest(JSON.stringify(report))};
}
