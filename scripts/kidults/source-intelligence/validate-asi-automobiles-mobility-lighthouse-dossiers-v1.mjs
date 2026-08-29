#!/usr/bin/env node
import fs from 'node:fs';

const path = 'coordination/kidults/source-intelligence/asi-automobiles-mobility-lighthouse-dossiers-v1.json';
const value = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const allowedSourceTypes = new Set(['MANUFACTURER_ARCHIVE', 'MANUFACTURER_MUSEUM', 'INSTITUTIONAL_ARCHIVE']);

assert(value.id === 'kidults-asi-automobiles-mobility-lighthouse-dossiers-v1', 'REGISTRY_ID');
assert(value.version === '1.0.0' && value.owner === 'ASI' && value.governance_owner === 'KPMO', 'REGISTRY_AUTHORITY');
assert(JSON.stringify(value.platform_principles) === JSON.stringify(principles), 'PLATFORM_PRINCIPLES');
assert(value.evidence_class === 'REFERENCE' && value.claim_ceiling === 'IDENTITY_AND_HISTORY_REFERENCE_ONLY', 'REFERENCE_CEILING');
assert(Array.isArray(value.dossiers) && value.dossiers.length >= 25 && value.dossiers.length <= 50, 'LIGHTHOUSE_COUNT');
const ids = new Set();
const urls = new Set();
const regions = new Set();
for (const dossier of value.dossiers) {
  assert(/^((auto)|(moto))-[a-z0-9-]+$/.test(dossier.canonical_object_id), `CANONICAL_ID:${dossier.canonical_object_id}`);
  assert(!ids.has(dossier.canonical_object_id), `DUPLICATE_ID:${dossier.canonical_object_id}`);
  ids.add(dossier.canonical_object_id);
  assert(typeof dossier.display_name === 'string' && dossier.display_name.length >= 3, `DISPLAY_NAME:${dossier.canonical_object_id}`);
  assert(typeof dossier.publisher === 'string' && dossier.publisher.length >= 3, `PUBLISHER:${dossier.canonical_object_id}`);
  assert(allowedSourceTypes.has(dossier.source_type), `SOURCE_TYPE:${dossier.canonical_object_id}`);
  assert(/^https:\/\//.test(dossier.official_source_url), `SOURCE_URL:${dossier.canonical_object_id}`);
  assert(!urls.has(dossier.official_source_url), `DUPLICATE_URL:${dossier.canonical_object_id}`);
  urls.add(dossier.official_source_url);
  regions.add(dossier.region);
}
assert(regions.size >= 3, 'GLOBAL_REGION_COVERAGE');
assert(value.common_state?.source_observation_state === 'LOCATOR_REGISTERED_NOT_FETCHED', 'FETCH_OVERCLAIM');
assert(value.common_state?.rights_state === 'PUBLIC_REFERENCE_LOCATOR_ONLY_REUSE_NOT_VERIFIED', 'RIGHTS_OVERCLAIM');
assert(value.common_state?.acquired_at === null && value.common_state?.content_digest === 'NOT_AVAILABLE_UNTIL_FETCH', 'PROVENANCE_OVERCLAIM');
for (const key of ['market_price', 'rarity', 'investment_return']) assert(value.common_state?.[key] === 'NOT_VERIFIED', `MARKET_OVERCLAIM:${key}`);
for (const key of ['locator_is_fetched_source', 'canonical_seed_is_verified_specification', 'reference_is_market_observation', 'reference_is_evidence', 'rights_are_granted', 'external_collection_authorized']) assert(value.truth_boundary?.[key] === false, `TRUTH_BOUNDARY:${key}`);
assert(value.truth_boundary?.public_release === 'HOLD' && value.truth_boundary?.production === 'HOLD', 'RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-automobiles-mobility-lighthouse-dossiers-validation-v1',
  state: 'VERIFIED_PASS',
  dossier_count: value.dossiers.length,
  official_or_institutional_locator_count: urls.size,
  global_region_count: regions.size,
  evidence_class: value.evidence_class,
  source_fetch_complete_count: 0,
  rights_verified_count: 0,
  market_evidence_count: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
