import fs from 'node:fs';

const path = 'coordination/kidults/internalization/external-provider-track-z-routing-gate-v1.json';
const gate = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];

const requiredRoute = ['TRACK_Z_PRE_ENGAGEMENT','TRACK_Z_REVIEW','KPMO_RESPONSE_STRATEGY_REVIEW','KPMO_EXACT_FINAL_MESSAGE_REVIEW','PROGRAM_OWNER_PRE_SEND_REPORT','PROGRAM_OWNER_EXACT_MESSAGE_APPROVAL'];
const requiredTrackZOutputs = [
  'company_product_analysis','external_fact_internalization_split','abcde_dependency_classification','portfolio_priority',
  'rights_assessment','economics_roi_assessment','lock_in_and_replacement_assessment','provider_removal_assessment',
  'negotiation_objective','track_z_verdict'
];
const requiredTracks = ['A','B','C','D','E','ASI','SOURCE_POOL','INTEGRATION'];
const requiredTrackZVerdicts = ['READY_FOR_KPMO_REVIEW','ANALYSIS_REQUIRED','HOLD','WAIT','NO_GO','INTERNALIZE_FIRST'];
const requiredFounderGates = [
  'external_contract_acceptance','eula_acceptance','external_spend','credential_activation','external_data_acquisition',
  'provider_activation','production_or_public_promotion','g5'
];

if (gate.contract_id !== 'KIDULTS_EXTERNAL_PROVIDER_TRACK_Z_ROUTING_GATE_V1') errors.push('invalid contract id');
for (const x of requiredRoute) if (!gate.mandatory_route?.includes(x)) errors.push(`missing route: ${x}`);
for (const x of requiredTrackZOutputs) if (!gate.track_z_required_outputs?.includes(x)) errors.push(`missing Track Z output: ${x}`);
for (const x of requiredTracks) if (!gate.cross_track_rule?.tracks?.includes(x)) errors.push(`missing routed track: ${x}`);
for (const x of requiredFounderGates) if (!gate.founder_decision_required_for?.includes(x)) errors.push(`missing founder gate: ${x}`);
if (JSON.stringify(gate.track_z_verdicts) !== JSON.stringify(requiredTrackZVerdicts)) {
  errors.push('Track Z verdicts must end at internal KPMO review and contain no SEND authority');
}

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


const requiredPreEngagementChecks = ["exact_head_provider_governance_read","latest_human_inbound_and_complete_thread_read","message_attachment_authenticity_and_sender_authority_checked","chronology_and_duplicate_or_resend_risk_checked","other_monitor_duplicate_message_id_checked","provider_brand_legal_contract_billing_tax_and_merchant_entities_separated","provider_company_product_and_use_case_fit_assessed","source_provenance_upstream_dependency_common_parent_and_provider_independence_assessed","schema_matching_sample_evidence_assessed","field_semantics_null_empty_omitted_and_missingness_assessed","access_method_activation_timing_rate_limit_and_overage_behavior_assessed","retention_deletion_private_evaluation_and_non_reconstructive_derived_rights_assessed","image_and_media_rights_assessed","trial_price_cancellation_refund_auto_renewal_and_tax_terms_assessed","payment_access_input_data_rights_product_gate_sequence_assessed","lock_in_replacement_path_and_provider_removal_cost_assessed","negotiation_objective_evidence_request_concessions_and_prohibited_commitments_defined","non_native_english_disclosure_and_written_email_only_handling_prepared_if_call_requested","external_display_name_and_legal_contracting_party_separated","intelligence_holdings_identity_authority_billing_tax_email_authentication_conditions_checked","current_authorized_outbound_identity_confirmed","external_communication_authority_confirmed"];
for (const check of requiredPreEngagementChecks) {
  if (!gate.track_z_pre_engagement?.checks?.includes(check)) errors.push(`missing pre-engagement check: ${check}`);
}
for (const stage of ['PROVIDER_REVIEW','PROVIDER_NEGOTIATION','GMAIL_DRAFT_CREATION','SEND']) {
  if (!gate.track_z_pre_engagement?.required_before?.includes(stage)) errors.push(`pre-engagement not required before: ${stage}`);
}
if (gate.track_z_pre_engagement?.receipt_required !== true) errors.push('Track Z pre-engagement receipt must be required');
if (gate.track_z_pre_engagement?.payment_is_not_evidence_for_later_gates !== true) errors.push('payment evidence boundary missing');
if (gate.fail_closed?.track_z_pre_engagement_missing !== 'DO_NOT_REVIEW_OR_NEGOTIATE') errors.push('missing Track Z pre-engagement must block review or negotiation');
if (gate.fail_closed?.kpmo_response_strategy_review_missing !== 'DO_NOT_SEND') errors.push('missing KPMO strategy review must DO_NOT_SEND');
if (gate.fail_closed?.kpmo_exact_final_message_review_missing !== 'DO_NOT_SEND') errors.push('missing KPMO exact message review must DO_NOT_SEND');
if (gate.fail_closed?.program_owner_pre_send_report_missing !== 'DO_NOT_SEND') errors.push('missing Program Owner report must DO_NOT_SEND');
if (gate.fail_closed?.program_owner_exact_message_approval_missing_or_stale !== 'DO_NOT_SEND') errors.push('missing or stale Program Owner approval must DO_NOT_SEND');
if (gate.program_owner_exact_message_approval?.kpmo_self_approval_allowed !== false) errors.push('KPMO self approval must be forbidden');
if (!gate.program_owner_exact_message_approval?.binding_fields?.includes('approved_content_sha256')) errors.push('approval content hash binding missing');
if (!gate.program_owner_exact_message_approval?.invalidation_events?.includes('new_human_inbound')) errors.push('new inbound approval invalidation missing');
if (gate.communication_interpretation?.bilingual_email_formatting_rule !== false) errors.push('bilingual formatting misinterpretation');
if (gate.non_bypass?.external_communication !== 'EXPLICIT_PROGRAM_OWNER_EXACT_MESSAGE_APPROVAL_REQUIRED') errors.push('external communication approval boundary drift');
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
  track_z_verdicts: gate.track_z_verdicts,
  track_z_pre_engagement_checks: gate.track_z_pre_engagement.checks.length,
  kpmo_strategy_and_exact_message_review_required: true,
  program_owner_exact_message_approval_required: true,
  founder_decision_gates: gate.founder_decision_required_for.length,
  production: gate.non_bypass.production,
  public: gate.non_bypass.public,
  g5: gate.non_bypass.g5
}, null, 2));
