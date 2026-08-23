#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'coordination/kidults/source-intelligence/asi-legal-commercial-three-stage-gate-v1.json';
const x = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = m => { throw new Error(m); };
const has = (a, v) => Array.isArray(a) && a.includes(v);
const hasAll = (a, vals, label) => { for (const v of vals) if (!has(a,v)) fail(`${label} missing ${v}`); };

if (x.status !== 'P0_FAIL_CLOSED_EXECUTION_CONTRACT') fail('status must be P0 fail-closed');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD') fail('Production/Public must remain HOLD');
const expectedPipeline = [
  'DISCOVERY_METADATA_ONLY',
  'GATE_1_ASI_INGRESS_VERIFICATION',
  'GATE_1_SAFE_CANDIDATE_POOL',
  'GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION',
  'GATE_2_VERIFIED_ELIGIBLE_POOL',
  'GATE_3_ADMISSION_ACTIVATION_VERIFICATION',
  'BOUNDED_AUTOMATED_ACQUISITION_ELIGIBLE'
];
if (JSON.stringify(x.pipeline) !== JSON.stringify(expectedPipeline)) fail('pipeline order mismatch');

if (x.gate_1?.owner !== 'ASI_SOURCE_DISCOVERY_AND_PREFLIGHT') fail('Gate1 owner mismatch');
if (x.gate_1?.when !== 'AT_FIRST_SOURCE_DISCOVERY_OR_FIRST_COLLECTION_ATTEMPT') fail('Gate1 must be at ASI ingress');
hasAll(x.gate_1?.verification_methods,[
  'CANONICALIZE_DOMAIN_AND_SOURCE_OWNER',
  'READ_OR_RESOLVE_PRIMARY_TERMS_LICENSE_OR_OFFICIAL_OPEN_DATA_POLICY_WHERE_AVAILABLE',
  'CHECK_ROBOTS_OR_MACHINE_ACCESS_SIGNAL_WITHOUT_CIRCUMVENTION',
  'CLASSIFY_ACCESS_MODE_AS_OPEN_API_OPEN_DATA_PUBLIC_METADATA_PUBLIC_PAGE_LOGIN_PAYWALL_MEMBER_LICENSED_OR_UNKNOWN',
  'CHECK_LICENSE_OR_OPEN_DATA_IDENTIFIER_AND_COMMERCIAL_USE_SIGNAL',
  'CHECK_RETENTION_DERIVATION_REDISTRIBUTION_ATTRIBUTION_SIGNALS',
  'FAIL_CLOSED_ON_MISSING_AMBIGUOUS_CONFLICTING_OR_STALE_REQUIRED_SIGNAL'
],'Gate1 verification method');
hasAll(x.gate_1?.decisions,['PASS_TO_SAFE_CANDIDATE_POOL','REVIEW_REQUIRED','HARD_BLOCK'],'Gate1 decision');
if (x.gate_1?.output_state_on_pass !== 'SAFE_CANDIDATE_POOL_ONLY') fail('Gate1 output state mismatch');
if (x.gate_1?.collection_right_created !== false) fail('Gate1 must not create collection right');

if (x.gate_2?.owner !== 'RIGHTS_AND_COMMERCIAL_REVERIFICATION_CONTROL') fail('Gate2 owner mismatch');
if (x.gate_2?.predecessor !== 'GATE_1_ASI_INGRESS_VERIFICATION') fail('Gate2 predecessor mismatch');
hasAll(x.gate_2?.verification_methods,[
  'DO_NOT_COPY_GATE_1_DECISION_AS_EVIDENCE',
  'REOPEN_CURRENT_PRIMARY_TERMS_LICENSE_API_POLICY_OR_OFFICIAL_DATA_POLICY_WHERE_AVAILABLE',
  'VERIFY_DOCUMENT_CURRENTNESS_EXPIRY_VERSION_AND_SCOPE',
  'BUILD_PURPOSE_BY_PURPOSE_RIGHTS_MATRIX',
  'RECHECK_ACCOUNT_MEMBERSHIP_EULA_CONTRACT_PAID_PLAN_CREDENTIAL_REQUIREMENTS',
  'REJECT_IF_GATE_1_AND_GATE_2_EVIDENCE_CONFLICT_WITHOUT_RESOLUTION'
],'Gate2 verification method');
hasAll(x.gate_2?.required_purposes,['discover_metadata','collect','store','derive','internal_calibration','retention','redistribute','public_project','sold_event_fields','listing_fields','population_or_census_fields'],'Gate2 purpose');
hasAll(x.gate_2?.required_commercial_dimensions,['account_or_membership_required','eula_or_contract_required','paid_plan_or_spend_required','credential_required','rate_or_volume_limits','data_retention_constraints','derived_output_constraints','redistribution_constraints','attribution_or_notice_duties','termination_or_deletion_duties'],'Gate2 commercial dimension');
hasAll(x.gate_2?.decisions,['VERIFIED_FOR_GATE_3','VERIFIED_CONDITIONAL_APPROVAL_REQUIRED','NEEDS_CLARIFICATION','BLOCKED'],'Gate2 decision');
hasAll(x.gate_2?.no_inference_rules,['PUBLIC_VISIBILITY_IS_NOT_COMMERCIAL_USE_RIGHT','API_ACCESS_IS_NOT_STORAGE_RIGHT','LISTING_ACCESS_IS_NOT_SOLD_EVENT_RIGHT','GATE_1_PASS_IS_NOT_GATE_2_PASS'],'Gate2 no-inference rule');
if (x.gate_2?.collection_right_created !== false) fail('Gate2 must not create collection right');

if (x.gate_3?.owner !== 'PRE_PARTNER_ADMISSION_AND_KPMO_GOVERNANCE') fail('Gate3 owner mismatch');
if (x.gate_3?.predecessor !== 'GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION') fail('Gate3 predecessor mismatch');
hasAll(x.gate_3?.verification_methods,[
  'VERIFY_GATE_1_AND_GATE_2_RECEIPTS_BIND_TO_SAME_CANONICAL_SOURCE_OWNER_DOMAIN_AND_PURPOSE_SCOPE',
  'VERIFY_GATE_2_DECISION_IS_CURRENT_AND_NOT_EXPIRED_REVOKED_OR_SUPERSEDED',
  'VERIFY_ACTUAL_COLLECTION_REQUEST_IS_SUBSET_OF_VERIFIED_PURPOSE_RIGHTS',
  'VERIFY_NO_UNRESOLVED_REQUIRED_COMMERCIAL_TERM',
  'VERIFY_CREDENTIAL_PATH_ONLY_IF_NEEDED_AND_WITHIN_APPROVED_SCOPE',
  'VERIFY_RETENTION_DELETION_RATE_VOLUME_AND_ATTRIBUTION_CONTROLS_ARE_RUNTIME_BOUND',
  'VERIFY_SOURCE_SPECIFIC_KILL_SWITCH_REVOKE_AND_REVALIDATION_PATH',
  'VERIFY_NO_BLOCKED_REVOKED_SOURCE_REENTRY_BY_ALIAS_OR_NEW_RECORD_ID'
],'Gate3 verification method');
hasAll(x.gate_3?.decisions,['ADMITTED_FOR_BOUNDED_AUTOMATED_ACQUISITION','EXTERNAL_APPROVAL_REQUIRED','CONDITIONAL_HOLD','REJECTED'],'Gate3 decision');
hasAll(x.gate_3?.approval_required_when,[
  'NEW_EULA_OR_CONTRACT','PAID_PLAN_OR_SPEND','NEW_OR_EXPANDED_CREDENTIAL_PERMISSION','PROVIDER_ACTIVATION_WITH_EXTERNAL_COMMITMENT','AMBIGUOUS_OR_CUSTOM_LICENSE','PUBLIC_INTELLIGENCE_AUTHORIZATION','PRODUCTION_OR_G5'
],'Gate3 approval boundary');
hasAll(x.gate_3?.forbidden_without_admitted_state,['CONTENT_ACQUISITION','CREDENTIAL_ACTIVATION','EVIDENCE_PROMOTION','MARKET_CLAIM','PUBLIC_PROJECTION','PRODUCTION_MUTATION'],'Gate3 forbidden action');
if (!String(x.gate_3?.auto_admit_rule||'').includes('NO_NEW_CONTRACT_EULA_SPEND_CREDENTIAL_PERMISSION_OR_EXTERNAL_COMMITMENT')) fail('Gate3 auto-admit boundary missing');

for (const f of ['gate_1','gate_2','gate_3']) if (!x.verification_freshness?.[f]) fail(`freshness rule missing ${f}`);
if (x.verification_freshness?.stale_or_unknown_state !== 'FAIL_CLOSED') fail('stale/unknown must fail closed');
hasAll(x.state_transition_rules,[
  'DISCOVERY_CANNOT_SKIP_GATE_1',
  'SAFE_CANDIDATE_POOL_REQUIRES_GATE_1_PASS',
  'GATE_1_CANNOT_SKIP_GATE_2',
  'GATE_2_MUST_REVERIFY_INDEPENDENTLY',
  'GATE_2_CANNOT_SKIP_GATE_3',
  'ONLY_GATE_3_ADMITTED_STATE_CAN_ENTER_BOUNDED_AUTOMATED_ACQUISITION',
  'EXTERNALLY_BINDING_ACTION_REQUIRES_EXPLICIT_APPROVAL',
  'UNKNOWN_OR_MISSING_REQUIRED_FIELD_FAILS_CLOSED',
  'BLOCKED_OR_REVOKED_SOURCE_CANNOT_REENTER_WITH_NEW_RECORD_ID_OR_ALIAS_WITHOUT_NEW_AUTHORITY'
],'state transition rule');
hasAll(x.required_candidate_risk_fields,[
  'legal_risk_tier','commercial_risk_tier','rights_clarity','terms_state','robots_state','access_mode','license_type',
  'gate_1_decision','gate_1_verified_at','gate_1_evidence_refs',
  'gate_2_decision','gate_2_reverified_at','gate_2_evidence_refs',
  'gate_3_decision','gate_3_verified_at','gate_3_admission_receipt_ref','next_revalidation_at'
],'candidate risk field');

console.log(JSON.stringify({
  status:'PASS',
  version:x.version,
  gate1:x.gate_1.name,
  gate2:x.gate_2.name,
  gate3:x.gate_3.name,
  only_gate3_can_collect:true,
  production:x.production,
  public_release:x.public_release
},null,2));
