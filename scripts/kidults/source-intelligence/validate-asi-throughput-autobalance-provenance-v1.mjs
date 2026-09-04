#!/usr/bin/env node
import fs from 'node:fs';

const target = process.argv[2] || '.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml';

function validate(text) {
  const failures = [];
  const requireText = (needle, label) => {
    if (!text.includes(needle)) failures.push(`missing ${label}`);
  };
  const rejectText = (needle, label) => {
    if (text.includes(needle)) failures.push(`forbidden ${label}`);
  };

  rejectText('/actions/artifacts?per_page=100', 'repository-global artifact lookup');
  rejectText('-f status=success', 'single-shot success-only producer lookup');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml/runs', 'retired v1 producer workflow lookup');
  rejectText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml"', 'retired v1 producer path binding');
  rejectText('.name=="kidults-asi-global-any-site-source-pool-v1"', 'retired v1 source-pool artifact');
  rejectText('.name=="kidults-asi-global-any-site-hourly-cycle-v1"', 'retired v1 hourly-cycle artifact');
  rejectText("find discovery-out/raw -type f -name 'global-low-risk-discovery.json'", 'raw discovery payload selector');
  rejectText("status: 'VERIFIED_EXACT_PRODUCER_BINDING'", 'pre-freshness provenance status');

  requireText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml/runs', 'canonical producer workflow-run lookup');
  requireText('/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100', 'run-scoped artifact lookup');
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"', 'canonical producer path binding');
  requireText('.name=="KIDULTS ASI Global Any-Site Hourly Pooling v2"', 'canonical producer name binding');
  requireText('.head_sha==$sha', 'exact producer SHA binding');
  requireText('EXPECTED_PRODUCER_SHA="$CURRENT_SHA"', 'current-main exact-generation binding');
  requireText('test "$GITHUB_REF" = "refs/heads/main"', 'non-PR protected-main gate');
  requireText('AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=10', 'bounded producer wait attempt cap');
  requireText('AUTOBALANCE_PRODUCER_WAIT_SECONDS=3', 'bounded producer wait interval');
  requireText('for ATTEMPT in $(seq 1 "$AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS")', 'bounded producer poll loop');
  requireText('sort_by(.created_at) | reverse | .[0] // empty', 'deterministic latest exact-generation producer selection');
  requireText('if [ "$HOURLY_RUN_STATUS" = "completed" ] && [ "$HOURLY_RUN_CONCLUSION" = "success" ]; then', 'producer success terminal gate');
  requireText('UPSTREAM_EXACT_GENERATION_TERMINAL_NON_SUCCESS', 'precise terminal non-success diagnosis');
  requireText('UPSTREAM_EXACT_GENERATION_NOT_TERMINAL', 'precise bounded-wait timeout diagnosis');
  requireText('sleep "$AUTOBALANCE_PRODUCER_WAIT_SECONDS"', 'bounded producer wait sleep');
  requireText("find discovery-out/raw -type f -name 'global-low-risk-discovery-governed-v2.json'", 'governed discovery payload selector');
  requireText('AUTOBALANCE_DISCOVERY_PAYLOAD=global-low-risk-discovery-governed-v2.json', 'governed discovery receipt binding');
  requireText("discovery_payload: process.env.AUTOBALANCE_DISCOVERY_PAYLOAD", 'governed discovery receipt field');
  requireText('build-asi-throughput-coverage-autobalance-v1.mjs --self-test', 'source-family and gate-schema self-test');

  requireText('validate-autobalance-hourly-producer-freshness-v1.mjs --self-test', 'freshness helper self-test');
  requireText('validate-autobalance-hourly-producer-freshness-v1.mjs \\', 'freshness helper execution');
  requireText('--created-at "$HOURLY_RUN_CREATED_AT"', 'producer created-at freshness binding');
  requireText('--observed-at "$HOURLY_FRESHNESS_OBSERVED_AT"', 'freshness observation-time binding');
  requireText('--source-sha "$HOURLY_SOURCE_SHA"', 'freshness source-SHA binding');
  requireText('--run-id "$HOURLY_RUN_ID"', 'freshness run binding');
  requireText('AUTOBALANCE_HOURLY_RUN_CREATED_AT', 'producer created-at provenance');
  requireText('AUTOBALANCE_HOURLY_FRESHNESS_OBSERVED_AT', 'freshness observed-at provenance');
  requireText('AUTOBALANCE_HOURLY_PRODUCER_AGE_SECONDS', 'producer age provenance');
  requireText('AUTOBALANCE_HOURLY_FRESHNESS_SLO_MINUTES', 'freshness SLO provenance');
  requireText('AUTOBALANCE_HOURLY_FRESHNESS_RECEIPT_DIGEST', 'freshness receipt digest provenance');
  requireText('test "$HOURLY_FRESHNESS_SLO_MINUTES" = "90"', '90-minute freshness SLO enforcement');
  requireText('Number(process.env.AUTOBALANCE_HOURLY_PRODUCER_AGE_SECONDS) > 5400', '90-minute receipt-side age ceiling');
  requireText('freshness_validated_before_artifact_download: true', 'freshness-before-artifact provenance assertion');
  requireText('created_at: process.env.AUTOBALANCE_HOURLY_RUN_CREATED_AT', 'producer created-at receipt field');
  requireText('freshness_observed_at: process.env.AUTOBALANCE_HOURLY_FRESHNESS_OBSERVED_AT', 'freshness observed-at receipt field');
  requireText('age_seconds: Number(process.env.AUTOBALANCE_HOURLY_PRODUCER_AGE_SECONDS)', 'producer age receipt field');
  requireText('freshness_slo_minutes: Number(process.env.AUTOBALANCE_HOURLY_FRESHNESS_SLO_MINUTES)', 'freshness SLO receipt field');
  requireText('freshness_receipt_digest: process.env.AUTOBALANCE_HOURLY_FRESHNESS_RECEIPT_DIGEST', 'freshness digest receipt field');
  requireText("status: 'VERIFIED_EXACT_FRESH_PRODUCER_BINDING'", 'fresh exact-producer provenance receipt status');
  requireText('/tmp/autobalance-hourly-producer-freshness-v1.json', 'freshness receipt retained in artifact');

  const freshnessCall = text.indexOf('node scripts/kidults/source-intelligence/validate-autobalance-hourly-producer-freshness-v1.mjs \\');
  const artifactRead = text.indexOf('/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100');
  if (freshnessCall < 0 || artifactRead < 0 || freshnessCall > artifactRead) failures.push('freshness gate occurs after artifact read');

  requireText('scripts/kidults/kpmo/validate-safe-zip-archive-v1.py', 'safe ZIP pre-extraction validator');
  requireText('--archive /tmp/meta.zip', 'source-pool safe ZIP validation');
  requireText('--archive /tmp/disc.zip', 'hourly-cycle safe ZIP validation');
  for (const basename of [
    'asi-gate1-safe-candidate-pool-v2.json',
    'asi-gate2-independent-reverification-v2.json',
    'asi-gate3-admission-runtime-v2.json',
    'asi-admitted-metadata-pool-v2.json',
    'global-low-risk-discovery-governed-v2.json',
  ]) requireText(`--required-basename ${basename}`, `safe ZIP required basename ${basename}`);
  requireText('AUTOBALANCE_META_SAFE_ZIP_RECEIPT_DIGEST', 'source-pool safe ZIP receipt binding');
  requireText('AUTOBALANCE_DISC_SAFE_ZIP_RECEIPT_DIGEST', 'hourly-cycle safe ZIP receipt binding');
  requireText('safe_zip_validated_before_extraction: true', 'safe ZIP receipt assertion');
  for (const archive of ['meta', 'disc']) {
    const validation = text.indexOf(`--archive /tmp/${archive}.zip`);
    const extraction = text.indexOf(`unzip -q -o /tmp/${archive}.zip`);
    if (validation < 0 || extraction < 0 || validation > extraction) failures.push(`unsafe extraction order ${archive}`);
  }

  const prBoundaryMatches = text.match(/if: github\.event_name != 'pull_request'/g) || [];
  if (prBoundaryMatches.length < 5) failures.push('missing PR structural/live execution separation');

  for (const artifactName of ['kidults-asi-global-any-site-source-pool-v2','kidults-asi-global-any-site-hourly-cycle-v2']) {
    requireText(`.name=="${artifactName}"`, `${artifactName} selection`);
  }
  const cardinalityMatches = text.match(/\]\s*\|\s*if length==1 then \.\[0\] else empty end/g) || [];
  if (cardinalityMatches.length < 2) failures.push('missing exact artifact cardinality for both producer artifacts');

  requireText('.workflow_run.id==$run', 'artifact producer run binding');
  requireText('.workflow_run.head_sha==$sha', 'artifact producer SHA binding');
  requireText('^sha256:[0-9a-f]{64}$', 'provider artifact digest validation');
  requireText('mixed_generation_allowed: false', 'mixed-generation prohibition');
  requireText('/tmp/asi-throughput-autobalance-provenance-v1.json', 'provenance receipt artifact');
  requireText("public_release: 'HOLD'", 'public HOLD');
  requireText("production: 'HOLD'", 'production HOLD');

  return failures;
}

const text = fs.readFileSync(target, 'utf8');
const failures = validate(text);
if (failures.length) {
  console.error('ASI throughput autobalance provenance: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  ['/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100','/actions/artifacts?per_page=100'],
  ['.workflow_run.id==$run','.workflow_run.id>0'],
  ['.workflow_run.head_sha==$sha','.workflow_run.head_branch=="main"'],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"','.head_branch=="main"'],
  ['EXPECTED_PRODUCER_SHA="$CURRENT_SHA"','EXPECTED_PRODUCER_SHA=""'],
  ['mixed_generation_allowed: false','mixed_generation_allowed: true'],
  ['AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=10','AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=1'],
  ['sort_by(.created_at) | reverse | .[0] // empty','.[0] // empty'],
  ['UPSTREAM_EXACT_GENERATION_NOT_TERMINAL','UPSTREAM_NOT_FOUND'],
  ["global-low-risk-discovery-governed-v2.json","global-low-risk-discovery.json"],
  ['--archive /tmp/meta.zip','--archive /tmp/meta-unverified.zip'],
  ['--archive /tmp/disc.zip','--archive /tmp/disc-unverified.zip'],
  ['safe_zip_validated_before_extraction: true','safe_zip_validated_before_extraction: false'],
  ["status: 'VERIFIED_EXACT_FRESH_PRODUCER_BINDING'","status: 'VERIFIED_EXACT_PRODUCER_BINDING'"],
  ['test "$HOURLY_FRESHNESS_SLO_MINUTES" = "90"','test "$HOURLY_FRESHNESS_SLO_MINUTES" = "999"'],
  ['freshness_validated_before_artifact_download: true','freshness_validated_before_artifact_download: false'],
  ['--created-at "$HOURLY_RUN_CREATED_AT"','--created-at "2026-01-01T00:00:00Z"']
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${from}`);
    process.exit(1);
  }
  const mutated = text.split(from).join(to);
  if (validate(mutated).length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject mutation: ${from} -> ${to}`);
    process.exit(1);
  }
}

const freshnessRemovalMutation = text.replace(/\s*node scripts\/kidults\/source-intelligence\/validate-autobalance-hourly-producer-freshness-v1\.mjs \\\n\s*--created-at[\s\S]*?--output \/tmp\/autobalance-hourly-producer-freshness-v1\.json\n/, '\n');
if (validate(freshnessRemovalMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject freshness gate removal');
  process.exit(1);
}

const unsafeExtractionMutation = text
  .replace(/python3 scripts\/kidults\/kpmo\/validate-safe-zip-archive-v1\.py[\s\S]*?--required-basename global-low-risk-discovery-governed-v2\.json\n/, '')
  .replace(/python3 scripts\/kidults\/kpmo\/validate-safe-zip-archive-v1\.py[\s\S]*?--required-basename asi-admitted-metadata-pool-v2\.json\n/, '');
if (validate(unsafeExtractionMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject safe-ZIP pre-extraction removal');
  process.exit(1);
}

const boundaryMutation = text.replaceAll("if: github.event_name != 'pull_request'", "if: always()");
if (validate(boundaryMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject PR live-execution boundary removal');
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'VERIFIED_PASS',
  control: 'ASI_THROUGHPUT_AUTOBALANCE_EXACT_FRESH_PRODUCER_PROVENANCE',
  mutation_cases_rejected: mutations.length + 3,
  pr_validation_mode: 'STRUCTURAL_AND_NEGATIVE_ONLY',
  live_consumption_mode: 'SCHEDULE_OR_MANUAL_EXACT_MAIN_ONLY',
  producer_wait: {max_attempts:10,interval_seconds:3,terminal_non_success:'FAIL_CLOSED',timeout:'FAIL_CLOSED'},
  freshness: {source:'MANAGEMENT_CONTROL_TOWER_REFRESH_CONTRACT',slo_minutes:90,stale:'FAIL_CLOSED',future:'FAIL_CLOSED',malformed:'FAIL_CLOSED',before_artifact_download:true},
  artifact_consumption: {download_digest_bound:true,safe_zip_pre_extraction_required:true,required_basename_cardinality_bound:true},
  production: 'HOLD',
  public_release: 'HOLD'
}, null, 2));
