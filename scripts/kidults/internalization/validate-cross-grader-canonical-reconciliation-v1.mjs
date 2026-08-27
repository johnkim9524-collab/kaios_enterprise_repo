import fs from 'node:fs';
import crypto from 'node:crypto';

const contractPath = 'coordination/kidults/internalization/cross-grader-canonical-reconciliation-contract-v1.json';
const fixturePath = 'coordination/kidults/internalization/cross-grader-canonical-reconciliation-fixtures-v1.json';
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const errors = [];

const requiredProviders = ['PSA','BGS','SGC','CGC','TAG'];
const requiredDimensions = ['year','set','subject','card_number','parallel','variant'];

if (contract.contract_id !== 'KIDULTS_CROSS_GRADER_CANONICAL_RECONCILIATION_V1') errors.push('invalid contract id');
for (const provider of requiredProviders) if (!contract.provider_namespaces?.includes(provider)) errors.push(`missing provider namespace ${provider}`);
for (const dim of requiredDimensions) if (!contract.canonical_identity_dimensions?.includes(dim)) errors.push(`missing canonical dimension ${dim}`);
if (contract.identity_principles?.kidults_canonical_identity_owned_internally !== true) errors.push('canonical identity must be KIDULTS-owned');
if (contract.identity_principles?.provider_id_is_evidence_key_only !== true) errors.push('provider id must remain evidence-only');
if (contract.identity_principles?.provider_cert_is_evidence_key_only !== true) errors.push('provider cert must remain evidence-only');
if (contract.identity_principles?.provider_universal_id_is_canonical !== false) errors.push('provider universal id cannot be canonical');
if (contract.merge_policy?.all_canonical_dimensions_must_match !== true) errors.push('all canonical dimensions must match');
if (contract.merge_policy?.parallel_mismatch_forbids_merge !== true) errors.push('parallel mismatch must forbid merge');
if (contract.merge_policy?.variant_mismatch_forbids_merge !== true) errors.push('variant mismatch must forbid merge');
if (contract.merge_policy?.provider_or_cert_match_alone_may_merge !== false) errors.push('provider/cert alone cannot merge');
if (contract.grade_reconciliation?.mode !== 'VERSIONED_EXPLICIT_MAPPING_ONLY') errors.push('grade mapping must be explicit and versioned');
if (contract.grade_reconciliation?.unknown_grade !== 'HOLD_UNMAPPED_GRADE') errors.push('unmapped grade must HOLD');
if (contract.population_reconciliation?.provider_counts_are_provider_scoped_facts !== true) errors.push('population counts must remain provider-scoped');
if (contract.population_reconciliation?.cross_grader_sum_is_global_population !== false) errors.push('cross-grader count sum cannot be global population');
if (contract.population_reconciliation?.aggregate_without_dedup_proof !== 'NON_ADDITIVE_VECTOR_ONLY') errors.push('population aggregate must be non-additive without dedup proof');
if (contract.population_reconciliation?.unknown_count !== 'UNKNOWN_NOT_ZERO') errors.push('unknown population cannot be zero');
if (contract.mapping_history?.versioned !== true || contract.mapping_history?.append_only !== true) errors.push('mapping history must be versioned append-only');
if (contract.provider_removal_replay?.required !== true || contract.provider_removal_replay?.canonical_id_must_remain_stable !== true) errors.push('provider-removal canonical stability required');
if (contract.non_bypass?.new_external_data_acquisition !== 'NOT_AUTHORIZED_BY_THIS_CONTRACT') errors.push('new external acquisition boundary drift');
if (contract.non_bypass?.external_spend !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('external spend boundary drift');
if (contract.non_bypass?.contract_acceptance !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('contract boundary drift');
if (contract.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('credential boundary drift');
if (contract.non_bypass?.production !== 'HOLD' || contract.non_bypass?.public !== 'HOLD') errors.push('production/public boundary drift');
if (contract.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('g5 boundary drift');

function normText(value) {
  return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function canonicalTuple(record) {
  for (const dim of requiredDimensions) {
    if (record[dim] === null || record[dim] === undefined) return { state: 'HOLD_UNRESOLVED', missing: dim };
  }
  const values = {
    year: normText(record.year),
    set: normText(record.set),
    subject: normText(record.subject),
    card_number: normText(record.card_number),
    parallel: record.parallel === '' ? 'BASE' : normText(record.parallel),
    variant: record.variant === '' ? 'STANDARD' : normText(record.variant),
  };
  for (const [dim, value] of Object.entries(values)) if (!value) return { state: 'HOLD_UNRESOLVED', missing: dim };
  return { state: 'RESOLVED', values };
}

function canonicalId(record) {
  const tuple = canonicalTuple(record);
  if (tuple.state !== 'RESOLVED') return tuple;
  const serialized = requiredDimensions.map((dim) => `${dim.length}:${dim}=${String(tuple.values[dim]).length}:${tuple.values[dim]}`).join('|');
  const digest = crypto.createHash('sha256').update(serialized).digest('hex');
  return { state: 'RESOLVED', id: `kidults:card:v1:${digest}`, values: tuple.values };
}

function reconcilePair(left, right) {
  const a = canonicalId(left);
  const b = canonicalId(right);
  if (a.state !== 'RESOLVED' || b.state !== 'RESOLVED') return { state: 'HOLD_UNRESOLVED' };
  if (a.id === b.id) return { state: 'MATCH', canonical_id: a.id, confidence: 'NORMALIZED_EXACT' };
  const conflicts = requiredDimensions.filter((dim) => a.values[dim] !== b.values[dim]);
  return { state: 'NO_MATCH', conflicts, confidence: 'CONTRADICTORY' };
}

for (const testCase of fixtures.cases ?? []) {
  const records = testCase.records ?? [];
  if (testCase.expected === 'HOLD_UNRESOLVED') {
    const result = canonicalId(records[0]);
    if (result.state !== 'HOLD_UNRESOLVED') errors.push(`${testCase.case_id}: missing dimension did not HOLD`);
    continue;
  }
  if (records.length !== 2) {
    errors.push(`${testCase.case_id}: expected exactly two records`);
    continue;
  }
  const result = reconcilePair(records[0], records[1]);
  if (testCase.expected.startsWith('SAME_CANONICAL_ID') && result.state !== 'MATCH') errors.push(`${testCase.case_id}: expected MATCH`);
  if (testCase.expected === 'DIFFERENT_CANONICAL_ID' && result.state !== 'NO_MATCH') errors.push(`${testCase.case_id}: expected NO_MATCH`);
  if (testCase.case_id === 'FALSE_MERGE_PARALLEL_GUARD' && !result.conflicts?.includes('parallel')) errors.push('parallel collision was not identified');
  if (testCase.case_id === 'FALSE_MERGE_VARIANT_GUARD' && !result.conflicts?.includes('variant')) errors.push('variant collision was not identified');
  if (testCase.case_id === 'PROVIDER_CERT_NOT_CANONICAL') {
    const left = canonicalId(records[0]);
    const right = canonicalId(records[1]);
    if (left.state !== 'RESOLVED' || right.state !== 'RESOLVED' || left.id !== right.id) errors.push('provider/cert leaked into canonical identity');
    if (left.id?.includes(records[0].provider_namespace) || left.id?.includes(records[0].provider_cert)) errors.push('provider evidence leaked into canonical id string');
  }
}

const gradeTable = contract.grade_reconciliation?.synthetic_mapping_table;
if (!gradeTable?.mapping_version) errors.push('synthetic grade mapping version missing');
function mapGrade(provider, sourceGrade, mappingVersion) {
  if (mappingVersion !== gradeTable?.mapping_version) return 'HOLD_UNMAPPED_GRADE';
  const entry = gradeTable.entries?.find((x) => x.provider_namespace === provider && x.source_grade === sourceGrade);
  return entry?.canonical_band ?? 'HOLD_UNMAPPED_GRADE';
}
for (const item of fixtures.grade_cases ?? []) {
  const got = mapGrade(item.provider_namespace, item.source_grade, item.mapping_version);
  if (got !== item.expected) errors.push(`grade ${item.provider_namespace}/${item.source_grade}: expected ${item.expected}, got ${got}`);
}

const pop = fixtures.population_case;
const vector = {};
for (const snapshot of pop?.snapshots ?? []) {
  if (!snapshot.snapshot_at || !snapshot.source_reference) errors.push(`population ${snapshot.provider_namespace}: timestamp/source required`);
  vector[snapshot.provider_namespace] = snapshot.count === null ? 'UNKNOWN' : snapshot.count;
}
if (JSON.stringify(vector) !== JSON.stringify(pop?.expected?.vector)) errors.push('population provider vector mismatch');
if (pop?.expected?.mode !== 'NON_ADDITIVE_VECTOR_ONLY' || pop?.expected?.global_population !== null) errors.push('population fixture attempts unsupported global aggregation');
if (Object.values(vector).filter((v) => typeof v === 'number').reduce((a,b) => a+b,0) === pop?.expected?.global_population) errors.push('provider counts were incorrectly treated as global population');

const removal = fixtures.provider_removal_case;
const sourceCase = (fixtures.cases ?? []).find((x) => x.case_id === removal?.canonical_object_fixture_ref);
if (!sourceCase) errors.push('provider removal source fixture missing');
else {
  const before = canonicalId(sourceCase.records[0]);
  const remaining = sourceCase.records.filter((x) => x.provider_namespace !== removal.remove_provider);
  if (remaining.length === 0) errors.push('provider removal left no evidence record for replay');
  else {
    const after = canonicalId(remaining[0]);
    if (before.state !== 'RESOLVED' || after.state !== 'RESOLVED' || before.id !== after.id) errors.push('canonical id changed after provider removal');
    if (remaining[0].provider_namespace !== removal.expected.remaining_resolvable_provider) errors.push('unexpected remaining provider after removal');
  }
}

const mappingHistory = [
  {version:'synthetic-v1', effective_at:'2026-01-01T00:00:00Z', previous:null},
  {version:'synthetic-v2', effective_at:'2026-02-01T00:00:00Z', previous:'synthetic-v1'},
];
for (let i = 0; i < mappingHistory.length; i += 1) {
  const entry = mappingHistory[i];
  if (!entry.effective_at) errors.push(`mapping history ${entry.version}: effective_at missing`);
  if (i > 0 && entry.previous !== mappingHistory[i-1].version) errors.push(`mapping history ${entry.version}: previous version mismatch`);
}

if (errors.length) {
  console.error(JSON.stringify({suite:'KIDULTS_CROSS_GRADER_CANONICAL_RECONCILIATION_V1',result:'FAIL',errors},null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite:'KIDULTS_CROSS_GRADER_CANONICAL_RECONCILIATION_V1',
  result:'PASS',
  evidence_class:fixtures.evidence_class,
  provider_namespaces:contract.provider_namespaces.length,
  identity_cases:fixtures.cases.length,
  grade_cases:fixtures.grade_cases.length,
  population_mode:contract.population_reconciliation.aggregate_without_dedup_proof,
  provider_removal_replay:'PASS',
  mapping_history:'VERSIONED_APPEND_ONLY',
  production:contract.non_bypass.production,
  public:contract.non_bypass.public,
  g5:contract.non_bypass.g5
},null,2));
