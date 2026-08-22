#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'coordination/kidults/source-intelligence/asi-legal-commercial-value-chain-binding-v1.json';
const x = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = m => { throw new Error(m); };
const has = (a,v) => Array.isArray(a) && a.includes(v);

if (x.status !== 'P0_FAIL_CLOSED_VALUE_CHAIN_BINDING') fail('binding status mismatch');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD') fail('Production/Public must remain HOLD');
if (!String(x.source_gate_contract||'').endsWith('asi-legal-commercial-three-stage-gate-v1.json')) fail('canonical source gate contract missing');

const flow = ['DISCOVERY','GATE_1_ASI_INGRESS_VERIFICATION','SAFE_CANDIDATE_POOL','GATE_2_INDEPENDENT_REVERIFICATION','VERIFIED_ELIGIBLE_POOL','GATE_3_ADMISSION_ACTIVATION_VERIFICATION','ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION','BOUNDED_ACQUISITION','EVIDENCE_PACKAGE','TRACK_B_ASSESSMENT','GOVERNED_PROJECTION','PORTAL_EOS_CONSUMPTION'];
if (JSON.stringify(x.canonical_flow) !== JSON.stringify(flow)) fail('canonical flow mismatch');

const expectedIssues = {track_a:235,track_b:236,track_c:237,track_d:240,track_e:256,integration:238,pre_partner:881};
for (const [k,v] of Object.entries(expectedIssues)) if (x.bindings?.[k]?.issue !== v) fail(`${k} issue binding mismatch`);
if (x.bindings?.track_a?.rule !== 'SOURCE_DERIVED_EVIDENCE_REQUIRES_CURRENT_GATE3_ADMISSION_RECEIPT') fail('Track A gate missing');
if (x.bindings?.track_b?.rule !== 'REJECT_CANDIDATE_OR_EVIDENCE_WITHOUT_GATE3_SOURCE_LINEAGE') fail('Track B gate missing');
if (x.bindings?.track_b?.independent_receipt_validation !== true) fail('Track B independence missing');
if (x.bindings?.track_d?.rule !== 'RUNTIME_INGEST_REQUIRES_GATE3_ADMITTED_STATE') fail('Track D gate missing');
for (const r of ['rate_volume','retention_deletion','kill_switch','revocation','revalidation_horizon']) if (!has(x.bindings?.track_d?.runtime_controls_required,r)) fail(`Track D runtime control missing ${r}`);
if (x.bindings?.track_c?.rule !== 'PROJECTION_ONLY_NO_DIRECT_SOURCE_OR_GATE1_GATE2_CONSUMPTION') fail('Track C projection boundary missing');
if (x.bindings?.track_e?.rule !== 'EOS_CONSUMES_GOVERNED_PROJECTION_ONLY') fail('Track E projection boundary missing');
if (x.bindings?.integration?.rule !== 'NO_INTEGRATION_PASS_IF_ANY_SOURCE_LINEAGE_BYPASSES_GATE3') fail('Integration gate missing');
if (x.bindings?.pre_partner?.rule !== 'GATE3_ADMISSION_IS_REQUIRED_BUT_DOES_NOT_BYPASS_PREPARTNER_TRUST_CONTROLS') fail('Pre-partner non-bypass missing');

for (const r of ['DISCOVERY_OR_GATE1_OR_GATE2_NEVER_EQUALS_COLLECTION_AUTHORITY','MISSING_STALE_CONFLICTING_OR_UNBOUND_GATE_RECEIPT_BLOCKS_DOWNSTREAM','TRACK_B_CANNOT_INFER_RIGHTS_FROM_UPSTREAM_LABELS','RUNTIME_CANNOT_INGEST_WITHOUT_GATE3','PORTAL_AND_EOS_CANNOT_CONSUME_RAW_SOURCE_STATES']) if (!has(x.fail_closed_rules,r)) fail(`fail-closed rule missing ${r}`);
for (const r of ['NEW_EULA_OR_CONTRACT','PAID_PLAN_OR_SPEND','PRODUCTION_OR_G5']) if (!has(x.approval_boundaries,r)) fail(`approval boundary missing ${r}`);

console.log(JSON.stringify({status:'PASS',value_chain_bound:true,gate3_required_for_acquisition:true,production:x.production,public_release:x.public_release},null,2));
