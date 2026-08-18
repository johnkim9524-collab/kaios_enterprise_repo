#!/usr/bin/env node

import fs from 'node:fs';

const basePath = process.argv[2]
  || 'coordination/kidults/poc/regional-independence-evidence-terminalization-v1.json';
const supplementPath = process.argv[3]
  || 'coordination/kidults/poc/regional-independent-official-source-supplement-v1.json';

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const supplement = JSON.parse(fs.readFileSync(supplementPath, 'utf8'));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const EXPECTED_SOURCE_VERIFICATION_STATE = 'PRIMARY_URL_CLAIM_RECORDED_REPRODUCIBLE_CAPTURE_PENDING';

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

const officialRoles = new Set([
  'REGIONAL_INSTITUTION',
  'REGIONAL_RELEASE_OR_DISTRIBUTION',
  'REGIONAL_VENUE_OR_MARKET_PRESENCE'
]);

expect(supplement.id === 'kidults-regional-independent-official-source-supplement-v1', 'unexpected supplement id');
expect(supplement.version === '1.0.0', 'supplement version must be 1.0.0');
expect(supplement.issue === 457, 'supplement must bind to issue #457');
expect(supplement.status === 'TRACK_A_EVIDENCE_CANDIDATE', 'supplement must remain a Track A candidate');
expect(supplement.independent_review_status === 'FORMAL_INDEPENDENT_REVIEW_PENDING', 'formal independent review must remain pending');
expect(supplement.reproducibility_state === 'PRIMARY_URL_CLAIM_AND_ACCESS_DATE_RECORDED_IMMUTABLE_PAGE_CAPTURE_PENDING', 'immutable page capture must remain pending');
expect(supplement.evidence_package_state === 'NOT_CREATED', 'Evidence Package must remain not created');
expect(supplement.track_b_input_eligible === false, 'supplement alone cannot become Track B input');
expect(supplement.provider_contact === 'HOLD', 'Provider Contact must remain HOLD');
expect(supplement.production === 'HOLD', 'Production must remain HOLD');
expect(supplement.full_320_expansion_allowed === false, '320 expansion must remain blocked');
expect(String(supplement.claim_boundary).includes('NOT_DEMAND'), 'demand claim boundary missing');
expect(String(supplement.claim_boundary).includes('NOT_LIQUIDITY'), 'liquidity claim boundary missing');
expect(String(supplement.claim_boundary).includes('NOT_TRANSACTION'), 'transaction claim boundary missing');
expect(String(supplement.claim_boundary).includes('NOT_GLOBAL_GENERALIZATION'), 'global-generalization boundary missing');

const baseSources = Array.isArray(base.source_records) ? base.source_records : [];
const addedSources = Array.isArray(supplement.source_records) ? supplement.source_records : [];
const allSources = [...baseSources, ...addedSources];
const refs = allSources.map(source => source.evidence_ref);
expect(new Set(refs).size === refs.length, 'evidence refs must be unique across base and supplement');
const byRef = new Map(allSources.map(source => [source.evidence_ref, source]));
const baseRefs = new Set(baseSources.map(source => source.evidence_ref));
const addedRefs = new Set(addedSources.map(source => source.evidence_ref));
const sourceIdentities = new Map();

function validateOfficialSource(source, origin, expectedAccessedOn) {
  const expectedRefPattern = origin === 'supplement' ? /^RIE-1\d\d$/ : /^RIE-0\d\d$/;
  expect(expectedRefPattern.test(source.evidence_ref || ''), `${source.evidence_ref}: ${origin} ref format invalid`);
  expect(typeof source.source_family_id === 'string' && source.source_family_id.length > 0, `${source.evidence_ref}: source_family_id required`);
  expect(typeof source.publisher === 'string' && source.publisher === source.publisher.trim() && normalizedPublisher(source.publisher).length > 0, `${source.evidence_ref}: publisher required`);
  const urlIdentity = officialUrlIdentity(source.official_url);
  expect(Boolean(urlIdentity), `${source.evidence_ref}: valid official HTTPS URL required`);
  expect(typeof source.region === 'string' && source.region.length > 0, `${source.evidence_ref}: region required`);
  expect(officialRoles.has(source.role), `${source.evidence_ref}: official role invalid`);
  expect(Array.isArray(source.scope_ids) && source.scope_ids.length === 1, `${source.evidence_ref}: exactly one Scope required`);
  expect(typeof source.narrow_claim === 'string' && source.narrow_claim.length > 30, `${source.evidence_ref}: narrow claim required`);
  expect(source.verification_state === EXPECTED_SOURCE_VERIFICATION_STATE, `${source.evidence_ref}: source verification must remain reproducible-capture-pending`);
  expect(source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE', `${source.evidence_ref}: rights boundary invalid`);
  expect(isIsoDate(source.accessed_on), `${source.evidence_ref}: accessed_on must be an ISO calendar date`);
  expect(source.accessed_on === expectedAccessedOn, `${source.evidence_ref}: accessed_on must match ${origin} observed_on`);

  if (urlIdentity) {
    sourceIdentities.set(source.evidence_ref, {
      url: urlIdentity.key,
      host: urlIdentity.host,
      publisher: normalizedPublisher(source.publisher),
      family: normalizedIdentifier(source.source_family_id)
    });
  }
}

for (const source of baseSources) validateOfficialSource(source, 'base', base.observed_on);
for (const source of addedSources) validateOfficialSource(source, 'supplement', supplement.observed_on);

const normalizedUrls = allSources
  .map(source => sourceIdentities.get(source.evidence_ref)?.url)
  .filter(Boolean);
const normalizedFamilies = allSources.map(source => normalizedIdentifier(source.source_family_id)).filter(Boolean);
expect(normalizedUrls.length === allSources.length && new Set(normalizedUrls).size === allSources.length, 'official source URLs must be valid and unique across base and supplement');
expect(normalizedFamilies.length === allSources.length && new Set(normalizedFamilies).size === allSources.length, 'source_family_id values must be non-empty and unique across base and supplement');

const canonicalScopes = (base.scope_rows || []).map(row => row.scope_id);
const pairRows = Array.isArray(supplement.official_source_pair_map)
  ? supplement.official_source_pair_map
  : [];
expect(canonicalScopes.length === 32, 'base must expose exactly 32 canonical Scopes');
expect(new Set(canonicalScopes).size === 32, 'base canonical Scope IDs must be unique');
expect(pairRows.length === 32, 'supplement must expose exactly 32 official source pairs');
expect(new Set(pairRows.map(row => row.scope_id)).size === 32, 'official source pair Scope IDs must be unique');
expect(canonicalScopes.every(scope => pairRows.some(row => row.scope_id === scope)), 'every canonical Scope requires an official source pair');
expect(pairRows.every(row => canonicalScopes.includes(row.scope_id)), 'official source pair map contains an unknown Scope');

const allowedBaseTerminalStates = new Set([
  'REGIONAL_CONTEXT_SOURCE_PAIR_RECORDED_CANDIDATE',
  'PARTIAL_REGIONAL_EVIDENCE',
  'BLOCKED_BY_REGIONAL_INDEPENDENCE',
  'NOT_VERIFIED'
]);
const allowedBaseMappingStates = new Set([
  'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED',
  'CANDIDATE_MAPPING_REJECTED_OR_UNVERIFIED',
  'EXPLICIT_NA'
]);
const baseRowsByScope = new Map((base.scope_rows || []).map(row => [row.scope_id, row]));
for (const row of base.scope_rows || []) {
  expect(allowedBaseTerminalStates.has(row.state), `${row.scope_id}: base terminal state must remain candidate or fail-closed`);
  expect(allowedBaseMappingStates.has(row.public_representation_state), `${row.scope_id}: base mapping state must remain candidate or fail-closed`);
}

function validatePair(row) {
  expect(Array.isArray(row.evidence_refs) && row.evidence_refs.length === 2, `${row.scope_id}: exactly two official refs required`);
  expect(new Set(row.evidence_refs || []).size === 2, `${row.scope_id}: official pair refs must be distinct`);
  const sources = (row.evidence_refs || []).map(ref => byRef.get(ref));
  expect(sources.every(Boolean), `${row.scope_id}: pair contains unknown evidence ref`);
  if (!sources.every(Boolean)) return;
  expect(sources.every(source => source.scope_ids.includes(row.scope_id)), `${row.scope_id}: evidence grain does not match Scope`);
  expect(sources.every(source => officialRoles.has(source.role)), `${row.scope_id}: pair must contain official roles only`);
  expect(sources.every(source => source.verification_state === EXPECTED_SOURCE_VERIFICATION_STATE), `${row.scope_id}: pair source verification must remain reproducible-capture-pending`);
  expect(sources.every(source => source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE'), `${row.scope_id}: rights boundary must remain reference-only`);

  const identities = (row.evidence_refs || []).map(ref => sourceIdentities.get(ref));
  expect(identities.every(Boolean), `${row.scope_id}: pair source identity is incomplete`);
  if (identities.every(Boolean)) {
    expect(new Set(identities.map(identity => identity.url)).size === 2, `${row.scope_id}: official URLs are not independent`);
    expect(new Set(identities.map(identity => identity.host)).size === 2, `${row.scope_id}: source hosts are not independent`);
    expect(new Set(identities.map(identity => identity.publisher)).size === 2, `${row.scope_id}: publishers are not independent`);
    expect(new Set(identities.map(identity => identity.family)).size === 2, `${row.scope_id}: source families are not independent`);
  }

  const baseRow = baseRowsByScope.get(row.scope_id);
  const baseCount = (row.evidence_refs || []).filter(ref => baseRefs.has(ref)).length;
  const supplementCount = (row.evidence_refs || []).filter(ref => addedRefs.has(ref)).length;
  if (baseRow?.public_representation_state !== 'CANDIDATE_MAPPING_NOT_IDENTITY_VERIFIED') {
    expect(baseCount === 2 && supplementCount === 0, `${row.scope_id}: no usable public mapping must atomically bind two base official sources`);
  } else {
    expect(baseCount === 1 && supplementCount === 1, `${row.scope_id}: pair must atomically bind one base and one supplemental source`);
  }
}

for (const row of pairRows) validatePair(row);

const pairedRefs = pairRows.flatMap(row => Array.isArray(row.evidence_refs) ? row.evidence_refs : []);
expect(pairedRefs.length === allSources.length, 'atomic pair map must consume every base and supplemental source exactly once');
expect(new Set(pairedRefs).size === pairedRefs.length, 'a source cannot be reused across atomic Scope pairs');
expect(refs.every(ref => pairedRefs.includes(ref)), 'atomic pair map contains orphaned base or supplemental sources');

const negativeControls = [
  {
    name: 'DUPLICATE_FAMILY_COLLAPSES',
    run: () => {
      const row = { scope_id: 'designer_toys', evidence_refs: ['RIE-001', 'RIE-001'] };
      const sources = row.evidence_refs.map(ref => byRef.get(ref));
      return new Set(sources.map(source => source.source_family_id)).size !== 2;
    }
  },
  {
    name: 'UNKNOWN_REF_REJECTED',
    run: () => !byRef.has('RIE-999')
  },
  {
    name: 'CROSS_SCOPE_REF_REJECTED',
    run: () => !byRef.get('RIE-101').scope_ids.includes('mechanical_watches')
  },
  {
    name: 'REFERENCE_ONLY_NOT_COMMERCIAL_RIGHTS',
    run: () => allSources.every(source => source.rights_state !== 'COMMERCIAL_REUSE_AUTHORIZED')
  }
];

for (const control of negativeControls) {
  expect(control.run(), `negative control failed: ${control.name}`);
}

if (failures.length) {
  console.error('Regional independent official-source supplement: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  scopes: pairRows.length,
  base_sources: baseSources.length,
  supplemental_sources: addedSources.length,
  combined_official_sources: allSources.length,
  official_sources_per_scope: 2,
  negative_controls: negativeControls.length,
  track_b_input_eligible: supplement.track_b_input_eligible,
  production: supplement.production
}, null, 2));
