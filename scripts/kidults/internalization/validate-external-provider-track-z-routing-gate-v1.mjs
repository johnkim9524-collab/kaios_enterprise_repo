import fs from 'node:fs';

const path = 'coordination/kidults/internalization/external-provider-track-z-routing-gate-v1.json';
const gate = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];

const requiredRoute = ['TRACK_Z_REVIEW','KPMO_INTEGRATED_REPORT','FOUNDER_DECISION'];
const requiredTrackZOutputs = [
  'company_product_analysis','external_fact_internalization_split','abcde_dependency_classification','portfolio_priority',
  'rights_assessment','economics_roi_assessment','lock_in_and_replacement_assessment','provider_removal_assessment',
  'negotiation_objective','track_z_verdict'
];
const requiredTracks = ['A','B','C','D','E','ASI','SOURCE_POOL','INTEGRATION'];
const requiredFounderGates = [
  'external_contract_acceptance','eula_acceptance','external_spend','credential_activation','external_data_acquisition',
  'provider_activation','production_or_public_promotion','g5'
];

if (gate.contract_id !== 'KIDULTS_EXTERNAL_PROVIDER_TRACK_Z_ROUTING_GATE_V1') errors.push('invalid contract id');
for (const x of requiredRoute) if (!gate.mandatory_route?.includes(x)) errors.push(`missing route: ${x}`);
for (const x of requiredTrackZOutputs) if (!gate.track_z_required_outputs?.includes(x)) errors.push(`missing Track Z output: ${x}`);
for (const x of requiredTracks) if (!gate.cross_track_rule?.tracks?.includes(x)) errors.push(`missing routed track: ${x}`);
for (const x of requiredFounderGates) if (!gate.founder_decision_required_for?.includes(x)) errors.push(`missing founder gate: ${x}`);

if (gate.cross_track_rule?.may_make_final_external_provider_decision !== false) errors.push('cross-track final provider decision must be false');
if (gate.cross_track_rule?.must_route_external_provider_decision_to_track_z !== true) errors.push('Track Z routing must be mandatory');
if (gate.fail_closed?.track_z_review_missing !== 'BLOCK') errors.push('missing Track Z review must BLOCK');
if (gate.fail_closed?.kpmo_integrated_report_missing !== 'BLOCK') errors.push('missing KPMO report must BLOCK');
if (gate.fail_closed?.founder_report_missing !== 'BLOCK') errors.push('missing Founder report must BLOCK');
if (gate.fail_closed?.provider_core_capture !== 'NO_GO') errors.push('provider Core capture must NO_GO');
if (gate.non_bypass?.contract !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('contract approval boundary drift');
if (gate.non_bypass?.spend !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('spend approval boundary drift');
if (gate.non_bypass?.credential_activation !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('credential approval boundary drift');
if (gate.non_bypass?.external_data_acquisition !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('external data acquisition boundary drift');
if (gate.non_bypass?.production !== 'HOLD' || gate.non_bypass?.public !== 'HOLD') errors.push('production/public boundary drift');
if (gate.non_bypass?.g5 !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('G5 approval boundary drift');

if (errors.length) {
  console.error(JSON.stringify({ suite: 'KIDULTS_EXTERNAL_PROVIDER_TRACK_Z_ROUTING_GATE_V1', result: 'FAIL', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_EXTERNAL_PROVIDER_TRACK_Z_ROUTING_GATE_V1',
  result: 'PASS',
  route: gate.mandatory_route,
  routed_tracks: gate.cross_track_rule.tracks.length,
  track_z_required_outputs: gate.track_z_required_outputs.length,
  founder_decision_gates: gate.founder_decision_required_for.length,
  production: gate.non_bypass.production,
  public: gate.non_bypass.public,
  g5: gate.non_bypass.g5
}, null, 2));
