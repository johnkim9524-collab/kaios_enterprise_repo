import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2]
  || 'coordination/kidults/poc/regional-independence-evidence-terminalization-v1.json';
const publicReferenceCatalogInput = process.argv[3]
  || 'coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const document = JSON.parse(fs.readFileSync(path.join(process.cwd(), input), 'utf8'));
const publicReferenceCatalog = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), publicReferenceCatalogInput), 'utf8')
);
const failures = [];
const expect = (value, message) => { if (!value) failures.push(message); };

const EXPECTED_SOURCE_VERIFICATION_STATE = 'PRIMARY_URL_CLAIM_RECORDED_REPRODUCIBLE_CAPTURE_PENDING';
const EXPECTED_PUBLIC_ARTIFACT_ID = 9308030815;
const PUBLIC_REFERENCE_PATTERN = /^artifact:9308030815#([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function canonicalScopeId(scopeId) {
  return scopeId === 'vintage_digital_watches'
    ? 'vintage_neo_vintage_watches'
    : scopeId;
}

function normalizedIdentifier(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLowerCase()
    : '';
}

function normalizedPublisher(value) {
  return normalizedIdentifier(value).replace(/\s+/g, ' ');
}

function officialUrlIdentity(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    url.searchParams.sort();
    const pathname = url.pathname === '/'
      ? '/'
      : url.pathname.replace(/\/+$/, '');
    const port = url.port ? `:${url.port}` : '';
    return {
      host,
      key: `https://${host}${port}${pathname || '/'}${url.search}`
    };
  } catch {
    return null;
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  } catch {
    return false;
  }
}

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
  'REGIONAL_CONTEXT_SOURCE_PAIR_RECORDED_CANDIDATE',
  'PARTIAL_REGIONAL_EVIDENCE',
  'BLOCKED_BY_REGIONAL_INDEPENDENCE',
  'NOT_VERIFIED'
]);
const allowedPublicStates = new Set([
  'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED',
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
expect(document.independent_review_status === 'FORMAL_INDEPENDENT_REVIEW_PENDING', 'formal independent review must remain pending');
expect(document.reproducibility_state === 'PRIMARY_URL_CLAIM_AND_ACCESS_DATE_RECORDED_IMMUTABLE_PAGE_CAPTURE_PENDING', 'immutable page capture must remain pending');
expect(document.evidence_package_state === 'NOT_CREATED', 'Evidence Package must remain not created');
expect(document.production === 'HOLD', 'Production must remain HOLD');
expect(document.provider_contact === 'HOLD', 'Provider Contact must remain HOLD');
expect(document.full_320_expansion_allowed === false, '320 expansion must remain blocked');
expect(document.track_b_input_eligible === false, 'terminalization alone is not an official Track B input pair');
expect(document.canonical_input?.main_sha === 'c21965977643c3e58dab1a9ef5cc46f17230de07', 'canonical input SHA mismatch');
expect(document.canonical_input?.regional_matrix_id === 'kidults-regional-independence-adapter-matrix-v1', 'matrix lineage mismatch');
expect(document.canonical_input?.official_source_supplement_id === 'kidults-regional-independent-official-source-supplement-v1', 'official source supplement binding missing');
expect(document.canonical_input?.global_standard_hardening_contract_id === 'kidults-global-standard-poc-hardening-contract-v1', 'global-standard hardening binding missing');
expect(document.canonical_input?.public_representation_artifact_id === EXPECTED_PUBLIC_ARTIFACT_ID, 'public representation artifact lineage mismatch');
expect(document.canonical_input?.public_representation_semantics === 'WIKIMEDIA_CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED_NOT_REGIONAL_EVIDENCE_NOT_DEMAND_NOT_TRANSACTION', 'public representation semantics must remain non-admitted and fail-closed');
expect(document.canonical_input?.public_representation_identity_review_ledger === 'NOT_CREATED', 'identity review ledger must not be implied');
expect(document.method?.source_capture_rule === 'PRIMARY_URL_NARROW_CLAIM_AND_ACCESS_DATE_RECORDED_NO_PAGE_BODY_OR_MEDIA_REUSED_IMMUTABLE_PAGE_CAPTURE_PENDING', 'source capture boundary must remain immutable-capture-pending');
expect(document.method?.minimum_independent_official_source_families_for_global_hardening === 2, 'global hardening must require two official source families');
expect(document.method?.freshness_rule === 'OBSERVED_ON_2026_08_18_REVALIDATION_REQUIRED_BEFORE_OFFICIAL_SNAPSHOT_HANDOFF', 'freshness/revalidation rule missing');
expect(document.summary?.regional_p0_disposition === 'BOUNDED_NOT_RESOLVED', 'regional P0 must remain bounded and unresolved');

const sources = Array.isArray(document.source_records) ? document.source_records : [];
const sourceIds = sources.map(source => source.evidence_ref);
expect(sources.length > 0, 'at least one independent source record is required');
expect(new Set(sourceIds).size === sourceIds.length, 'evidence refs must be unique');

const publicReferenceRecords = Array.isArray(publicReferenceCatalog.records)
  ? publicReferenceCatalog.records
  : [];
const publicReferenceIds = publicReferenceRecords.map(record => record.representative_product_id);
expect(publicReferenceCatalog.id === 'scope-poc-anchor-selection-v1', 'unexpected public reference catalog id');
expect(publicReferenceIds.length > 0, 'public reference catalog must contain records');
expect(new Set(publicReferenceIds).size === publicReferenceIds.length, 'public reference catalog IDs must be unique');
for (const record of publicReferenceRecords) {
  expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.representative_product_id || ''), 'public reference catalog contains an invalid representative_product_id');
  expect(canonicalScopes.includes(canonicalScopeId(record.target_scope_id)), `${record.representative_product_id}: public reference catalog contains an unknown Scope`);
}
const publicReferencesById = new Map(
  publicReferenceRecords.map(record => [record.representative_product_id, record])
);

const sourcesById = new Map(sources.map(source => [source.evidence_ref, source]));
const sourceUrlKeys = [];
const sourceFamilyKeys = [];
for (const source of sources) {
  expect(typeof source.evidence_ref === 'string' && source.evidence_ref.length > 0, 'source evidence_ref required');
  expect(typeof source.source_family_id === 'string' && source.source_family_id.length > 0, `${source.evidence_ref}: source_family_id required`);
  expect(typeof source.publisher === 'string' && source.publisher === source.publisher.trim() && normalizedPublisher(source.publisher).length > 0, `${source.evidence_ref}: publisher required`);
  expect(allowedOfficialRoles.has(source.role), `${source.evidence_ref}: invalid official source role`);
  expect(typeof source.region === 'string' && source.region.length > 0, `${source.evidence_ref}: region required`);
  const urlIdentity = officialUrlIdentity(source.official_url);
  expect(Boolean(urlIdentity), `${source.evidence_ref}: valid official HTTPS URL required`);
  if (urlIdentity) sourceUrlKeys.push(urlIdentity.key);
  const familyKey = normalizedIdentifier(source.source_family_id);
  if (familyKey) sourceFamilyKeys.push(familyKey);
  expect(Array.isArray(source.scope_ids) && source.scope_ids.length > 0, `${source.evidence_ref}: scope_ids required`);
  expect(source.scope_ids.every(scope => canonicalScopes.includes(scope)), `${source.evidence_ref}: unknown scope_id`);
  expect(source.verification_state === EXPECTED_SOURCE_VERIFICATION_STATE, `${source.evidence_ref}: source verification must remain reproducible-capture-pending`);
  expect(source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE', `${source.evidence_ref}: evidence must remain reference-only`);
  expect(typeof source.narrow_claim === 'string' && source.narrow_claim.length > 0, `${source.evidence_ref}: narrow claim required`);
  expect(isIsoDate(source.accessed_on), `${source.evidence_ref}: accessed_on must be an ISO calendar date`);
  expect(source.accessed_on === document.observed_on, `${source.evidence_ref}: accessed_on must match document observed_on`);
}
expect(sourceUrlKeys.length === sources.length && new Set(sourceUrlKeys).size === sources.length, 'official source URLs must be valid and unique after normalization');
expect(sourceFamilyKeys.length === sources.length && new Set(sourceFamilyKeys).size === sources.length, 'source_family_id values must be non-empty and unique after normalization');

const rows = Array.isArray(document.scope_rows) ? document.scope_rows : [];
const rowIds = rows.map(row => row.scope_id);
expect(rows.length === 32, 'exactly 32 scope rows required');
expect(new Set(rowIds).size === 32, 'scope rows must be unique');
expect(canonicalScopes.every(scope => rowIds.includes(scope)), 'all canonical scopes must be terminalized');
expect(!rowIds.includes('vintage_digital_watches'), 'superseded vintage_digital_watches scope prohibited');

const claimedPublicReferenceIds = new Map();
for (const row of rows) {
  expect(allowedTerminalStates.has(row.state), `${row.scope_id}: invalid terminal state`);
  expect(allowedPublicStates.has(row.public_representation_state), `${row.scope_id}: invalid public representation state`);
  expect(allowedIdentityLevels.has(row.public_representation_identity_level), `${row.scope_id}: invalid public representation identity level`);
  expect(Array.isArray(row.public_representation_refs), `${row.scope_id}: public representation refs required`);
  const publicRefs = Array.isArray(row.public_representation_refs)
    ? row.public_representation_refs
    : [];
  expect(new Set(publicRefs).size === publicRefs.length, `${row.scope_id}: public representation refs must be unique`);

  if (row.public_representation_state === 'EXPLICIT_NA') {
    expect(row.public_representation_identity_level === 'EXPLICIT_NA', `${row.scope_id}: EXPLICIT_NA identity level required`);
    expect(publicRefs.length === 0, `${row.scope_id}: EXPLICIT_NA cannot cite a public mapping candidate`);
  } else if (row.public_representation_state === 'CANDIDATE_MAPPING_REJECTED_OR_UNVERIFIED') {
    expect(publicRefs.length === 0, `${row.scope_id}: rejected or unverified mapping cannot retain an artifact ref`);
  } else if (row.public_representation_state === 'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED') {
    expect(row.public_representation_identity_level !== 'EXPLICIT_NA', `${row.scope_id}: mapping candidate requires a non-NA identity level`);
    expect(publicRefs.length > 0, `${row.scope_id}: mapping candidate requires an artifact ref`);
  }

  for (const ref of publicRefs) {
    const match = typeof ref === 'string' ? PUBLIC_REFERENCE_PATTERN.exec(ref) : null;
    expect(Boolean(match), `${row.scope_id}: public ref must exactly match artifact:9308030815#<representative_product_id>`);
    if (!match) continue;
    const fragment = match[1];
    const publicRecord = publicReferencesById.get(fragment);
    expect(Boolean(publicRecord), `${row.scope_id}: public ref fragment is not in the known anchor catalog: ${fragment}`);
    if (publicRecord) {
      expect(canonicalScopeId(publicRecord.target_scope_id) === row.scope_id, `${row.scope_id}: public ref fragment belongs to a different Scope: ${fragment}`);
    }
    expect(!claimedPublicReferenceIds.has(fragment), `${row.scope_id}: public ref fragment is already claimed by ${claimedPublicReferenceIds.get(fragment)}`);
    claimedPublicReferenceIds.set(fragment, row.scope_id);
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

  const officialFamilies = new Set(referencedSources.map(source => normalizedIdentifier(source.source_family_id)));
  const officialRolePresent = referencedSources.some(source => allowedOfficialRoles.has(source.role));

  if (row.state === 'REGIONAL_CONTEXT_SOURCE_PAIR_RECORDED_CANDIDATE') {
    expect(officialRolePresent, `${row.scope_id}: candidate requires institution/release/venue evidence`);
    expect(refs.length > 0, `${row.scope_id}: candidate requires official evidence references`);
    expect(officialFamilies.size >= 1, `${row.scope_id}: candidate requires an official source family`);
    if (row.public_representation_state !== 'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED') {
      expect(officialFamilies.size >= 2, `${row.scope_id}: no usable public mapping requires two independent official source families`);
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
