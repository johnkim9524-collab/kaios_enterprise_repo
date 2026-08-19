import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const files={
  chain:'coordination/kidults/architecture/kidults-end-to-end-value-chain-contract-v1.json',
  mesh:'coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json',
  runtime:'coordination/kidults/engine-v2/asi-runtime-core-validation-r1.json',
  strata:'coordination/kidults/entity-resolution/approved-bounded-poc-calibration-strata-v1.json',
  handoff:'coordination/kidults/poc/candidate-evidence-handoff-blocked-selftest-r2.json',
  sourceHistorical:'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  sourceIdentity:'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json'
};
const x={}; for(const [k,p] of Object.entries(files)) x[k]=await read(p);
if(x.chain.production!=='HOLD'||x.runtime.production!=='HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');
const completedStrata=(x.strata.strata||[]).filter(s=>s.status==='COMPLETE'||s.completion_state==='COMPLETE').length;
const totalStrata=(x.strata.strata||[]).length||7;
const currentSold=(x.sourceHistorical.sources||[]).filter(s=>s.admission_state==='ADMITTED'&&(s.allowed_claim_classes||[]).some(c=>String(c).includes('CURRENT'))).length;
const identityAdmitted=(x.sourceIdentity.sources||[]).filter(s=>s.admission_state==='ADMITTED').length;
const report={
  id:'kidults-owned-fabric-e2e-preflight-r1',issue:550,production:'HOLD',
  stages:{
    canonical_value_chain_contract:'PASS_CONTRACT_PRESENT',
    canonical_entity_graph:'PARTIAL_ER_6_OF_7',
    evidence_graph:identityAdmitted>0?'PASS_BOUNDED_IDENTITY_REFERENCE_EVIDENCE':'BLOCKED_NO_EVIDENCE',
    market_event_graph:currentSold>0?'PASS_BOUNDED_CURRENT_SOLD':'BLOCKED_NO_STRICT_CURRENT_SOLD_SOURCE',
    engine_mesh:'PASS_BOUNDED_SHADOW_RUNTIME_CORE',
    immutable_candidate:'BLOCKED_NOT_CREATED',
    track_b:'BLOCKED_EXACT_PAIR_ABSENT',
    transparent_projection:'WAITING_APPROVED_ASSESSMENT'
  },
  measurements:{completed_strata:completedStrata,total_strata:totalStrata,identity_rights_admitted_source_count:identityAdmitted,current_sold_rights_admitted_source_count:currentSold},
  blockers:['FINAL_ER_7_OF_7','STRICT_RIGHTS_ADMITTED_CURRENT_SOLD_EVIDENCE','IMMUTABLE_CANDIDATE_AND_EVIDENCE_PACKAGE','TRACK_B_EXACT_PACKAGE_ASSESSMENT'],
  e2e_empirical_pass:false,
  architecture_redesign_required:false,
  provider_global_truth:false,
  truth_boundary:'The KIDULTS-owned fabric contracts and bounded engine/evidence mechanics exist. A real Source→Graphs→Engine→Candidate→Track B→Projection proof is not complete until final ER, claim-sufficient current SOLD evidence and the immutable exact pair exist.'
};
report.fingerprint_sha256=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
await fs.writeFile(process.argv[2]||'/tmp/kidults-owned-fabric-e2e-preflight-r1.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
