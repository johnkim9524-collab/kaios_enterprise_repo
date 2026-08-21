import fs from 'node:fs';

const p = 'coordination/kidults/runtime/staging-real-workload-admission-contract-v1.json';
const c = JSON.parse(fs.readFileSync(p, 'utf8'));
const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };

need(c.id === 'kidults-staging-real-workload-admission-v1', 'contract id mismatch');
need(c.parent_issue === 914, 'parent issue must be 914');
need(c.environment === 'STAGING', 'environment must be STAGING');
need(c.target?.expected_name === 'ih-staging-01', 'target must be ih-staging-01');
need(c.official_inputs?.candidate === 'snapshot-candidate.json', 'candidate boundary mismatch');
need(c.official_inputs?.evidence_package === 'evidence-package.json', 'evidence boundary mismatch');
need(c.official_inputs?.track_b_assessment === 'rankability-assessment.json', 'assessment boundary mismatch');

const a = c.admission_law || {};
for (const k of [
  'candidate_and_evidence_must_both_exist',
  'candidate_evidence_must_pass_538',
  'pair_digest_required',
  'assessment_must_be_immutable',
  'assessment_must_bind_exact_pair_digest',
  'assessment_snapshot_id_must_equal_candidate_snapshot_id',
  'assessment_must_be_track_b_output',
  'synthetic_or_control_pair_rejected',
  'non_promotable_pair_rejected',
  'stale_or_rights_blocked_pair_rejected',
  'missing_value_never_coerced_to_zero'
]) need(a[k] === true, `admission law ${k} must be true`);

const r = c.runtime_replay || {};
need(r.allowed_only_after_admission_pass === true, 'runtime must wait for admission pass');
need(r.target_environment === 'STAGING', 'runtime target must be STAGING');
need(r.same_pair_digest_required === true, 'runtime must bind same pair digest');
need(r.same_assessment_id_required === true, 'runtime must bind same assessment id');
for (const m of [
  'acquisition_to_evidence_latency','evidence_to_market_event_latency','projection_refresh_latency',
  'portal_eos_read_latency_where_applicable','product_marketcell_evidence_throughput',
  'storage_retention_growth','workload_specific_usage_observation','rollback_recovery_audit_binding'
]) need(r.required_metrics?.includes(m), `missing runtime metric ${m}`);
for (const id of ['snapshot_id','evidence_package_id','assessment_id','pair_digest','correlation_id','runtime_replay_id'])
  need(r.required_audit_ids?.includes(id), `missing audit binding ${id}`);

const d = c.downstream_projection || {};
need(d.construction_allowed_only_after_track_b_and_runtime_replay === true, 'projection sequencing missing');
need(d.must_bind_same_pair_digest === true, 'projection pair binding missing');
need(d.must_bind_same_assessment_id === true, 'projection assessment binding missing');
need(d.raw_provider_payload_direct_consumption === false, 'raw provider direct consumption must be false');
need(d.synthetic_fallback === false, 'synthetic fallback must be false');

const e = c.empty_state || {};
need(e.candidate === 'NONE', 'candidate empty truth must remain NONE');
need(e.evidence_package === 'NONE', 'evidence empty truth must remain NONE');
need(e.track_b === 'NOT_STARTED', 'Track B must remain NOT_STARTED');
need(e.rankability_assessment === 'NOT_CREATED', 'assessment must remain NOT_CREATED');
need(e.final_business_workload === 'NOT_RUN', 'final workload must remain NOT_RUN');
need(e.live_projection === 'NONE', 'live projection must remain NONE');
need(e.admission_state === 'WAITING_FOR_EXACT_IMMUTABLE_PAIR', 'empty admission state mismatch');
need(e.runtime_mutation_allowed === false, 'runtime mutation must be false while pair absent');

for (const x of ['SYNTHETIC_FALLBACK_AS_REAL_WORKLOAD','TRACK_B_START_WITHOUT_EXACT_PAIR','RUNTIME_REPLAY_WITHOUT_TRACK_B_ASSESSMENT','PAIR_DIGEST_MISMATCH','ASSESSMENT_REBINDING','RAW_PROVIDER_INGESTION_BYPASS','PUBLIC_RELEASE','PRODUCTION_MUTATION','G5_PROMOTION'])
  need(c.prohibited?.includes(x), `missing prohibited shortcut ${x}`);
need(c.production === 'HOLD', 'Production must remain HOLD');
need(c.public_release === 'HOLD', 'Public release must remain HOLD');
need(c.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 must remain explicit approval');

if (errors.length) {
  console.error(JSON.stringify({suite:'STAGING_REAL_WORKLOAD_ADMISSION_V1', result:'FAIL', errors}, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite:'STAGING_REAL_WORKLOAD_ADMISSION_V1',
  result:'PASS',
  current_admission:'WAITING_FOR_EXACT_IMMUTABLE_PAIR',
  candidate:'NONE',
  evidence_package:'NONE',
  track_b:'NOT_STARTED',
  rankability_assessment:'NOT_CREATED',
  final_business_workload:'NOT_RUN',
  live_projection:'NONE',
  staging_runtime_mutation:false,
  synthetic_fallback:false,
  production:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
