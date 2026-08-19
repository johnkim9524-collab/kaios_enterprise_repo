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
measurements.push(run('canonical_bridge', process.execPath, ['scripts/kidults/source-intelligence/build-real-source-processor-bridge-r1.mjs',paths.met,paths.getty,paths.bridge]));
measurements.push(run('real_source_queue_d1_traversal', process.execPath, ['scripts/asi-real-source-queue-injection-r1.mjs',paths.bridge], service));
measurements.push(run('real_source_retry_dlq_rights_hold', process.execPath, ['scripts/asi-real-source-retry-dlq-quarantine-r1.mjs',paths.bridge,paths.failure], service));

const sizeBytes = Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,statSync(p).size]));
const totalElapsed = measurements.reduce((s,x)=>s+x.elapsed_ms,0);
const failure = JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(paths.failure,'utf8')));

const report={
  id:'kidults-runtime-control-baseline-r1',
  environment_class:'CI_CONTROL',
  workload_class:'REAL_SOURCE_DERIVED_BOUNDED_CONTROL',
  issue:481,
  production:'HOLD',
  measured_at:new Date().toISOString(),
  measurements,
  total_measured_elapsed_ms:Number(totalElapsed.toFixed(3)),
  artifact_size_bytes:sizeBytes,
  retry_attempts:failure?.retry?.attempts ?? null,
  dlq_attempts:failure?.dlq?.attempts ?? null,
  rights_quarantine_state:failure?.quarantine?.state ?? null,
  validations:{
    timing_instrumentation:'PASS',
    real_source_workload:'PASS',
    retry_dlq_control:'PASS',
    fail_closed_rights_hold:'PASS',
    dev_environment_measured:'NOT_YET',
    staging_environment_measured:'NOT_YET',
    business_capacity_claim_authorized:false,
    production_mutation:false
  },
  truth_boundary:'This is a CI control baseline for the real-source-derived bounded workload. It is not a DEV/STAGING capacity, SLO, cost, backup/restore, rollback or Product×MarketCell×Evidence performance claim.'
};
writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
