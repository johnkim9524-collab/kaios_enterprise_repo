import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const sortedUnique = values => [...new Set(values)].sort();
const sameSet = (left, right) => JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));

const paths = [
  'coordination/kidults/governance/release-assurance-contract-v1.json',
  'coordination/kidults/governance/field-level-rights-release-manifest-v1.json',
  'coordination/kidults/governance/privacy-retention-minimization-contract-v1.json',
  'coordination/kidults/governance/portal-accessibility-assurance-v1.json',
  'coordination/kidults/governance/secure-sdlc-supply-chain-contract-v1.json',
  'coordination/kidults/runtime/observability-slo-contract-v1.json',
  'coordination/kidults/governance/public-claim-evidence-manifest-v1.json'
];
const docs = paths.map(path => [path, read(path)]);
const providerInventory = read('coordination/kidults/registry/provider/records/provider-operating-state-v1.json');
const providerRequirements = read('coordination/kidults/registry/provider/records/provider-requirements-v1.json');

function validateRights(rights) {
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const providers = providerInventory.providers ?? [];
  const classifications = rights.provider_field_classifications ?? [];
  const requiredFields = sortedUnique((providerRequirements.required_capabilities ?? []).flatMap(item => item.minimum_fields ?? []));
  const catalogFields = sortedUnique((rights.field_catalog ?? []).flatMap(item => item.fields ?? []));
  const expectedProviderIds = providers.map(item => item.provider_id);
  const classifiedProviderIds = classifications.map(item => item.provider_id);
  const defaults = rights.provider_field_classification_defaults ?? {};

  assert(rights.status === 'COMPLETE_PROVIDER_FIELD_INVENTORY_NO_LIVE_FIELDS_AUTHORIZED', 'rights inventory status mismatch');
  assert(rights.default_disposition === 'HOLD', 'rights default must be HOLD');
  assert(rights.purposes?.includes('display_public'), 'rights purposes must include display_public');
  assert(sameSet(catalogFields, requiredFields), 'field catalog does not exactly cover provider requirements');
  assert(defaults.expansion === 'EACH_PROVIDER_ID_X_EACH_UNIQUE_FIELD_IN_FIELD_CATALOG', 'provider-field expansion rule missing');
  assert(defaults.source_family === 'PROVIDER_ID', 'provider-field source family rule missing');
  assert(typeof defaults.provenance_reference_template === 'string' && defaults.provenance_reference_template.includes('PROVIDER_ID'), 'provider-field provenance template missing');
  assert(sameSet(Object.keys(defaults.rights_state_by_purpose ?? {}), rights.purposes ?? []), 'provider-field purpose classification incomplete');
  assert(Object.values(defaults.rights_state_by_purpose ?? {}).every(state => state === 'HOLD'), 'provider-field purpose classification must fail closed');
  assert(defaults.freshness_state === 'NOT_ADMITTED' && defaults.public_release_disposition === 'BLOCKED', 'provider-field default disposition weakened');
  assert(sameSet(classifiedProviderIds, expectedProviderIds), 'provider field classifications do not exactly cover provider inventory');
  assert(classifiedProviderIds.length === new Set(classifiedProviderIds).size, 'duplicate provider field classification');
  for (const classification of classifications) {
    const provider = providers.find(item => item.provider_id === classification.provider_id);
    assert(classification.field_scope === 'ALL_PLATFORM_REQUIRED_FIELDS', `${classification.provider_id}: incomplete field scope`);
    assert(classification.rights_state === provider?.rights_state, `${classification.provider_id}: rights state drift`);
    assert(classification.release_status === 'BLOCKED', `${classification.provider_id}: release must remain blocked`);
    assert(typeof classification.retention_rule === 'string' && classification.retention_rule.length > 0, `${classification.provider_id}: retention rule missing`);
    assert(typeof classification.derived_result_policy === 'string' && classification.derived_result_policy.length > 0, `${classification.provider_id}: derived-result policy missing`);
    assert(provider?.public_release === 'HOLD' && provider?.production === 'HOLD', `${classification.provider_id}: provider boundary is not HOLD`);
  }
  assert(Array.isArray(rights.live_authorized_fields) && rights.live_authorized_fields.length === 0, 'live fields require source-specific written rights evidence');
  const expectedMatrixCount = expectedProviderIds.length * requiredFields.length;
  assert(rights.summary?.provider_count === expectedProviderIds.length, 'provider summary count drift');
  assert(rights.summary?.unique_required_field_count === requiredFields.length, 'field summary count drift');
  assert(rights.summary?.provider_field_classification_count === expectedMatrixCount, 'provider-field matrix count drift');
  assert(rights.summary?.released_field_count === 0, 'released field count must be zero');
  assert(rights.summary?.prohibited_or_blocked_field_count === expectedMatrixCount, 'blocked field count drift');
  assert(rights.public_release === 'HOLD' && rights.production === 'HOLD' && rights.g5 === 'HOLD', 'rights release boundary weakened');
  return errors;
}

function validateClaims(manifest) {
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const claims = manifest.claims ?? [];
  const evidence = manifest.evidence ?? [];
  const claimIds = claims.map(item => item.claim_id);
  const evidenceIds = evidence.map(item => item.evidence_id);
  const references = claims.flatMap(item => item.evidence_refs ?? []);
  const missing = references.filter(id => !evidenceIds.includes(id));
  const orphan = evidenceIds.filter(id => !references.includes(id));

  assert(claimIds.length === new Set(claimIds).size, 'duplicate public claim id');
  assert(evidenceIds.length === new Set(evidenceIds).size, 'duplicate public evidence id');
  for (const claim of claims) {
    assert(Array.isArray(claim.evidence_refs) && claim.evidence_refs.length > 0, `${claim.claim_id}: authoritative evidence missing`);
    assert(claim.claim_strength <= claim.evidence_strength, `${claim.claim_id}: claim strength exceeds evidence`);
    assert(claim.release_status === 'RELEASED', `${claim.claim_id}: non-released claim present in public manifest`);
  }
  assert(missing.length === 0, `missing evidence references: ${missing.join(',')}`);
  assert(orphan.length === 0, `orphan evidence records: ${orphan.join(',')}`);
  assert(manifest.public_release === 'HOLD' && claims.length === 0, 'Public HOLD requires zero externally visible released claims');
  assert(manifest.summary?.claim_count === claims.length, 'claim summary count drift');
  assert(manifest.summary?.evidence_count === evidence.length, 'evidence summary count drift');
  assert(manifest.summary?.missing_evidence_count === missing.length, 'missing evidence summary drift');
  assert(manifest.summary?.orphan_evidence_count === orphan.length, 'orphan evidence summary drift');
  assert(manifest.summary?.released_claim_count === claims.length, 'released claim summary drift');
  assert(manifest.production === 'HOLD' && manifest.g5 === 'HOLD', 'claim release boundary weakened');
  return errors;
}

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
for (const [path, doc] of docs) {
  assert(doc.version === '1.0.0', `${path}: version mismatch`);
  assert(doc.production === 'HOLD', `${path}: Production must remain HOLD`);
}
const rights = docs[1][1], privacy = docs[2][1], accessibility = docs[3][1], security = docs[4][1], obs = docs[5][1], claims = docs[6][1];
errors.push(...validateRights(rights), ...validateClaims(claims));
assert(privacy.rules?.unclassified_personal_data_admission === false, 'Unclassified personal data must not be admitted.');
assert(accessibility.standard === 'WCAG_2_2' && accessibility.required_checks.length >= 8, 'WCAG 2.2 assurance scope incomplete.');
assert(security.framework_alignment.includes('NIST_SSDF') && security.required_release_evidence.length >= 6, 'Secure SDLC evidence scope incomplete.');
assert(obs.signals.join(',') === 'metrics,logs,traces' && obs.required_slis.length >= 10, 'Observability contract incomplete.');
assert(obs.slo_policy === 'NO_NUMERIC_SLO_UNTIL_BOUNDED_REAL_POC_BASELINE_MEASURED', 'SLO must not be fabricated before empirical baseline.');

const missingProvider = structuredClone(rights);
missingProvider.provider_field_classifications.pop();
assert(validateRights(missingProvider).some(message => message.includes('exactly cover')), 'negative test did not reject missing provider classification');
const staleRights = structuredClone(rights);
staleRights.provider_field_classifications[0].rights_state = 'ALLOW';
assert(validateRights(staleRights).some(message => message.includes('rights state drift')), 'negative test did not reject rights drift');
const unsupportedClaim = structuredClone(claims);
unsupportedClaim.claims.push({claim_id:'unsupported', evidence_refs:['missing'], claim_strength:1, evidence_strength:0, release_status:'RELEASED'});
assert(validateClaims(unsupportedClaim).some(message => message.includes('missing evidence')), 'negative test did not reject unsupported claim');
const orphanEvidence = structuredClone(claims);
orphanEvidence.evidence.push({evidence_id:'orphan'});
assert(validateClaims(orphanEvidence).some(message => message.includes('orphan evidence')), 'negative test did not reject orphan evidence');

if (errors.length) {
  console.error(`Release assurance foundation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('Release assurance foundation: PASS');
console.log(`Contracts: ${docs.length}`);
console.log(`Rights matrix: ${rights.summary.provider_count} providers x ${rights.summary.unique_required_field_count} fields = ${rights.summary.provider_field_classification_count} blocked classifications`);
console.log('Claims: 0 released, 0 missing evidence, 0 orphan evidence');
console.log('Negative tests: missing provider, rights drift, unsupported claim, orphan evidence rejected');
console.log('Security: NIST SSDF aligned foundation');
console.log('Accessibility: WCAG 2.2 evidence required');
console.log('Observability: metrics/logs/traces + empirical SLO baseline');
console.log('Production/Public/G5: HOLD');
