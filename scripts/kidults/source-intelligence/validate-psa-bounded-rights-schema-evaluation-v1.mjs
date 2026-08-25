import fs from 'node:fs/promises';

const [contractPath, outputPath = '/tmp/psa-bounded-evaluation-preflight-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node validate-psa-bounded-rights-schema-evaluation-v1.mjs <contract.json> [output.json]');
const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));

if (contract.production !== 'HOLD' || contract.publication !== 'HOLD') throw new Error('FAIL_CLOSED_BOUNDARY_REQUIRED');
if (contract.founder_approval?.issue !== 742 || contract.founder_approval?.status !== 'APPROVED' || contract.founder_approval?.decision !== 'APPROVE_BOUNDED_PSA_API_RIGHTS_SCHEMA_EVALUATION') {
  throw new Error('FOUNDER_APPROVAL_742_BINDING_REQUIRED');
}
if (contract.program_owner_authorization?.membership !== 'VERIFIED_PASS' || contract.program_owner_authorization?.bounded_private_evaluation !== 'APPROVED') {
  throw new Error('PROGRAM_OWNER_PSA_AUTHORIZATION_REQUIRED');
}
if (contract.provider_id !== 'psa-public-api' || contract.documented_transport?.endpoint_class !== 'CERT_VERIFICATION_SINGLE_ITEM_BY_CERT_NUMBER') {
  throw new Error('PSA_DOCUMENTED_SINGLE_CERT_TRANSPORT_REQUIRED');
}
for (const guard of ['120_CASE_ACQUISITION_BEFORE_PROVISIONING_SCHEMA_AND_ADAPTER_GATES', 'BULK_ENUMERATION', 'HTML_SCRAPING', 'HIDDEN_ENDPOINT_DISCOVERY', 'TOKEN_LOGGING', 'RAW_PROVIDER_PAYLOAD_ARTIFACT', 'PRODUCTION_USE']) {
  if (!(contract.prohibited || []).includes(guard)) throw new Error(`PROHIBITED_GUARD_MISSING:${guard}`);
}
if (contract.field_purpose_rights?.display_public !== 'BLOCK' || contract.field_purpose_rights?.redistribute !== 'BLOCK') throw new Error('PUBLIC_RIGHTS_BLOCK_REQUIRED');
if (contract.reviewer_material_increment !== 0) throw new Error('NO_REVIEWER_MATERIAL_PROMOTION_ALLOWED');

const provisioningConfirmed = process.env.KAIOS_PSA_PROVISIONING_CONFIRMED === '1';
const accountAuthorized = process.env.KAIOS_PSA_ACCOUNT_AUTHORIZED === '1';
const eulaCompatible = process.env.KAIOS_PSA_EULA_COMPATIBLE === '1';
const tokenPresent = Boolean(process.env.KAIOS_PSA_API_TOKEN);
const certs = String(process.env.KAIOS_PSA_PROBE_CERTS || '').split(',').map(value => value.trim()).filter(Boolean);
const certsValid = certs.length >= 1 && certs.length <= contract.max_schema_probe_calls && certs.every(value => /^\d{5,12}$/.test(value));

const blockers = [];
if (!provisioningConfirmed) blockers.push('PSA_PROVIDER_PROVISIONING_CONFIRMATION_REQUIRED');
if (!accountAuthorized) blockers.push('AUTHORIZED_PSA_ACCOUNT_HANDOFF_REQUIRED');
if (!eulaCompatible) blockers.push('PSA_API_EULA_COMPATIBILITY_TERMINALIZATION_REQUIRED');
if (!tokenPresent) blockers.push('PSA_TOKEN_SECRET_HANDOFF_REQUIRED');
if (!certsValid) blockers.push('ONE_TO_THREE_VALID_PSA_CERT_NUMBERS_REQUIRED');

const state = blockers.length === 0 ? 'PSA_SINGLE_CERT_SCHEMA_PROBE_PERMITTED_BY_PREFLIGHT' : 'BLOCKED';
const output = {
  id: 'psa-bounded-evaluation-preflight-v1',
  founder_approval_issue: 742,
  founder_approval_satisfied: true,
  program_owner_authorization_satisfied: true,
  provider_id: contract.provider_id,
  state,
  blockers,
  requested_probe_count: certs.length,
  max_probe_count: contract.max_schema_probe_calls,
  secret_material_observed: false,
  reviewer_material_increment: 0,
  field_purpose_rights_state: 'BOUNDED_PRIVATE_EVALUATION_RECORDED_PROVIDER_PROVISIONING_REQUIRED',
  production: 'HOLD',
  publication: 'HOLD',
  truth_boundary: state === 'BLOCKED'
    ? 'Paid membership and bounded internal-use policy do not establish API provisioning. No PSA network call or reviewer-material promotion is permitted until every listed handoff is explicit.'
    : 'Preflight permits only one-to-three documented PSA single-cert DEV/SHADOW schema calls through the protected environment. Raw provider values must not be logged or uploaded; 120-case acquisition remains separately blocked behind schema, adapter, quota, retention and adjudication gates.'
};
await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (process.env.KAIOS_REQUIRE_PSA_PROBE_ALLOWED === '1' && state !== 'PSA_SINGLE_CERT_SCHEMA_PROBE_PERMITTED_BY_PREFLIGHT') process.exit(3);
