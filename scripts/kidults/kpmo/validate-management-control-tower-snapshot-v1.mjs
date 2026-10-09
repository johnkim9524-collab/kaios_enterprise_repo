#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  buildControlTowerModel,
  CONTROL_TOWER_EVIDENCE_TIME_FIELDS,
  CONTROL_TOWER_SOURCE_PATHS,
  loadControlTowerSources,
  resolveControlTowerProducer,
  resolveControlTowerRoot,
  sha256Text
} from './lib/management-control-tower-model-v1.mjs';

const args = process.argv.slice(2);
const requireFresh = args.includes('--require-fresh');
const positional = args.filter(arg => !arg.startsWith('--'));
const [snapshotArg = 'apps/kidults-enterprise-staging/public/executive/control-tower-snapshot-v1.json', htmlArg = 'apps/kidults-enterprise-staging/public/executive/control-tower.html'] = positional;
const root = resolveControlTowerRoot();
const snapshotPath = resolve(root, snapshotArg);
const htmlPath = resolve(root, htmlArg);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');
const assert = (value, code) => { if (!value) throw new Error(code); };
if (process.env.KIDULTS_CONTROL_TOWER_VALIDATION_AT && process.env.KIDULTS_ALLOW_TEST_CLOCK !== '1') {
  throw new Error('CONTROL_TOWER_VALIDATION_CLOCK_OVERRIDE_FORBIDDEN');
}
const validationAt = process.env.KIDULTS_CONTROL_TOWER_VALIDATION_AT || new Date().toISOString();
assert(Number.isFinite(Date.parse(validationAt)), 'SNAPSHOT_VALIDATION_TIME_INVALID');
const now = Date.parse(validationAt);

assert(snapshot.id === 'kidults-management-control-tower-snapshot-v1' && snapshot.version === '1.1.0', 'SNAPSHOT_IDENTITY');
assert(snapshot.generated_by === 'KPMO_TRACK_D_GOVERNED_BUILDER', 'SNAPSHOT_WRITER');
const expectedProducer = resolveControlTowerProducer(root);
assert(isDeepStrictEqual(snapshot.producer, expectedProducer), 'SNAPSHOT_PRODUCER_PROVENANCE_MISMATCH');
assert(Number.isFinite(Date.parse(snapshot.generated_at)) && snapshot.as_of === snapshot.generated_at, 'SNAPSHOT_GENERATED_AT');
assert(Number.isFinite(Date.parse(snapshot.source_as_of)), 'SNAPSHOT_SOURCE_AS_OF');
assert(Number.isInteger(snapshot.freshness?.freshness_slo_minutes) && snapshot.freshness.freshness_slo_minutes > 0, 'SNAPSHOT_FRESHNESS_SLO');
const expectedStaleAfter = new Date(Date.parse(snapshot.generated_at) + snapshot.freshness.freshness_slo_minutes * 60_000).toISOString();
assert(snapshot.stale_after === expectedStaleAfter && snapshot.freshness.stale_after === expectedStaleAfter, 'SNAPSHOT_STALE_AFTER');
assert(snapshot.freshness.state_at_build === 'TRANSPORT_FRESH', 'SNAPSHOT_TRANSPORT_STATE_AT_BUILD');
assert(Date.parse(snapshot.generated_at) <= now + 300_000, 'SNAPSHOT_GENERATED_IN_FUTURE');

const sources = loadControlTowerSources(root);
assert(JSON.stringify(snapshot.sources) === JSON.stringify(CONTROL_TOWER_SOURCE_PATHS), 'SNAPSHOT_CANONICAL_SOURCE_MAP');
const promotionContract = sources.production_promotion.json;
const expectedProductionEvidenceProducer = {
  contract_id: promotionContract.id,
  contract_version: promotionContract.version,
  canonical_policy_version: promotionContract.canonical_policy_version,
  exact_workflow_path: promotionContract.evidence_producer?.exact_workflow_path,
  availability: promotionContract.evidence_producer?.availability,
  certification_state: promotionContract.evidence_producer?.certification_state,
  production_authority: promotionContract.evidence_producer?.production_authority
};
assert(isDeepStrictEqual(snapshot.production_evidence_producer, expectedProductionEvidenceProducer),
  'SNAPSHOT_PRODUCTION_EVIDENCE_PRODUCER_MISMATCH');
assert(snapshot.production_evidence_producer.availability === 'IMPLEMENTED_FAIL_CLOSED_AWAITING_ROOT_HELPER_INSTALL_AND_EVIDENCE'
  && snapshot.production_evidence_producer.certification_state === 'HOLD'
  && snapshot.production_evidence_producer.production_authority === 'HARD_DISABLED',
'SNAPSHOT_PRODUCTION_EVIDENCE_PRODUCER_AUTHORITY');
const sourceNames = Object.keys(snapshot.sources || {}).sort();
assert(sourceNames.length >= 6 && JSON.stringify(sourceNames) === JSON.stringify(Object.keys(snapshot.source_digests || {}).sort()), 'SNAPSHOT_SOURCE_DIGEST_COVERAGE');
for (const name of sourceNames) {
  const sourcePath = CONTROL_TOWER_SOURCE_PATHS[name];
  assert(typeof sourcePath === 'string' && !sourcePath.startsWith('/') && !sourcePath.includes('..'), `SNAPSHOT_SOURCE_PATH:${name}`);
  const text = readFileSync(resolve(root, sourcePath), 'utf8');
  assert(/^sha256:[a-f0-9]{64}$/.test(snapshot.source_digests[name]), `SNAPSHOT_SOURCE_DIGEST_FORMAT:${name}`);
  assert(snapshot.source_digests[name] === sha256Text(text), `SNAPSHOT_SOURCE_DIGEST_MISMATCH:${name}`);
}
const towerContract = JSON.parse(readFileSync(resolve(root, snapshot.sources.tower_contract), 'utf8'));
assert(snapshot.freshness.freshness_slo_minutes === towerContract.refresh_contract?.freshness_slo_minutes, 'SNAPSHOT_FRESHNESS_SLO_DRIFT');
assert(towerContract.snapshot_integrity?.local_fallback_is_unattested_and_never_canonical === true
  && towerContract.snapshot_integrity?.local_fallback_must_be_visibly_unattested === true,
'SNAPSHOT_LOCAL_FALLBACK_POLICY');
assert(towerContract.snapshot_integrity?.evidence_freshness_threshold === 'NOT_DEFINED'
  && towerContract.snapshot_integrity?.evidence_freshness_state === 'UNASSESSED_AND_VISIBLE',
'SNAPSHOT_EVIDENCE_FRESHNESS_POLICY');
assert(JSON.stringify(towerContract.snapshot_integrity?.evidence_time_sources) === JSON.stringify(Object.keys(CONTROL_TOWER_EVIDENCE_TIME_FIELDS)), 'SNAPSHOT_EVIDENCE_TIME_SOURCE_POLICY');
const sourceTimes = [];
for (const name of Object.keys(CONTROL_TOWER_SOURCE_PATHS)) {
  const field = CONTROL_TOWER_EVIDENCE_TIME_FIELDS[name];
  const expected = field ? sources[name].json[field] : null;
  assert(snapshot.source_as_of_by_input?.[name] === expected, `SNAPSHOT_SOURCE_AS_OF_INPUT_DRIFT:${name}`);
  if (field) {
    assert(Number.isFinite(Date.parse(expected)), `SNAPSHOT_SOURCE_AS_OF_INPUT_INVALID:${name}`);
    sourceTimes.push(Date.parse(expected));
  }
}
const expectedSourceAsOf = new Date(Math.min(...sourceTimes)).toISOString();
assert(snapshot.source_as_of === expectedSourceAsOf, 'SNAPSHOT_SOURCE_AS_OF_DRIFT');
assert(Date.parse(snapshot.generated_at) >= Math.max(...sourceTimes), 'SNAPSHOT_BUILD_PRECEDES_SOURCE_AS_OF');
assert(snapshot.freshness.transport?.generated_at === snapshot.generated_at && snapshot.freshness.transport?.stale_after === snapshot.stale_after, 'SNAPSHOT_TRANSPORT_FRESHNESS_BINDING');
assert(snapshot.freshness.evidence?.aggregate_as_of === expectedSourceAsOf, 'SNAPSHOT_EVIDENCE_FRESHNESS_BINDING');
assert(isDeepStrictEqual(snapshot.freshness.evidence?.by_input, snapshot.source_as_of_by_input), 'SNAPSHOT_EVIDENCE_TIME_MAP_BINDING');
const expectedOldestMaterialAgeMinutes = (Date.parse(snapshot.generated_at) - Date.parse(expectedSourceAsOf)) / 60_000;
assert(snapshot.freshness.evidence?.state_at_build === 'UNASSESSED', 'SNAPSHOT_EVIDENCE_FRESHNESS_STATE');
assert(snapshot.freshness.evidence?.threshold === 'NOT_DEFINED', 'SNAPSHOT_EVIDENCE_FRESHNESS_THRESHOLD');
assert(snapshot.freshness.evidence?.oldest_material_age_minutes_at_build === expectedOldestMaterialAgeMinutes,
  'SNAPSHOT_EVIDENCE_OLDEST_AGE_BINDING');
assert(!snapshot.headline.includes('내부 통제는 VERIFIED_PASS'), 'UNBOUND_CI_PASS_CLAIM');
const recomputed = buildControlTowerModel(sources, snapshot.generated_at, expectedProducer);
assert(isDeepStrictEqual(snapshot, recomputed), 'SNAPSHOT_SEMANTIC_RECOMPUTATION_MISMATCH');

const embedded = html.match(/const D = (\{.*?\});\n\s+const esc=/s);
assert(embedded, 'EMBEDDED_SNAPSHOT_MISSING');
assert(JSON.stringify(JSON.parse(embedded[1])) === JSON.stringify(snapshot), 'EMBEDDED_SNAPSHOT_DRIFT');
for (const marker of [
  'freshnessBanner',
  'evidenceFreshnessBanner',
  'EVIDENCE_FRESHNESS_UNASSESSED',
  'updateFreshnessBanner',
  'SNAPSHOT_STALE',
  'SNAPSHOT_FETCH_ERROR',
  'SNAPSHOT_UNATTESTED_LOCAL_FALLBACK',
  'source_as_of',
  'source_digests'
]) assert(html.includes(marker), `FRESHNESS_OR_INTEGRITY_UI_MARKER_MISSING:${marker}`);
assert(!html.includes('.catch(()=>{})'), 'SILENT_SNAPSHOT_FETCH_FAILURE');
const freshnessState = now <= Date.parse(snapshot.stale_after) ? 'FRESH' : 'STALE';
if (requireFresh) {
  assert(snapshot.producer.generation_class !== 'LOCAL_VERIFIED_FALLBACK' || process.env.KIDULTS_ALLOW_TEST_PRODUCER === '1', 'SNAPSHOT_ATTESTED_PRODUCER_REQUIRED');
  assert(freshnessState === 'FRESH', 'SNAPSHOT_FRESH_AT_VALIDATION_REQUIRED');
}

const snapshotText = readFileSync(snapshotPath, 'utf8');

console.log(JSON.stringify({
  id: 'kidults-management-control-tower-validation-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  snapshot: snapshot.id,
  generated_at: snapshot.generated_at,
  stale_after: snapshot.stale_after,
  source_as_of: snapshot.source_as_of,
  source_as_of_by_input: snapshot.source_as_of_by_input,
  evidence_freshness_state_at_build: snapshot.freshness.evidence.state_at_build,
  evidence_freshness_threshold: snapshot.freshness.evidence.threshold,
  oldest_material_age_minutes_at_build: snapshot.freshness.evidence.oldest_material_age_minutes_at_build,
  source_digests_verified: sourceNames.length,
  producer: snapshot.producer,
  production_evidence_producer: snapshot.production_evidence_producer,
  output_digests: {
    snapshot_sha256: sha256Text(snapshotText),
    html_sha256: sha256Text(html)
  },
  freshness_state_at_validation: freshnessState,
  transport_freshness_state_at_validation: freshnessState,
  freshness_required: requireFresh,
  embedded_fallback_verified: true,
  stale_error_visibility_verified: true,
  public_release: 'HOLD',
  production: 'HOLD'
}));
