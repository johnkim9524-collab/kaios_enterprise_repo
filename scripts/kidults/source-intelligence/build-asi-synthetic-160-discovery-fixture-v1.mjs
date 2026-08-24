#!/usr/bin/env node
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/asi-synthetic-160-discovery.json';
const candidates = Array.from({ length: 160 }, (_, i) => ({
  candidate_id: `synthetic-candidate-${String(i + 1).padStart(3, '0')}`,
  endpoint_url: `https://fixture.invalid/source/${i + 1}`,
  source_name: `Synthetic Global Source ${i + 1}`,
  discovery_provider: 'SYNTHETIC_NON_PROMOTABLE_FIXTURE',
  discovery_providers: ['SYNTHETIC_NON_PROMOTABLE_FIXTURE'],
  observed_at: '2026-08-24T07:00:00Z',
  provider_record_id: `fixture-record-${i + 1}`,
  candidate_source_roles: i % 3 === 0 ? ['SOLD_TRANSACTION'] : ['CATALOG_REFERENCE'],
  candidate_purpose_intents: i % 3 === 0 ? ['CURRENT_SOLD_TRANSACTION'] : ['IDENTITY_CATALOG'],
  demand_instance_ids: [`synthetic-demand-${i + 1}`],
  representative_product_ids: [`synthetic-product-${i + 1}`],
  target_regions: ['GLOBAL'],
  target_languages: ['en'],
  fixture_classification: 'SYNTHETIC_NON_PROMOTABLE',
  rights_state: 'UNASSESSED',
  admission_state: 'NOT_ADMITTED',
  production: 'HOLD',
  acquisition_authorized: false,
  content_acquired: false
}));
const value = {
  id: 'kidults-asi-global-low-risk-discovery-v1',
  version: 'synthetic-1.0.0',
  status: 'SYNTHETIC_NON_PROMOTABLE_DISCOVERY_FIXTURE',
  primary_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  candidate_count: candidates.length,
  candidates,
  demand_rows: candidates.length,
  production: 'HOLD',
  public_release: 'HOLD',
  acquisition_authorized: false,
  content_acquired: false,
  fixture_classification: 'SYNTHETIC_NON_PROMOTABLE'
};
fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', fixture_classification: value.fixture_classification, candidates: candidates.length, production: value.production }));
