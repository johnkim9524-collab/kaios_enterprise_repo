import { spawnSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const repo = process.cwd();
const service = resolve(repo, 'services/kidults-autonomous-intelligence');
const output = process.argv[2] || '/tmp/kidults-runtime-control-baseline-r1.json';
const paths = {
  met:'/tmp/met-real-source-admission-r1.json',
  getty:'/tmp/getty-historical-sale-r1.json',
  bridge:'/tmp/asi-real-source-processor-bridge-r1.json',
  queue:'/tmp/asi-real-source-queue-injection-r1.json',
  failure:'/tmp/asi-real-source-retry-dlq-quarantine-r1.json'
};

function run(label, command, args, cwd=repo) {
  const started = performance.now();
  const r = spawnSync(command, args, {cwd, stdio:'inherit', env:{...process.env}});
  const elapsed = performance.now() - started;
  if (r.status !== 0) throw new Error(`${label}_FAILED:${r.status}`);
  return {label, elapsed_ms:Number(elapsed.toFixed(3))};
}

const measurements=[];
measurements.push(run('met_live_retrieval', process.execPath, ['scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs',paths.met]));
measurements.push(run('getty_live_retrieval', process.execPath, ['scripts/kidults/source-intelligence/run-getty-historical-sale-r1.mjs',paths.getty]));
measurements.push(run('admission_metadata_bridge', process.execPath, ['scripts/kidults/source-intelligence/build-real-source-processor-bridge-r1.mjs',paths.met,paths.getty,paths.bridge]));
measurements.push(run('local_queue_d1_compatible_harness', process.execPath, ['scripts/asi-real-source-queue-injection-r1.mjs',paths.bridge,paths.queue], service));
measurements.push(run('local_synthetic_retry_dlq_rights_hold', process.execPath, ['scripts/asi-real-source-retry-dlq-quarantine-r1.mjs',paths.bridge,paths.failure], service));

const sizeBytes = Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,statSync(p).size]));
const totalElapsed = measurements.reduce((s,x)=>s+x.elapsed_ms,0);
const queue = JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(paths.queue,'utf8')));
const failure = JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(paths.failure,'utf8')));
if (queue.execution_mode !== 'LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS' ||
    queue.backend?.database !== 'LOCAL_IN_MEMORY_SQLITE' ||
    queue.backend?.queue !== 'LOCAL_DETERMINISTIC_IN_MEMORY_QUEUE' ||
    queue.backend?.remote_cloudflare !== false ||
    queue.original_getty_record_processed !== false ||
    queue.admission?.decision !== 'HOLD' || queue.pool?.state !== 'HOLD' || queue.pool?.usable !== 0 ||
    queue.market_claim_authorized !== false || queue.production !== 'HOLD') {
  throw new Error('QUEUE_REPORT_TRUTH_BOUNDARY_INVALID');
}
if (failure.execution_mode !== 'LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS' ||
    failure.backend?.remote_cloudflare !== false ||
    failure.retry?.state !== 'PASS_SYNTHETIC_CONTROL' ||
    failure.retry?.forced_failure?.observed !== false ||
    failure.quarantine?.state !== 'PASS_SYNTHETIC_UNKNOWN_CONTROL_HOLD' ||
    failure.quarantine?.unknown_control?.observed !== false ||
    failure.market_claim_authorized !== false || failure.production !== 'HOLD') {
  throw new Error('FAILURE_REPORT_TRUTH_BOUNDARY_INVALID');
}

const report={
  id:'kidults-runtime-control-baseline-r1',
  environment_class:'CI_CONTROL',
  workload_class:'LIVE_METADATA_DERIVED_LOCAL_IN_MEMORY_BOUNDED_CONTROL',
  issue:481,
  production:'HOLD',
  measured_at:new Date().toISOString(),
  measurements,
  total_measured_elapsed_ms:Number(totalElapsed.toFixed(3)),
  artifact_size_bytes:sizeBytes,
  backend:{
    database:queue.backend.database,
    queue:queue.backend.queue,
    remote_cloudflare:false,
    canonical_cloudflare_durability_verified:false
  },
  original_source_record_processed:false,
  retry_attempts:failure?.retry?.attempts ?? null,
  dlq_attempts:failure?.dlq?.attempts ?? null,
  rights_quarantine_state:failure?.quarantine?.state ?? null,
  validations:{
    timing_instrumentation:'PASS',
    live_metadata_retrieval_workflow:'PASS',
    local_queue_d1_compatible_harness:'PASS',
    synthetic_retry_dlq_control:'PASS',
    synthetic_fail_closed_rights_hold:'PASS',
    forced_failure_source_observed:false,
    unknown_rights_source_observed:false,
    remote_cloudflare_execution_verified:false,
    dev_environment_measured:'NOT_YET',
    staging_environment_measured:'NOT_YET',
    business_capacity_claim_authorized:false,
    production_mutation:false
  },
  truth_boundary:'This is timing for a CI control that retrieves live metadata and then executes derived synthetic events in local in-memory SQLite and deterministic Queue substitutes. It is not remote Cloudflare Queue/D1 execution or durability evidence, original source-record processing, a DEV/STAGING capacity, SLO, cost, backup/restore, rollback, current-market, or Product×MarketCell×Evidence performance claim.'
};
writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
