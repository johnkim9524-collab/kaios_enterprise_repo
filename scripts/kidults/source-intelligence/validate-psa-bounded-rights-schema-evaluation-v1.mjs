import fs from 'node:fs/promises';

const [contractPath, outputPath='/tmp/psa-bounded-evaluation-preflight-v1.json'] = process.argv.slice(2);
if (!contractPath) throw new Error('Usage: node validate-psa-bounded-rights-schema-evaluation-v1.mjs <contract.json> [output.json]');
const x = JSON.parse(await fs.readFile(contractPath, 'utf8'));

if (x.production !== 'HOLD' || x.publication !== 'HOLD') throw new Error('FAIL_CLOSED_BOUNDARY_REQUIRED');
if (x.founder_approval?.issue !== 742 || x.founder_approval?.status !== 'APPROVED' || x.founder_approval?.decision !== 'APPROVE_BOUNDED_PSA_API_RIGHTS_SCHEMA_EVALUATION') {
  throw new Error('FOUNDER_APPROVAL_742_BINDING_REQUIRED');
}
if (x.provider_id !== 'psa-public-api' || x.documented_transport?.endpoint_class !== 'CERT_VERIFICATION_SINGLE_ITEM_BY_CERT_NUMBER') {
  throw new Error('PSA_DOCUMENTED_SINGLE_CERT_TRANSPORT_REQUIRED');
}
for (const guard of ['120_CASE_ACQUISITION_BEFORE_RIGHTS_TERMINALIZATION','BULK_ENUMERATION','HTML_SCRAPING','HIDDEN_ENDPOINT_DISCOVERY','TOKEN_LOGGING','RAW_PROVIDER_PAYLOAD_ARTIFACT','PRODUCTION_USE']) {
  if (!(x.prohibited || []).includes(guard)) throw new Error(`PROHIBITED_GUARD_MISSING:${guard}`);
}
if (x.field_purpose_rights?.display_public !== 'BLOCK' || x.field_purpose_rights?.redistribute !== 'BLOCK') throw new Error('PUBLIC_RIGHTS_BLOCK_REQUIRED');
if (x.reviewer_material_increment !== 0) throw new Error('NO_REVIEWER_MATERIAL_PROMOTION_ALLOWED');

const accountAuthorized = process.env.KAIOS_PSA_ACCOUNT_AUTHORIZED === '1';
const eulaCompatible = process.env.KAIOS_PSA_EULA_COMPATIBLE === '1';
const tokenPresent = Boolean(process.env.KAIOS_PSA_API_TOKEN);
const certs = String(process.env.KAIOS_PSA_PROBE_CERTS || '')
  .split(',').map(v => v.trim()).filter(Boolean);
const certsValid = certs.length >= 1 && certs.length <= x.max_schema_probe_calls && certs.every(v => /^\d{5,12}$/.test(v));

const blockers = [];
if (!accountAuthorized) blockers.push('AUTHORIZED_PSA_ACCOUNT_HANDOFF_REQUIRED');
if (!eulaCompatible) blockers.push('PSA_API_EULA_COMPATIBILITY_TERMINALIZATION_REQUIRED');
if (!tokenPresent) blockers.push('PSA_TOKEN_SECRET_HANDOFF_REQUIRED');
if (!certsValid) blockers.push('ONE_TO_THREE_VALID_PSA_CERT_NUMBERS_REQUIRED');

const state = blockers.length === 0 ? 'PSA_SINGLE_CERT_SCHEMA_PROBE_PERMITTED_BY_PREFLIGHT' : 'BLOCKED';
const out = {
  id: 'psa-bounded-evaluation-preflight-v1',
  founder_approval_issue: 742,
  founder_approval_satisfied: true,
  provider_id: x.provider_id,
  state,
  blockers,
  requested_probe_count: certs.length,
  max_probe_count: x.max_schema_probe_calls,
  secret_material_observed: false,
  reviewer_material_increment: 0,
  field_purpose_rights_state: 'PENDING_ACTUAL_API_EULA_TERMINALIZATION',
  production: 'HOLD',
  publication: 'HOLD',
  truth_boundary: state === 'BLOCKED'
    ? 'Founder approval is satisfied, but account/EULA/token/cert handoff is incomplete. No PSA network call or reviewer-material promotion is permitted.'
    : 'Preflight permits only one-to-three documented PSA single-cert DEV/SHADOW schema calls. Raw provider payload must not be logged or uploaded; 120-case acquisition remains separately blocked pending rights terminalization.'
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
if (process.env.KAIOS_REQUIRE_PSA_PROBE_ALLOWED === '1' && state !== 'PSA_SINGLE_CERT_SCHEMA_PROBE_PERMITTED_BY_PREFLIGHT') process.exit(3);
