import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  CORE_FOUR_PRODUCER_IDS,
  buildSentinelObservationFailure,
  sealHealthReceipt,
  stableHealthJson,
  validateHealthReceipt,
} from '../../../scripts/kidults/kpmo/sentinel-health-receipt-contract-v1.mjs';

const SOURCE = fileURLToPath(new URL('../../../scripts/kidults/kpmo/', import.meta.url));
const SHA = 'eb09a9fc094814519a99d0a9719d5daf47117369';
const REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const OBSERVED_AT = '2026-09-16T03:35:14.407Z';
const env = Object.freeze({
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_SHA: SHA,
  KPMO_SOURCE_SHA: SHA,
  GITHUB_RUN_ID: '1001',
  GITHUB_RUN_ATTEMPT: '1',
});
const failure = () => buildSentinelObservationFailure(new Error('SENTINEL_GENERATION_CHANGED_DURING_READ'), env, OBSERVED_AT);
const unsigned = receipt => {
  const result = structuredClone(receipt);
  delete result.receipt_digest;
  return result;
};
const changeAndReseal = change => {
  const result = unsigned(failure());
  change(result);
  return sealHealthReceipt(result);
};

// Pure contract and negative-boundary tests. No network or GitHub credentials.
test('failure has the complete producer set without inventing producer failure or PASS', () => {
  const receipt = failure();
  assert.equal(validateHealthReceipt(receipt, env), SHA);
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.deepEqual(receipt.producers.map(p => p.id), CORE_FOUR_PRODUCER_IDS);
  assert.deepEqual(receipt.failed_producers, []);
  assert.deepEqual(receipt.waiting_producers, CORE_FOUR_PRODUCER_IDS);
  assert.ok(receipt.producers.every(p => p.state === 'VERIFIED_HOLD' && p.selected_run_id === null));
  assert.ok(receipt.producers.every(p => !p.artifact_content_validated && !p.artifact_transport_verified));
  assert.equal(receipt.failure_class, 'SENTINEL_GENERATION_CHANGED_DURING_READ');
  assert.equal(receipt.semantic_content_verified, false);
  assert.equal(receipt.runtime_health_proven, false);
});

test('legacy malformed failure is reproduced, not accepted as a valid envelope', () => {
  const old = unsigned(failure());
  delete old.producers; delete old.failed_producers; delete old.waiting_producers;
  assert.throws(() => validateHealthReceipt(sealHealthReceipt(old), env), /INLINE_HEALTH_GATE_PRODUCER_CARDINALITY/);
});

test('digest is backward-compatible with the pre-existing stable JSON algorithm', () => {
  const oldStable = value => Array.isArray(value) ? `[${value.map(oldStable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${oldStable(value[key])}`).join(',')}}` : JSON.stringify(value);
  const base = {z: [false, null, 42, {b: 1, a: '한글'}], a: {d: 3, c: 2}};
  const expected = `sha256:${crypto.createHash('sha256').update(oldStable(base)).digest('hex')}`;
  assert.equal(sealHealthReceipt(base).receipt_digest, expected);
  assert.equal(stableHealthJson(base), oldStable(base));
});

test('receipt data is detached from mutable input', () => {
  const input = {rows: [{value: 3}]};
  const sealed = sealHealthReceipt(input);
  input.rows[0].value = 8;
  assert.equal(sealed.rows[0].value, 3);
});

test('JSON-unstable data is rejected', () => {
  assert.throws(() => sealHealthReceipt({bad: undefined}), /SENTINEL_RECEIPT_NOT_JSON_STABLE/);
});

test('post-seal tampering is rejected', () => {
  const value = failure(); value.producers[0].state = 'VERIFIED_PASS';
  assert.throws(() => validateHealthReceipt(value, env), /INLINE_HEALTH_GATE_DIGEST_MISMATCH/);
});

for (const [name, mutate, code] of [
  ['receipt identity', r => {r.receipt_id = 'wrong';}, 'RECEIPT_ID'],
  ['coverage scope', r => {r.coverage_scope = 'WHOLE_PLATFORM';}, 'SCOPE'],
  ['repository binding', r => {r.repository = 'other/repo';}, 'SOURCE_BINDING'],
  ['source binding', r => {r.source_sha = 'a'.repeat(40);}, 'SOURCE_BINDING'],
  ['observer run binding', r => {r.observer_run_id = '1002';}, 'OBSERVER_BINDING'],
  ['observer attempt binding', r => {r.observer_run_attempt = '2';}, 'OBSERVER_BINDING'],
  ['missing producer', r => {r.producers.pop();}, 'PRODUCER_CARDINALITY'],
  ['extra producer', r => {r.producers.push(r.producers[0]);}, 'PRODUCER_CARDINALITY'],
  ['duplicate producer', r => {r.producers[1].id = r.producers[0].id;}, 'PRODUCER_SET'],
  ['wrong producer', r => {r.producers[0].id = 'EXTRA';}, 'PRODUCER_SET'],
  ['whole platform authority', r => {r.whole_platform_authority = true;}, 'AUTHORITY_BOUNDARY'],
  ['promotion authority', r => {r.promotion_eligible = true;}, 'AUTHORITY_BOUNDARY'],
  ['provider authority', r => {r.provider_authority = true;}, 'AUTHORITY_BOUNDARY'],
  ['database authority', r => {r.database_authority = true;}, 'AUTHORITY_BOUNDARY'],
  ['public HOLD', r => {r.public = 'PASS';}, 'HOLD_BOUNDARY'],
  ['production HOLD', r => {r.production = 'PASS';}, 'HOLD_BOUNDARY'],
  ['G5 HOLD', r => {r.g5 = 'PASS';}, 'HOLD_BOUNDARY'],
]) {
  test(`existing boundary preserved: ${name}`, () => {
    assert.throws(() => validateHealthReceipt(changeAndReseal(mutate), env), new RegExp(`INLINE_HEALTH_GATE_${code}`));
  });
}

test('missing identity is not fabricated by the failure factory', () => {
  const receipt = buildSentinelObservationFailure(new Error('MISSING'), {}, OBSERVED_AT);
  assert.equal(receipt.source_sha, null);
  assert.equal(receipt.observer_run_id, null);
  assert.throws(() => validateHealthReceipt(receipt, env), /SOURCE_BINDING/);
});

test('environment source drift remains rejected', () => {
  assert.throws(() => validateHealthReceipt(failure(), {...env, GITHUB_SHA: 'a'.repeat(40)}), /SOURCE_SHA_DIVERGENCE/);
});

test('invalid source format remains rejected', () => {
  assert.throws(() => validateHealthReceipt(failure(), {...env, KPMO_SOURCE_SHA: 'bad'}), /SOURCE_SHA_INVALID/);
});

// The unsafe retry abstraction has been removed. Generation, metadata and
// attempt changes must remain observable terminal failures in this invocation.
// Future stable observations come from the existing workflow event path.

// Integration harness: actual patched CLI/selector/envelope/guard code;
// network, Git readback, artifact-content parser, trigger validator and dedupe
// core are explicit fixtures. This is NOT a live producer or platform E2E test.
const CONTENT_FIXTURE = `
export const REPOSITORY = ${JSON.stringify(REPOSITORY)};
export const MAX_ARCHIVE_BYTES = 4194304;
export function validateProducerContent() { throw new Error('CONTENT_FIXTURE_MUST_NOT_BE_USED'); }
export function validateCoverageAliasClosure() { throw new Error('ALIAS_FIXTURE_MUST_NOT_BE_USED'); }
`;
const TRIGGER_FIXTURE = `
export function readSentinelEvent() { return null; }
export function validateSentinelTrigger() { return null; }
`;
const CORE_FIXTURE = `
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[process.argv.indexOf('--output') + 1];
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, JSON.stringify({state:'FULL_AUDIT_BYPASS_NON_ALIASABLE'}));
}
`;
const FETCH_FIXTURE = `
import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
const sha = process.env.GITHUB_SHA, repo = process.env.GITHUB_REPOSITORY;
const scenario = process.env.SENTINEL_TEST_SCENARIO;
cp.execFileSync = (name, args) => {
  if(name === 'git' && JSON.stringify(args) === JSON.stringify(['rev-parse','HEAD'])) return sha + '\\n';
  throw new Error('UNEXPECTED_FIXTURE_COMMAND');
};
syncBuiltinESMExports();
const counts = new Map(); let mainReads = 0;
globalThis.fetch = async (target, options) => {
  const u = new URL(target);
  if(u.origin !== 'https://api.github.com' || options.method !== 'GET') throw new Error('UNEXPECTED_FIXTURE_NETWORK');
  fs.appendFileSync(process.env.SENTINEL_TEST_TRACE, u.pathname + '\\n');
  if(u.pathname.endsWith('/branches/main')) {
    mainReads += 1;
    const selected = scenario === 'main-drift' && mainReads > 1 ? 'a'.repeat(40) : sha;
    return new Response(JSON.stringify({commit:{sha:selected}}));
  }
  if(u.pathname.includes('/actions/workflows/') && u.pathname.endsWith('/runs')) {
    const workflow = u.pathname.split('/').at(-2);
    const n = (counts.get(workflow) || 0) + 1; counts.set(workflow, n);
    let runs = [];
    if(workflow === 'kidults-asi-shadow-operating-evidence-v1.yml' && scenario !== 'missing' && scenario !== 'main-drift') {
      const id = scenario === 'race-always' ? 100+n : scenario === 'race-once' && n === 1 ? 100 : 101;
      const red = scenario === 'latest-red';
      runs = [{id,run_attempt:1,repository:{full_name:repo},path:'.github/workflows/'+workflow,
        head_branch:'main',head_sha:sha,event:'push',created_at:'2026-09-01T00:00:00Z',
        status:red?'completed':'queued',conclusion:red?'failure':null}];
      if(n > 1) {
        if(scenario === 'metadata-drift') runs[0].created_at='2026-08-31T23:59:00Z';
        if(scenario === 'attempt-drift') runs[0].run_attempt=2;
        if(scenario === 'lifecycle-drift') {runs[0].status='completed'; runs[0].conclusion='failure';}
        if(scenario === 'generation-disappears') runs=[];
        if(scenario === 'source-drift') runs[0].head_sha='a'.repeat(40);
        if(scenario === 'start-time-drift') runs[0].run_started_at='2026-09-01T00:00:01Z';
      }

    }
    return new Response(JSON.stringify({total_count:runs.length,workflow_runs:runs}));
  }
  throw new Error('UNEXPECTED_FIXTURE_URL');
};
`;

function harness(t, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-recovery-fixture-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const scripts = path.join(root, 'scripts'); fs.mkdirSync(scripts);
  for (const name of [
    'sentinel-health-receipt-contract-v1.mjs',
    'resolve-continuous-assurance-sentinel-health-v1.mjs', 'resolve-continuous-assurance-ephemeral-guard-v1.mjs',
  ]) fs.copyFileSync(path.join(SOURCE, name), path.join(scripts, name));
  fs.writeFileSync(path.join(scripts, 'validate-sentinel-producer-content-v1.mjs'), CONTENT_FIXTURE);
  fs.writeFileSync(path.join(scripts, 'validate-sentinel-trigger-v1.mjs'), TRIGGER_FIXTURE);
  fs.writeFileSync(path.join(scripts, 'resolve-continuous-assurance-ephemeral-guard-core-v1.mjs'), CORE_FIXTURE);
  const preload = path.join(root, 'fixture-fetch.mjs'); fs.writeFileSync(preload, FETCH_FIXTURE);
  const trace = path.join(root, 'requests.txt'); fs.writeFileSync(trace, '');
  const runner = path.join(root, 'runner'), packet = path.join(runner, 'packet');
  fs.mkdirSync(packet, {recursive: true});
  const githubEnv = path.join(root, 'github-env'); fs.writeFileSync(githubEnv, '');
  const childEnv = {
    PATH: process.env.PATH,
    ...env,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_WORKFLOW: 'KIDULTS Platform Continuous Assurance V1',
    GH_TOKEN: 'fixture-not-a-real-credential',
    RUNNER_TEMP: runner,
    GITHUB_ENV: githubEnv,
    NODE_OPTIONS: '--import=' + pathToFileURL(preload).href,
    SENTINEL_TEST_SCENARIO: scenario,
    SENTINEL_TEST_TRACE: trace,
  };
  const run = (kind = 'health') => {
    const file = kind === 'guard' ? 'resolve-continuous-assurance-ephemeral-guard-v1.mjs' : 'resolve-continuous-assurance-sentinel-health-v1.mjs';
    const output = path.join(packet, kind === 'guard' ? 'ephemeral-guard-receipt.json' : 'core-four-producer-health-v1.json');
    const result = spawnSync(process.execPath, [path.join(scripts, file), '--output', output], {
      cwd: root, env: childEnv, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined);
    const receipt = JSON.parse(fs.readFileSync(path.join(packet, 'core-four-producer-health-v1.json'), 'utf8'));
    return {result, receipt, trace: fs.readFileSync(trace, 'utf8'), exported: fs.readFileSync(githubEnv, 'utf8')};
  };
  return {root, scripts, childEnv, run};
}

for (const scenario of [
  'race-once', 'race-always', 'metadata-drift', 'attempt-drift',
  'lifecycle-drift', 'generation-disappears', 'source-drift', 'start-time-drift',
]) {
  test(`actual Sentinel CLI preserves ${scenario} as RED without retry or error masking`, t => {
    const {result, receipt, trace} = harness(t, scenario).run();
    assert.equal(result.status, 1);
    assert.equal(receipt.state, 'VERIFIED_FAIL');
    assert.equal(receipt.failure_class, 'SENTINEL_GENERATION_CHANGED_DURING_READ');
    assert.equal(receipt.producers.length, 4);
    assert.ok(receipt.producers.every(p => p.state === 'VERIFIED_HOLD' && p.selected_run_id === null));
    assert.deepEqual(receipt.failed_producers, []);
    assert.equal(receipt.semantic_content_verified, false);
    assert.ok(!result.stderr.includes('SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH'));
    assert.equal(trace.split('\n').filter(x => x.endsWith('/branches/main')).length, 1);
    assert.equal(trace.split('\n').filter(x => x.includes('kidults-asi-shadow-operating-evidence-v1.yml')).length, 2);
    assert.doesNotThrow(() => validateHealthReceipt(receipt, env));
  });
}

test('unchanged nonterminal generation is HOLD, not an observation failure or runtime PASS', t => {
  const {result, receipt, trace} = harness(t, 'stable-pending').run();
  assert.equal(result.status, 1);
  assert.equal(receipt.state, 'VERIFIED_HOLD');
  assert.equal(receipt.producers[0].selected_run_id, 101);
  assert.equal(receipt.producers[0].failure_class, 'NEWER_APPLICABLE_GENERATION_NONTERMINAL');
  assert.equal(receipt.semantic_content_verified, false);
  assert.equal(trace.split('\n').filter(x => x.endsWith('/branches/main')).length, 2);
  assert.ok(!result.stderr.includes('SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH'));
});

test('actual Sentinel CLI main drift fails without retry or cardinality masking', t => {
  const {result, receipt} = harness(t, 'main-drift').run();
  assert.equal(result.status, 1);
  assert.equal(receipt.failure_class, 'SENTINEL_MAIN_CHANGED_DURING_READ');
  assert.ok(!result.stderr.includes('SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH'));
  assert.doesNotThrow(() => validateHealthReceipt(receipt, env));
});

test('actual Sentinel CLI latest red stays red; no health-based retry', t => {
  const {result, receipt} = harness(t, 'latest-red').run();
  assert.equal(result.status, 1); assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.producers[0].failure_class, 'LATEST_APPLICABLE_FAILURE');
  assert.ok(!result.stderr.includes('SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH'));
  assert.deepEqual(receipt.failed_producers, ['SHADOW']);
});

test('actual guard exports failure state and still blocks; original error is no longer masked', t => {
  const {result, receipt, exported} = harness(t, 'race-always').run('guard');
  assert.equal(result.status, 1); assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.match(result.stderr, /SENTINEL_GENERATION_CHANGED_DURING_READ/);
  assert.ok(!result.stderr.includes('INLINE_HEALTH_GATE_PRODUCER_CARDINALITY'));
  assert.match(exported, /KPMO_CORE_FOUR_HEALTH_STATE=VERIFIED_FAIL/);
  assert.match(exported, /KPMO_CORE_FOUR_HEALTH_REQUIRED=true/);
});

test('actual guard blocks a valid HOLD envelope, so schema validity is never PASS', t => {
  const {result, receipt, exported} = harness(t, 'missing').run('guard');
  assert.equal(result.status, 1); assert.equal(receipt.state, 'VERIFIED_HOLD');
  assert.match(exported, /KPMO_CORE_FOUR_HEALTH_STATE=VERIFIED_HOLD/);
});

test('existing generation selection still rejects an ambiguous duplicate', async t => {
  const h = harness(t, 'missing');
  const {SPECS, selectProducerGeneration} = await import(pathToFileURL(path.join(h.scripts, 'resolve-continuous-assurance-sentinel-health-v1.mjs')));
  const spec = SPECS[0];
  const run = {id:1,run_attempt:1,repository:{full_name:REPOSITORY},path:spec.path,head_branch:'main',head_sha:SHA,event:'push',created_at:OBSERVED_AT,status:'completed',conclusion:'failure'};
  assert.throws(() => selectProducerGeneration([run, {...run}], spec, SHA, OBSERVED_AT), /RUN_INDEX_DUPLICATE_ID/);
});

test('existing metadata-only health self-test remains fail-closed in the fixture harness', t => {
  const h = harness(t, 'missing');
  const r = spawnSync(process.execPath, [path.join(h.scripts, 'resolve-continuous-assurance-sentinel-health-v1.mjs'), '--self-test'], {
    cwd: h.root, env: h.childEnv, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.metadata_only_semantic_pass, false);
  assert.equal(result.metadata_only_state, 'VERIFIED_HOLD');
  assert.equal(result.negative, 6);
});

function installHealthEnvelopeFixture(h, {change = '', exitCode = 0} = {}) {
  fs.writeFileSync(path.join(h.scripts, 'resolve-continuous-assurance-sentinel-health-v1.mjs'), `
import fs from 'node:fs';
import {buildSentinelObservationFailure,sealHealthReceipt} from './sentinel-health-receipt-contract-v1.mjs';
const r = buildSentinelObservationFailure(new Error('FIXTURE'),process.env);
delete r.receipt_digest; delete r.failure_class;
r.state='VERIFIED_PASS'; r.semantic_content_verified=true;
r.failed_producers=[]; r.waiting_producers=[];
for(const p of r.producers) { p.state='VERIFIED_PASS'; p.artifact_content_validated=true; p.artifact_transport_verified=true; delete p.failure_class; }
${change}
fs.writeFileSync(process.argv[process.argv.indexOf('--output')+1],JSON.stringify(sealHealthReceipt(r)));
process.exitCode=${exitCode};
`);
}

test('consumer positive fixture: only a complete successful producer envelope and child exit 0 pass', t => {
  const h = harness(t, 'missing'); installHealthEnvelopeFixture(h);
  const {result, receipt, exported} = h.run('guard');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(receipt.promotion_eligible, false); assert.equal(receipt.production, 'HOLD');
  assert.match(exported, /KPMO_CORE_FOUR_HEALTH_STATE=VERIFIED_PASS/);
});

for (const [name, change, exitCode] of [
  ['child failure', '', 1],
  ['unverified semantic content', 'r.semantic_content_verified=false;', 0],
  ['unverified artifact transport', 'r.producers[0].artifact_transport_verified=false;', 0],
  ['unverified artifact content', 'r.producers[0].artifact_content_validated=false;', 0],
  ['a failed producer', "r.producers[0].state='VERIFIED_FAIL';", 0],
  ['top-level HOLD', "r.state='VERIFIED_HOLD';", 0],
]) {
  test(`consumer never grants PASS from ${name}`, t => {
    const h = harness(t, 'missing'); installHealthEnvelopeFixture(h, {change, exitCode});
    const {result} = h.run('guard'); assert.equal(result.status, 1);
  });
}

for (const scenario of ['metadata-drift','attempt-drift','race-once']) {
  test(`strict guard keeps original ${scenario} failure through its terminal receipt`, t => {
    const {result,receipt,exported} = harness(t,scenario).run('guard');
    assert.equal(result.status,1);
    assert.equal(receipt.state,'VERIFIED_FAIL');
    assert.equal(receipt.failure_class,'SENTINEL_GENERATION_CHANGED_DURING_READ');
    assert.match(exported,/KPMO_CORE_FOUR_HEALTH_STATE=VERIFIED_FAIL/);
    assert.ok(!result.stderr.includes('INLINE_HEALTH_GATE_PRODUCER_CARDINALITY'));
  });
}

test('runtime entrypoint has no retry abstraction or hidden new workflow dispatch', () => {
  const source=fs.readFileSync(path.join(SOURCE,'resolve-continuous-assurance-sentinel-health-v1.mjs'),'utf8');
  assert.ok(!source.includes('readStableSentinelSnapshot'));
  assert.ok(!source.includes('SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH'));
  assert.equal(fs.existsSync(path.join(SOURCE,'read-stable-sentinel-snapshot-v1.mjs')),false);
});
