import fs from 'node:fs/promises';

const [planPath, samplingPath] = process.argv.slice(2);
if (!planPath || !samplingPath) throw new Error('usage: validate-empirical-acquisition-wave1-r1.mjs <wave1.json> <sampling.json>');
const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
const sampling = JSON.parse(await fs.readFile(samplingPath, 'utf8'));

if (plan.id !== 'kidults-er-empirical-acquisition-wave1-r1') throw new Error('WAVE1_ID_INVALID');
if (plan.status !== 'ACTIVE_PARTIAL_ACQUISITION') throw new Error('WAVE1_STATUS_INVALID');
if (plan.production !== 'HOLD' || plan.public_release !== 'HOLD') throw new Error('WAVE1_RELEASE_BOUNDARY_REQUIRED');
if (sampling.dataset_target?.total_cases !== 840 || sampling.dataset_target?.blind_holdout_cases !== 420) throw new Error('SAMPLING_840_420_REQUIRED');
if (plan.operating_target?.total_cases !== 840 || plan.operating_target?.blind_holdout !== 420 || plan.operating_target?.per_stratum !== 120 || plan.operating_target?.per_stratum_blind !== 60) throw new Error('WAVE1_TARGET_MISMATCH');
if (!Array.isArray(plan.lanes) || plan.lanes.length !== 7) throw new Error('SEVEN_LANES_REQUIRED');
const sampleIds = new Set((sampling.strata || []).map(x => x.stratum_id));
for (const lane of plan.lanes) {
  if (!sampleIds.has(lane.stratum_id)) throw new Error(`UNKNOWN_STRATUM:${lane.stratum_id}`);
  if (lane.target_cases !== 120) throw new Error(`TARGET_120_REQUIRED:${lane.stratum_id}`);
}
const ready = plan.lanes.filter(x => x.state === 'START_READY');
const blocked = plan.lanes.filter(x => x.state !== 'START_READY');
if (ready.length !== 3 || ready.reduce((n,x)=>n+x.target_cases,0) !== 360) throw new Error('START_READY_360_REQUIRED');
if (blocked.reduce((n,x)=>n+x.target_cases,0) !== 480) throw new Error('BLOCKED_CONDITIONAL_480_REQUIRED');
if (!plan.lanes.some(x => x.stratum_id === 'er-stratum-graded-population' && x.state === 'BLOCKED_BULK_RIGHTS')) throw new Error('GRADED_BULK_RIGHTS_FAIL_CLOSED_REQUIRED');
if (plan.parallel_execution?.reviewer_a !== 'NOT_ASSIGNED' || plan.parallel_execution?.reviewer_b !== 'NOT_ASSIGNED') throw new Error('REVIEWER_IDENTITY_MUST_NOT_BE_FABRICATED');
if (plan.parallel_execution?.labels_collected !== 0 || plan.parallel_execution?.blind_partition_sealed !== false || plan.parallel_execution?.empirical_attestation_created !== false || plan.parallel_execution?.track_b_started !== false) throw new Error('DOWNSTREAM_MUST_REMAIN_BLOCKED');
console.log('PASS: Wave 1 starts 360 cases immediately and fails closed on 480 cases requiring source/right terminalization; reviewer/attestation/Track B remain unclaimed.');
