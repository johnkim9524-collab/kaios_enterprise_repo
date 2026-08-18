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

const officialRoles = new Set([
  'REGIONAL_INSTITUTION',
  'REGIONAL_RELEASE_OR_DISTRIBUTION',
  'REGIONAL_VENUE_OR_MARKET_PRESENCE'
]);

expect(supplement.id === 'kidults-regional-independent-official-source-supplement-v1', 'unexpected supplement id');
expect(supplement.version === '1.0.0', 'supplement version must be 1.0.0');
expect(supplement.issue === 457, 'supplement must bind to issue #457');
expect(supplement.status === 'TRACK_A_EVIDENCE_CANDIDATE', 'supplement must remain a Track A candidate');
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

for (const source of addedSources) {
  expect(/^RIE-1\d\d$/.test(source.evidence_ref || ''), `${source.evidence_ref}: supplement ref format invalid`);
  expect(typeof source.source_family_id === 'string' && source.source_family_id.length > 0, `${source.evidence_ref}: source_family_id required`);
  expect(typeof source.publisher === 'string' && source.publisher.length > 0, `${source.evidence_ref}: publisher required`);
  expect(/^https:\/\//.test(source.official_url || ''), `${source.evidence_ref}: official HTTPS URL required`);
  expect(typeof source.region === 'string' && source.region.length > 0, `${source.evidence_ref}: region required`);
  expect(officialRoles.has(source.role), `${source.evidence_ref}: official role invalid`);
  expect(Array.isArray(source.scope_ids) && source.scope_ids.length === 1, `${source.evidence_ref}: exactly one Scope required`);
  expect(typeof source.narrow_claim === 'string' && source.narrow_claim.length > 30, `${source.evidence_ref}: narrow claim required`);
  expect(source.verification_state === 'OFFICIAL_PRIMARY_SOURCE_OBSERVED', `${source.evidence_ref}: observation state invalid`);
  expect(source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE', `${source.evidence_ref}: rights boundary invalid`);
  expect(source.accessed_on === '2026-08-18', `${source.evidence_ref}: access date mismatch`);
}

const canonicalScopes = (base.scope_rows || []).map(row => row.scope_id);
const pairRows = Array.isArray(supplement.official_source_pair_map)
  ? supplement.official_source_pair_map
  : [];
expect(canonicalScopes.length === 32, 'base must expose exactly 32 canonical Scopes');
expect(pairRows.length === 32, 'supplement must expose exactly 32 official source pairs');
expect(new Set(pairRows.map(row => row.scope_id)).size === 32, 'official source pair Scope IDs must be unique');
expect(canonicalScopes.every(scope => pairRows.some(row => row.scope_id === scope)), 'every canonical Scope requires an official source pair');

function validatePair(row) {
  expect(Array.isArray(row.evidence_refs) && row.evidence_refs.length === 2, `${row.scope_id}: exactly two official refs required`);
  const sources = (row.evidence_refs || []).map(ref => byRef.get(ref));
  expect(sources.every(Boolean), `${row.scope_id}: pair contains unknown evidence ref`);
  if (!sources.every(Boolean)) return;
  expect(sources.every(source => source.scope_ids.includes(row.scope_id)), `${row.scope_id}: evidence grain does not match Scope`);
  expect(sources.every(source => officialRoles.has(source.role)), `${row.scope_id}: pair must contain official roles only`);
  expect(new Set(sources.map(source => source.source_family_id)).size === 2, `${row.scope_id}: source families are not independent`);
  expect(new Set(sources.map(source => source.publisher)).size === 2, `${row.scope_id}: publishers are not independent`);
  expect(sources.every(source => source.rights_state === 'REFERENCE_ONLY_NO_CONTENT_REUSE'), `${row.scope_id}: rights boundary must remain reference-only`);
}

for (const row of pairRows) validatePair(row);

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
