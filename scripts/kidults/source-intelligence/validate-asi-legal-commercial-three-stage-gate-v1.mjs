#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'coordination/kidults/source-intelligence/asi-legal-commercial-three-stage-gate-v1.json';
const x = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = m => { throw new Error(m); };
const has = (a, v) => Array.isArray(a) && a.includes(v);

if (x.status !== 'P0_FAIL_CLOSED_EXECUTION_CONTRACT') fail('status must be fail-closed P0');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD') fail('Production/Public must remain HOLD');
const expectedPipeline = ['DISCOVERY_METADATA_ONLY','GATE_1_AUTOMATED_PREFLIGHT','GATE_2_PURPOSE_SPECIFIC_RIGHTS_COMMERCIAL_DECISION','GATE_3_ADMISSION_ACTIVATION_AUTHORIZATION','PRIVATE_ACQUISITION_ELIGIBLE'];
if (JSON.stringify(x.pipeline) !== JSON.stringify(expectedPipeline)) fail('pipeline order mismatch');

for (const f of ['terms_state','robots_or_machine_access_signal','commercial_use_signal','automated_access_signal','login_paywall_member_area_signal','retention_signal','derivation_signal']) {
  if (!has(x.gate_1?.required_checks, f)) fail(`Gate1 missing ${f}`);
}
for (const d of ['AUTO_CLEAR_TO_GATE_2','HUMAN_REVIEW_REQUIRED','HARD_BLOCK']) if (!has(x.gate_1?.decisions,d)) fail(`Gate1 missing decision ${d}`);
if (x.gate_1?.output_to_gate_2_only !== true) fail('Gate1 must only advance to Gate2');
if (!has(x.gate_1?.auto_clear_requirements,'RIGHTS_STATE_REMAINS_UNASSESSED')) fail('Gate1 cannot create rights');
if (!has(x.gate_1?.auto_clear_requirements,'ADMISSION_STATE_REMAINS_NOT_ADMITTED')) fail('Gate1 cannot create admission');

for (const p of ['collect','store','derive','internal_calibration','retention','redistribute','public_project','sold_event_fields','listing_fields','population_or_census_fields']) {
  if (!has(x.gate_2?.required_purposes,p)) fail(`Gate2 missing purpose ${p}`);
}
for (const d of ['ALLOW','CONDITIONAL','BLOCKED','NEEDS_CLARIFICATION']) if (!has(x.gate_2?.decisions,d)) fail(`Gate2 missing decision ${d}`);
if (x.gate_2?.predecessor !== 'GATE_1_AUTOMATED_PREFLIGHT') fail('Gate2 predecessor mismatch');
if (!has(x.gate_2?.no_inference_rules,'PUBLIC_VISIBILITY_IS_NOT_COMMERCIAL_USE_RIGHT')) fail('Gate2 public visibility inference guard missing');
if (!has(x.gate_2?.no_inference_rules,'API_ACCESS_IS_NOT_STORAGE_RIGHT')) fail('Gate2 API/storage inference guard missing');

if (x.gate_3?.predecessor !== 'GATE_2_PURPOSE_SPECIFIC_RIGHTS_AND_COMMERCIAL_DECISION') fail('Gate3 predecessor mismatch');
for (const r of ['GATE_1_NOT_HARD_BLOCKED','GATE_2_ALLOW_FOR_EACH_ACTUAL_PURPOSE','NO_UNRESOLVED_REQUIRED_COMMERCIAL_TERM','REQUIRED_HUMAN_OR_EXTERNAL_APPROVAL_COMPLETE']) {
  if (!has(x.gate_3?.required_before_private_acquisition,r)) fail(`Gate3 missing admission requirement ${r}`);
}
for (const f of ['CONTENT_ACQUISITION','CREDENTIAL_ACTIVATION','EVIDENCE_PROMOTION','MARKET_CLAIM','PUBLIC_PROJECTION','PRODUCTION_MUTATION']) {
  if (!has(x.gate_3?.forbidden_without_admitted_state,f)) fail(`Gate3 missing forbidden action ${f}`);
}
if (x.approval_boundaries?.automation_may_not_self_approve_external_authority !== true) fail('automation external-authority guard missing');
for (const s of ['DISCOVERY_NEVER_SELF_PROMOTES_TO_RIGHTS','GATE_1_NEVER_SELF_PROMOTES_TO_ADMISSION','GATE_2_NEVER_BYPASSES_REQUIRED_HUMAN_OR_PROGRAM_OWNER_APPROVAL','GATE_3_IS_REQUIRED_BEFORE_ANY_PRIVATE_ACQUISITION','UNKNOWN_OR_MISSING_REQUIRED_FIELD_FAILS_CLOSED']) {
  if (!has(x.state_transition_rules,s)) fail(`state transition guard missing ${s}`);
}
for (const f of ['legal_risk_tier','commercial_risk_tier','rights_clarity','terms_state','robots_state','access_mode','license_type','human_review_required','last_preflight_at','next_revalidation_at']) {
  if (!has(x.required_candidate_risk_fields,f)) fail(`candidate risk field missing ${f}`);
}

console.log(JSON.stringify({status:'PASS',gate1:x.gate_1.name,gate2:x.gate_2.name,gate3:x.gate_3.name,production:x.production,public_release:x.public_release},null,2));
