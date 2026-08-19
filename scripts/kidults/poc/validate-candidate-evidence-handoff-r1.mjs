import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [snapshotPath,evidencePath,outputPath='/tmp/candidate-evidence-handoff-preflight-r1.json'] = process.argv.slice(2);
if(!snapshotPath||!evidencePath) throw new Error('Usage: node validate-candidate-evidence-handoff-r1.mjs <snapshot-candidate.json> <evidence-package.json> [output.json]');
const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
const evidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));
const canonical=(x)=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(x)=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex')}`;
const blockers=[];

const er=evidence.entity_resolution || {};
if(!(Number(er.overall_accuracy)>=0.99)) blockers.push('ENTITY_RESOLUTION_OVERALL_LT_099');
if(!(Number(er.blind_accuracy)>=0.99)) blockers.push('ENTITY_RESOLUTION_BLIND_LT_099');
if(Number(er.critical_false_auto_merge)!==0) blockers.push('CRITICAL_FALSE_AUTO_MERGE_NONZERO');
if(er.deterministic_replay!=='PASS') blockers.push('ENTITY_RESOLUTION_REPLAY_NOT_PASS');

const claims=Array.isArray(evidence.claims)?evidence.claims:[];
if(claims.length===0) blockers.push('CLAIMS_REQUIRED');
for(const claim of claims){
  if(!Array.isArray(claim.evidence_refs)||claim.evidence_refs.length===0) blockers.push(`CLAIM_NO_EVIDENCE:${claim.claim_id||'UNKNOWN'}`);
  if(claim.rights_state!=='ALLOW') blockers.push(`CLAIM_RIGHTS_NOT_ALLOW:${claim.claim_id||'UNKNOWN'}`);
  if(claim.evidence_strength==null||claim.claim_strength==null||Number(claim.claim_strength)>Number(claim.evidence_strength)) blockers.push(`CLAIM_STRENGTH_EXCEEDS_EVIDENCE:${claim.claim_id||'UNKNOWN'}`);
  if(claim.temporality==='CURRENT_MARKET' && claim.evidence_temporality!=='CURRENT_MARKET') blockers.push(`CURRENT_CLAIM_WITHOUT_CURRENT_EVIDENCE:${claim.claim_id||'UNKNOWN'}`);
  if(claim.listing_only===true && claim.claim_type==='SOLD_TRANSACTION') blockers.push(`LISTING_AS_SOLD:${claim.claim_id||'UNKNOWN'}`);
}
if(Number(evidence.unresolved_critical_contradiction_count||0)!==0) blockers.push('UNRESOLVED_CRITICAL_CONTRADICTIONS');
if(Number(evidence.unknown_or_denied_claim_input_count||0)!==0) blockers.push('UNKNOWN_OR_DENIED_CLAIM_INPUTS');

for(const [field,label] of [['snapshot_id','SNAPSHOT_ID'],['registry_version','REGISTRY_VERSION'],['methodology_version','METHODOLOGY_VERSION'],['evidence_lineage_version','EVIDENCE_LINEAGE_VERSION']]){
  if(!snapshot[field]) blockers.push(`${label}_REQUIRED`);
}
if(snapshot.snapshot_status!=='DRAFT_CANDIDATE') blockers.push('SNAPSHOT_STATUS_NOT_DRAFT_CANDIDATE');
if(snapshot.publication_eligible===true) blockers.push('CANDIDATE_MUST_NOT_PREAUTHORIZE_PUBLICATION');
if(snapshot.production_authorized===true) blockers.push('CANDIDATE_MUST_NOT_PREAUTHORIZE_PRODUCTION');

const pair_digest=hash({snapshot,evidence});
const result={
  id:'candidate-evidence-handoff-preflight-r1',
  snapshot_id:snapshot.snapshot_id||null,
  pair_digest,
  handoff_state:blockers.length===0?'READY_FOR_TRACK_B':'BLOCKED',
  blocker_count:blockers.length,
  blockers,
  track_b_input_pair:['snapshot-candidate.json','evidence-package.json'],
  publication:'HOLD',
  production:'HOLD',
  truth_boundary:blockers.length===0
    ? 'Preflight structure and upstream evidence gates permit immutable pair submission to Track B. Track B has not approved the pair yet.'
    : 'The pair is not eligible for Track B submission until every blocker is removed with evidence.'
};
await fs.writeFile(outputPath,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(process.env.KAIOS_REQUIRE_HANDOFF_READY==='1' && blockers.length>0) process.exit(2);
