import assert from 'node:assert/strict';
import fs from 'node:fs';

const root='coordination/kidults/portal/';
const readiness=JSON.parse(fs.readFileSync(`${root}portal-internal-readiness-v1.json`,'utf8'));
const index=JSON.parse(fs.readFileSync(`${root}portal-external-gate-evidence-index-v1.json`,'utf8'));
const handoff=JSON.parse(fs.readFileSync('coordination/kidults/poc/candidate-evidence-handoff-preflight-contract-r2.json','utf8'));
const launch=JSON.parse(fs.readFileSync(`${root}portal-launch-assurance-v1.json`,'utf8'));
const access=JSON.parse(fs.readFileSync('coordination/kidults/governance/portal-accessibility-assurance-v1.json','utf8'));
const slo=JSON.parse(fs.readFileSync('coordination/kidults/runtime/observability-slo-contract-v1.json','utf8'));
const receipt=JSON.parse(fs.readFileSync('coordination/kidults/runtime/digitalocean-staging-portal-receipt-contract-v1.json','utf8'));
const server=fs.readFileSync('apps/kidults-enterprise-staging/server.mjs','utf8');
const capability=fs.readFileSync('apps/kidults-enterprise-staging/projection-capability-v1.mjs','utf8');
const runbook=fs.readFileSync(`${root}portal-external-gate-runbook-v1.md`,'utf8');

assert.equal(readiness.canonical_portal.surface,'ORIGINAL_FULL_SCOPE');
assert.equal(readiness.canonical_portal.variants_policy,'PRESERVE_SEPARATELY_NEVER_MIX_IN_DEPLOY_BUNDLE');
assert.equal(handoff.current_state,'BLOCKED');
assert.deepEqual(handoff.required_pair,['snapshot-candidate.json','evidence-package.json']);
assert.equal(handoff.track_b_input_boundary,'Only the exact digest-bound immutable snapshot-candidate.json + evidence-package.json pair may be submitted. Track B remains an independent assessment; this preflight does not perform or inherit Track B PASS.');
assert.equal(readiness.internal_workstreams.projection_release.request_revalidation,true);
assert.equal(readiness.internal_workstreams.projection_release.browser_revalidation_ms,5000);
assert.equal(readiness.internal_workstreams.projection_release.static_approved_projection,false);
for(const route of ['/api/v1/projection','/api/v1/projection/data','/api/v1/projection/export'])assert.match(server,new RegExp(route.replaceAll('/','\\/')));
for(const marker of ['projection_digest','timingSafeEqual','KIDULTS_CONTROL_PLANE','SIGNED_SERVER_CAPABILITY'])assert.match(capability,new RegExp(marker));
assert.equal(access.release_rule,'PORTAL_PUBLIC_RELEASE_REQUIRES_EVIDENCE_PASS');
assert.equal(slo.slo_policy,'NO_NUMERIC_SLO_UNTIL_BOUNDED_REAL_POC_BASELINE_MEASURED');
assert.equal(receipt.authority_boundary.remote_deployment,'NOT_PERFORMED_BY_THIS_CHANGE');
assert.equal(index.required_receipts.length,9);
assert.equal(index.required_receipts.every(item=>item.state==='NONE'),true);
assert.equal(index.missing_receipt_policy,'HOLD');
assert.equal(index.self_attestation_allowed,false);
for(const section of ['## Operating boundary','## Gate order','## Fail-closed rules','## Required evidence','## Recovery'])assert.match(runbook,new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
for(const field of ['github_environment_trusted_execution','digitalocean_staging_health_rollback','dated_sold','track_b','approved_projection','human_review','remote_rum_tls_edge'])assert.match(readiness.external_gate_state[field],/HOLD/);
assert.equal(readiness.promotion,'FORBIDDEN_UNTIL_ALL_EXTERNAL_GATE_EVIDENCE_IS_ATTESTED');

let mutationCases=0;
for(const mutate of [
  value=>{value.external_gate_state.approved_projection='PASS'},
  value=>{value.internal_workstreams.evidence_handoff.current_state='READY_FOR_TRACK_B'},
  value=>{value.internal_workstreams.projection_release.static_approved_projection=true},
  value=>{value.external_gate_state.github_environment_trusted_execution='15/15_PASS'},
  value=>{value.promotion='READY'}
]){const candidate=structuredClone(readiness);mutate(candidate);assert.notDeepEqual(candidate,readiness);mutationCases+=1}

console.log(JSON.stringify({
  id:readiness.id,result:'PASS',internal_contracts:'BOUND',evidence_slots:index.required_receipts.length,
  evidence_present:index.required_receipts.filter(item=>item.state!=='NONE').length,
  mutation_cases:mutationCases,track_b:readiness.external_gate_state.track_b,
  approved_projection:readiness.external_gate_state.approved_projection,
  production:readiness.production,public:readiness.public,g5:readiness.g5
},null,2));
