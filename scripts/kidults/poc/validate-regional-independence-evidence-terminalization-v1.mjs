import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2]
  || 'coordination/kidults/poc/regional-independence-evidence-terminalization-v1.json';
const document = JSON.parse(fs.readFileSync(path.join(process.cwd(), input), 'utf8'));
const failures = [];
const expect = (value, message) => { if (!value) failures.push(message); };

const canonicalScopes = [
  'designer_toys',
  'diecast_scale_models',
  'vintage_character_toys',
  'construction_mechanical_sets',
  'mechanical_watches',
  'vintage_neo_vintage_watches',
  'fine_jewelry',
  'designer_jewelry',
  'collector_cars',
  'modern_classics',
  'collector_motorcycles',
  'automotive_memorabilia',
  'sneakers',
  'handbags',
  'designer_garments',
  'eyewear',
  'seating',
  'tables_storage',
  'lighting',
  'decorative_design_objects',
  'cameras_lenses',
  'hifi_audio',
  'vintage_computing',
  'collectible_electronics',
  'video_games_consoles',
  'vinyl_recorded_music',
  'musical_instruments_artist_gear',
  'film_tv_props',
  'trading_cards',
  'comic_books',
  'sports_memorabilia',
  'historical_cultural_memorabilia'
];

const allowedTerminalStates = new Set([
  'REGIONAL_SIGNIFICANCE_VERIFIED',
  'PARTIAL_REGIONAL_EVIDENCE',
  'BLOCKED_BY_REGIONAL_INDEPENDENCE',
  'NOT_VERIFIED'
]);
const allowedPublicStates = new Set([
  'IDENTITY_REVIEWED_MULTI_REGION_PUBLIC_REPRESENTATION',
  'IDENTITY_REVIEWED_LIMITED_PUBLIC_REPRESENTATION',
  'CANDIDATE_MAPPING_REJECTED_OR_UNVERIFIED',
  'EXPLICIT_NA'
]);
const allowedOfficialRoles = new Set([
  'REGIONAL_INSTITUTION',
  'REGIONAL_RELEASE_OR_DISTRIBUTION',
  'REGIONAL_VENUE_OR_MARKET_PRESENCE'
]);
const allowedIdentityLevels = new Set([
  'OBJECT_OR_MODEL',
  'PRODUCT_FAMILY_OR_SCOPE_CLASS',
  'SUBJECT_OR_EVENT_SCOPE',
  'EXPLICIT_NA'
]);
const requiredProhibitedClaims = [
  'REGIONAL_DEMAND',
  'REGIONAL_LIQUIDITY',
  'TRANSACTION_ACTIVITY'
];

expect(document.id === 'kidults-regional-independence-evidence-terminalization-v1', 'unexpected document id');
expect(document.version === '1.0.0', 'version must be 1.0.0');
expect(document.issue === 457, 'issue must be #457');
expect(document.status === 'TRACK_A_EVIDENCE_CANDIDATE', 'status must remain Track A evidence candidate');
expect(document.production === 'HOLD', 'Production must remain HOLD');
expect(document.provider_contact === 'HOLD', 'Provider Contact must remain HOLD');
expect(document.full_320_expansion_allowed === false, '320 expansion must remain blocked');
expect(document.track_b_input_eligible === false, 'terminalization alone is not an official Track B input pair');
expect(document.canonical_input?.main_sha === 'c21965977643c3e58dab1a9ef5cc46f17230de07', 'canonical input SHA mismatch');
expect(document.canonical_input?.regional_matrix_id === 'kidults-regional-independence-adapter-matrix-v1', 'matrix lineage mismatch');
expect(document.canonical_input?.official_source_supplement_id === 'kidults-regional-independent-official-source-supplement-v1', 'official source supplement binding missing');
expect(document.canonical_input?.global_standard_hardening_contract_id === 'kidults-global-standard-poc-hardening-contract-v1', 'global-standard hardening binding missing');
expect(document.canonical_input?.public_representation_artifact_id === 9308030815, 'public representation artifact lineage mismatch');
expect(document.method?.source_capture_rule === 'PRIMARY_URL_AND_NARROW_CLAIM_RECORDED_NO_PAGE_BODY_OR_MEDIA_REUSED', 'source capture boundary mismatch');
expect(document.method?.minimum_independent_official_source_families_for_global_hardening === 2, 'global hardening must require two official source families');
expect(document.method?.freshness_rule === 'OBSERVED_ON_2026_08_18_REVALIDATION_REQUIRED_BEFORE_OFFICIAL_SNAPSHOT_HANDOFF', 'freshness/revalidation rule missing');

const sources = Array.isArray(document.source_records) ? document.source_records : [];
const sourceIds = sources.map(source => source.evidence_ref);
expect(sources.length > 0, 'at least one independent source record is required');
expect(new Set(sourceIds).size === sourceIds.length, 'evidence refs must be unique');

const sourcesById = new Map(sources.map(source => [source.evidence_ref, source]));
for (const source of sources) {
  expect(typeof source.evidence_ref === 'string' && source.evidence_ref.length > 0, 'source evidence_ref required');
  expect(typeof source.source_family_id === 'string' && source.source_family_id.length > 0, `${source.evidence_ref}: source_family_id required`);
  expect(allowedOfficialRoles.has(source.role), `${source.evidence_ref}: invalid official source role`);
  expect(typeof source.region === 'string' && source.region.length > 0, `${source.evidence_ref}: region required`);
  expect(/^https:\/\//.test(source.official_url || ''), `${source.evidence_ref}: official https URL required`);
  expect(Array.isArray(source.scope_ids) && source.scope_ids.length > 0, `${source.evidence_ref}: scope_ids required`);
  expect(source.scope_ids.every(scope => canonicalScopes.includes(scope)), `${source.evidence_ref}: unknown scope_id`);
  expect(source.verification_state === 'OFFICIAL_PRIMARY_SOURCE_OBSERVED', `${source.evidence_ref}: source must be directly observed`);
  expect(source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE', `${source.evidence_ref}: evidence must remain reference-only`);
  expect(typeof source.narrow_claim === 'string' && source.narrow_claim.length > 0, `${source.evidence_ref}: narrow claim required`);
}

const rows = Array.isArray(document.scope_rows) ? document.scope_rows : [];
const rowIds = rows.map(row => row.scope_id);
expect(rows.length === 32, 'exactly 32 scope rows required');
expect(new Set(rowIds).size === 32, 'scope rows must be unique');
expect(canonicalScopes.every(scope => rowIds.includes(scope)), 'all canonical scopes must be terminalized');
expect(!rowIds.includes('vintage_digital_watches'), 'superseded vintage_digital_watches scope prohibited');

for (const row of rows) {
  expect(allowedTerminalStates.has(row.state), `${row.scope_id}: invalid terminal state`);
  expect(allowedPublicStates.has(row.public_representation_state), `${row.scope_id}: invalid public representation state`);
  expect(allowedIdentityLevels.has(row.public_representation_identity_level), `${row.scope_id}: invalid public representation identity level`);
  expect(Array.isArray(row.public_representation_refs), `${row.scope_id}: public representation refs required`);
  if (row.public_representation_state === 'EXPLICIT_NA') {
    expect(row.public_representation_identity_level === 'EXPLICIT_NA', `${row.scope_id}: EXPLICIT_NA identity level required`);
    expect(row.public_representation_refs.length === 0, `${row.scope_id}: EXPLICIT_NA cannot cite an admitted public mapping`);
  } else {
    expect(row.public_representation_refs.length > 0, `${row.scope_id}: admitted public representation requires an evidence ref`);
    expect(row.public_representation_refs.every(ref => /^artifact:9308030815#/.test(ref)), `${row.scope_id}: public representation lineage must resolve to artifact 9308030815`);
  }
  expect(typeof row.basis === 'string' && row.basis.length > 0, `${row.scope_id}: basis required`);
  expect(Array.isArray(row.limitations) && row.limitations.length > 0, `${row.scope_id}: limitations required`);
  expect(Array.isArray(row.claims_prohibited), `${row.scope_id}: claims_prohibited required`);
  for (const claim of requiredProhibitedClaims) {
    expect(row.claims_prohibited.includes(claim), `${row.scope_id}: missing prohibited claim ${claim}`);
  }

  const refs = Array.isArray(row.independent_evidence_refs) ? row.independent_evidence_refs : [];
  const referencedSources = refs.map(ref => sourcesById.get(ref)).filter(Boolean);
  expect(referencedSources.length === refs.length, `${row.scope_id}: unknown evidence reference`);
  expect(referencedSources.every(source => source.scope_ids.includes(row.scope_id)), `${row.scope_id}: evidence scope mismatch`);

  const families = new Set([
    ...(row.public_representation_state === 'EXPLICIT_NA' ? [] : ['WIKIMEDIA_SINGLE_LINEAGE']),
    ...referencedSources.map(source => source.source_family_id)
  ]);
  const officialRolePresent = referencedSources.some(source => allowedOfficialRoles.has(source.role));

  if (row.state === 'REGIONAL_SIGNIFICANCE_VERIFIED') {
    expect(row.public_representation_state !== 'CANDIDATE_MAPPING_REJECTED_OR_UNVERIFIED', `${row.scope_id}: VERIFIED cannot rely on an unreviewed or rejected mapping`);
    expect(families.size >= 2, `${row.scope_id}: VERIFIED requires at least two independent families`);
    expect(officialRolePresent, `${row.scope_id}: VERIFIED requires institution/release/venue evidence`);
    expect(refs.length > 0, `${row.scope_id}: VERIFIED requires evidence references`);
    if (row.public_representation_state === 'EXPLICIT_NA') {
      expect(referencedSources.length >= 2, `${row.scope_id}: EXPLICIT_NA requires two independent official source families`);
    }
  }

  if (row.state === 'PARTIAL_REGIONAL_EVIDENCE') {
    expect(refs.length > 0, `${row.scope_id}: PARTIAL requires at least one observed evidence reference`);
    expect(Array.isArray(row.unmet_requirements) && row.unmet_requirements.length > 0, `${row.scope_id}: PARTIAL requires unmet_requirements`);
  }

  if (row.state === 'BLOCKED_BY_REGIONAL_INDEPENDENCE' || row.state === 'NOT_VERIFIED') {
    expect(Array.isArray(row.blockers) && row.blockers.length > 0, `${row.scope_id}: blocked/not-verified requires blockers`);
  }
}

const calculatedCounts = Object.fromEntries(
  [...allowedTerminalStates].map(state => [state, rows.filter(row => row.state === state).length])
);
for (const [state, count] of Object.entries(calculatedCounts)) {
  expect(document.summary?.counts?.[state] === count, `summary count mismatch: ${state}`);
}
expect(Object.values(calculatedCounts).reduce((sum, count) => sum + count, 0) === 32, 'terminal state counts must total 32');
expect(document.summary?.regional_p0_disposition === 'BOUNDED_NOT_RESOLVED', 'regional P0 must remain bounded, not resolved');
expect(document.next_execution === 'SCOPE_SPECIFIC_MARKET_ACTIVITY_ADAPTER', 'next execution must be market-activity adapter');

if (failures.length) {
  console.error('Regional Independence Evidence Terminalization v1: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  scopes: rows.length,
  sources: sources.length,
  counts: calculatedCounts,
  next_execution: document.next_execution,
  production: document.production
}, null, 2));
