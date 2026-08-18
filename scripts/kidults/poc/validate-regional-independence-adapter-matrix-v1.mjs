import fs from 'node:fs';
import path from 'node:path';

const p = path.join(process.cwd(), 'coordination/kidults/poc/regional-independence-adapter-matrix-v1.json');
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
const failures = [];
const expect = (v, msg) => { if (!v) failures.push(msg); };

expect(m.issue === 457, 'issue must be #457');
expect(m.production === 'HOLD', 'Production must remain HOLD');
expect(m.status === 'DISCOVERY_REQUIRED', 'matrix must start fail-closed');
expect(m.admission_rule?.minimum_independent_families >= 2, 'minimum independent source families must be >=2');
expect(
  m.admission_rule?.required?.length === 1
    && m.admission_rule.required[0] === 'TWO_PUBLISHER_INDEPENDENT_OFFICIAL_REGIONAL_INSTITUTION_RELEASE_EVENT_OR_VENUE_REFERENCES',
  'candidate admission must require two publisher-independent official context references'
);
expect(
  m.admission_rule?.optional_non_admitted_context?.includes('REGIONAL_PUBLIC_REPRESENTATION_OR_EXPLICIT_NA'),
  'public representation must remain optional non-admitted context'
);
expect(Array.isArray(m.scope_rows) && m.scope_rows.length === 32, 'exactly 32 canonical scopes required');

const ids = m.scope_rows.map(x => x.scope_id);
expect(new Set(ids).size === 32, 'scope IDs must be unique');
expect(ids.includes('vintage_neo_vintage_watches'), 'corrected vintage/neo-vintage watch scope required');
expect(!ids.includes('vintage_digital_watches'), 'superseded vintage digital watches scope prohibited');

for (const row of m.scope_rows) {
  expect(row.state === 'NOT_VERIFIED', `${row.scope_id}: initial state must be NOT_VERIFIED`);
  expect(Array.isArray(row.evidence_refs) && row.evidence_refs.length === 0, `${row.scope_id}: no fabricated evidence refs allowed`);
}

const prohibited = new Set(m.admission_rule?.prohibited_inference || []);
for (const rule of [
  'MAKER_ORIGIN_TO_REGIONAL_DEMAND',
  'LANGUAGE_PRESENCE_TO_REGIONAL_DEMAND',
  'PUBLIC_REPRESENTATION_TO_REGIONAL_MARKET_SIGNIFICANCE',
  'SINGLE_LISTING_TO_REGIONAL_MARKET_PRESENCE'
]) expect(prohibited.has(rule), `missing prohibition: ${rule}`);

if (failures.length) {
  console.error('Regional Independence Adapter Matrix v1: FAIL');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Regional Independence Adapter Matrix v1: PASS');
