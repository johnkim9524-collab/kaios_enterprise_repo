import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = process.cwd();
const schemaPath = path.join(root, 'coordination/kidults/schemas/market-event-v1.schema.json');
const fixtureDir = path.join(root, 'coordination/kidults/poc/fixtures/market-event-v1');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
// Conditional subschemas intentionally require properties declared at the root.
const ajv = new Ajv2020({allErrors: true, strict: true, strictTypes: false, strictRequired: false});
addFormats(ajv);
const validate = ajv.compile(schema);

function admissionErrors(event) {
  const errors = [];
  for (const action of ['collect', 'store', 'transform']) {
    if (event.rights?.[action] !== 'ALLOW') errors.push(`RIGHTS_${action.toUpperCase()}_NOT_ALLOWED`);
  }
  if (!event.rights?.terms_url || !event.rights?.terms_version || !event.rights?.review_due_at) errors.push('RIGHTS_TERMS_METADATA_INCOMPLETE');
  if (event.rights?.field_bindings?.some((binding) => binding.admission_state !== 'ALLOW')) errors.push('FIELD_RIGHTS_NOT_ALLOWED');
  if (event.freshness?.state !== 'CURRENT') errors.push('FRESHNESS_NOT_CURRENT');
  if (event.missingness?.coverage_numerator > event.missingness?.coverage_denominator) errors.push('COVERAGE_NUMERATOR_EXCEEDS_DENOMINATOR');
  if (event.evidence_class === 'TIME_TO_SALE' && event.listing_start?.physical_object_id !== event.physical_object_id) errors.push('TIME_TO_SALE_CROSS_OBJECT');
  return errors;
}

const files = fs.readdirSync(fixtureDir).filter((name) => name.endsWith('.json')).sort();
if (!files.length) throw new Error('No market-event fixtures found');

const failures = [];
for (const file of files) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8'));
  const valid = validate(fixture.event);
  if (valid !== fixture.expected_valid) {
    failures.push(`${file}: expected_valid=${fixture.expected_valid}, actual=${valid}, errors=${ajv.errorsText(validate.errors)}`);
  }
}

const base = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'valid-active-listing.json'), 'utf8')).event;
const clone = () => structuredClone(base);
const admissionCases = [
  ['valid-internal-event', clone(), true],
  ['rights-unknown', Object.assign(clone(), {rights: {...clone().rights, collect: 'UNKNOWN'}}), false],
  ['field-rights-denied', Object.assign(clone(), {rights: {...clone().rights, field_bindings: [{field_path: '/price', output_class: 'INTERNAL_ANALYSIS', admission_state: 'DENY'}]}}), false],
  ['stale-event', Object.assign(clone(), {freshness: {...clone().freshness, state: 'STALE', stale_reason: 'TTL_EXCEEDED'}}), false],
  ['coverage-overflow', Object.assign(clone(), {missingness: {...clone().missingness, coverage_numerator: 2, coverage_denominator: 1}}), false]
];
for (const [name, event, expected] of admissionCases) {
  const admitted = validate(event) && admissionErrors(event).length === 0;
  if (admitted !== expected) failures.push(`${name}: expected admission=${expected}, actual=${admitted}`);
}

const schemaCases = [
  ['listing-cannot-be-sold', Object.assign(clone(), {event_state: 'SOLD'}), false],
  ['bid-ask-cannot-be-sold', Object.assign(clone(), {evidence_class: 'BID_ASK_SIGNAL', event_state: 'SOLD'}), false],
  ['current-requires-source-update', Object.assign(clone(), {source_updated_at: null}), false],
  ['accepted-offer-must-be-disclosed', Object.assign(clone(), {
    evidence_class: 'VERIFIED_SOLD_EVENT', event_state: 'SOLD',
    price: {...clone().price, price_type: 'ACCEPTED_OFFER', accepted_offer_disclosure: 'UNDISCLOSED'}
  }), false]
];
for (const [name, event, expected] of schemaCases) {
  const valid = validate(event);
  if (valid !== expected) failures.push(`${name}: expected schema validity=${expected}, actual=${valid}`);
}

if (failures.length) {
  console.error(`Market Event JSON Schema 2020-12: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  validation_mode: 'AJV_JSON_SCHEMA_2020_12_COMPILED_INSTANCE_VALIDATION',
  schema: path.relative(root, schemaPath),
  fixtures: files.length,
  positive: files.filter((f) => f.startsWith('valid-')).length,
  negative: files.filter((f) => f.startsWith('invalid-')).length
  ,admission_cases: admissionCases.length
  ,generated_schema_cases: schemaCases.length
}, null, 2));
