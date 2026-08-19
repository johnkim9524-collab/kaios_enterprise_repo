import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [snapshotPath,evidencePath,outputPath='/tmp/candidate-evidence-handoff-preflight-r2.json'] = process.argv.slice(2);
if(!snapshotPath||!evidencePath) throw new Error('Usage: node validate-candidate-evidence-handoff-r2.mjs <snapshot-candidate.json> <evidence-package.json> [output.json]');
const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
const evidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));
const canonical=(x)=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(x)=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex')}`;
const blockers=[];
const requireValue=(value,code)=>{if(value==null||String(value).trim()==='') blockers.push(code);};

const er=evidence.entity_resolution || {};
if(Number(er.required_strata)!==7) blockers.push('ER_REQUIRED_STRATA_NOT_7');
if(Number(er.complete_strata)!==7) blockers.push('ER_REQUIRED_STRATA_INCOMPLETE');
if(er.final_scope_stratification_complete!==true) blockers.push('ER_FINAL_SCOPE_STRATIFICATION_NOT_COMPLETE');
if(!(Number(er.overall_accuracy)>=0.99)) blockers.push('ENTITY_RESOLUTION_OVERALL_LT_099');
if(!(Number(er.blind_accuracy)>=0.99)) blockers.push('ENTITY_RESOLUTION_BLIND_LT_099');
if(Number(er.critical_false_auto_merge)!==0) blockers.push('CRITICAL_FALSE_AUTO_MERGE_NONZERO');
if(Number(er.blind_critical_false_auto_merge)!==0) blockers.push('BLIND_CRITICAL_FALSE_AUTO_MERGE_NONZERO');
if(er.deterministic_replay!=='PASS') blockers.push('ENTITY_RESOLUTION_REPLAY_NOT_PASS');
if(Number(er.rights_coverage)!==1) blockers.push('ENTITY_RESOLUTION_RIGHTS_COVERAGE_NOT_1');
if(Number(er.provenance_coverage)!==1) blockers.push('ENTITY_RESOLUTION_PROVENANCE_COVERAGE_NOT_1');
requireValue(er.final_dataset_id,'ER_FINAL_DATASET_REQUIRED');
requireValue(er.final_dataset_hash,'ER_FINAL_DATASET_HASH_REQUIRED');
requireValue(er.approved_strata_manifest_id,'ER_APPROVED_STRATA_MANIFEST_ID_REQUIRED');
requireValue(er.blind_holdout_freeze_id,'ER_BLIND_HOLDOUT_FREEZE_REQUIRED');
requireValue(er.calibration_artifact_id,'ER_CALIBRATION_ARTIFACT_REQUIRED');

requireValue(evidence.package_id,'EVIDENCE_PACKAGE_ID_REQUIRED');
if(evidence.package_status!=='IMMUTABLE') blockers.push('EVIDENCE_PACKAGE_NOT_IMMUTABLE');
for(const [field,label] of [['registry_version','EVIDENCE_PACKAGE_REGISTRY_VERSION'],['methodology_version','EVIDENCE_PACKAGE_METHODOLOGY_VERSION'],['evidence_lineage_version','EVIDENCE_PACKAGE_EVIDENCE_LINEAGE_VERSION']]){
  requireValue(evidence[field],`${label}_REQUIRED`);
}

const claims=Array.isArray(evidence.claims)?evidence.claims:[];
if(claims.length===0) blockers.push('CLAIMS_REQUIRED');
for(const claim of claims){
  const id=claim.claim_id||'UNKNOWN';
  if(!Array.isArray(claim.evidence_refs)||claim.evidence_refs.length===0) blockers.push(`CLAIM_NO_EVIDENCE:${id}`);
  if(claim.rights_state!=='ALLOW') blockers.push(`CLAIM_RIGHTS_NOT_ALLOW:${id}`);
  if(claim.evidence_strength==null||claim.claim_strength==null||Number(claim.claim_strength)>Number(claim.evidence_strength)) blockers.push(`CLAIM_STRENGTH_EXCEEDS_EVIDENCE:${id}`);
  if(claim.temporality==='CURRENT_MARKET' && claim.evidence_temporality!=='CURRENT_MARKET') blockers.push(`CURRENT_CLAIM_WITHOUT_CURRENT_EVIDENCE:${id}`);
  if(claim.listing_only===true && claim.claim_type==='SOLD_TRANSACTION') blockers.push(`LISTING_AS_SOLD:${id}`);
}
if(Number(evidence.unresolved_critical_contradiction_count||0)!==0) blockers.push('UNRESOLVED_CRITICAL_CONTRADICTIONS');
if(Number(evidence.unknown_or_denied_claim_input_count||0)!==0) blockers.push('UNKNOWN_OR_DENIED_CLAIM_INPUTS');

for(const [field,label] of [['snapshot_id','SNAPSHOT_ID'],['registry_version','SNAPSHOT_REGISTRY_VERSION'],['methodology_version','SNAPSHOT_METHODOLOGY_VERSION'],['evidence_lineage_version','SNAPSHOT_EVIDENCE_LINEAGE_VERSION']]){
  requireValue(snapshot[field],`${label}_REQUIRED`);
}
if(snapshot.snapshot_status!=='DRAFT_CANDIDATE') blockers.push('SNAPSHOT_STATUS_NOT_DRAFT_CANDIDATE');
if(snapshot.publication_eligible===true) blockers.push('CANDIDATE_MUST_NOT_PREAUTHORIZE_PUBLICATION');
if(snapshot.production_authorized===true) blockers.push('CANDIDATE_MUST_NOT_PREAUTHORIZE_PRODUCTION');

const pair_digest=hash({snapshot,evidence});
const uniqueBlockers=[...new Set(blockers)];
const result={
  id:'candidate-evidence-handoff-preflight-r2',
  snapshot_id:snapshot.snapshot_id||null,
  evidence_package_id:evidence.package_id||null,
  pair_digest,
  handoff_state:uniqueBlockers.length===0?'READY_FOR_TRACK_B':'BLOCKED',
  blocker_count:uniqueBlockers.length,
  blockers:uniqueBlockers,
  track_b_input_pair:['snapshot-candidate.json','evidence-package.json'],
  track_b_assessment:'NOT_STARTED_BY_THIS_PREFLIGHT',
  publication:'HOLD',
  production:'HOLD',
  truth_boundary:uniqueBlockers.length===0
    ? 'Exact immutable pair satisfies Track A handoff preflight and may be submitted to Track B. This is not a Track B PASS, publication approval or Production authorization.'
    : 'The pair is not eligible for Track B submission until every blocker is removed with evidence. CI or local preflight success cannot waive an evidence blocker.'
};
await fs.writeFile(outputPath,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(process.env.KAIOS_REQUIRE_HANDOFF_READY==='1' && uniqueBlockers.length>0) process.exit(2);
