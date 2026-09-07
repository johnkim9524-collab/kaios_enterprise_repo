import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildProviderOperationsRegistry } from '../../../scripts/kidults/operations/provider-operations-capability-v1-lib.mjs';
import { buildProviderPortfolio } from '../../../scripts/kidults/operations/provider-portfolio-v1-lib.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const contract = read('coordination/kidults/operations/provider-portfolio-v1.json');
const operationsContract = read(contract.authority.operational_model);
const providerRegistry = read(contract.authority.provider_identity_and_current_state);
const rightsManifest = read(contract.authority.rights);
const adapterManifest = read(contract.authority.adapter_foundation);
const communicationEvidence = read(contract.authority.communication);
const onboardingReceiptIndex = read(contract.authority.onboarding_receipts);
const sourceSha = 'a'.repeat(40);
const registry = () => buildProviderOperationsRegistry(operationsContract, providerRegistry, rightsManifest, adapterManifest, communicationEvidence, { sourceSha, observedAt: providerRegistry.as_of });

test('builds one complete portfolio projection without creating a second provider registry', () => {
  const result = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  assert.equal(result.authority.duplicate_provider_registry_created, false);
  assert.deepEqual(result.counts, { providers: 21, ready: 0, blocked: 21, playbooks: 21, queue_entries: 21 });
  assert.equal(new Set(result.provider_portfolio.map(item => item.provider_id)).size, 21);
  for (const item of result.provider_portfolio) {
    for (const field of contract.required_portfolio_fields) assert.ok(field in item, `${item.provider_id}:${field}`);
    assert.equal(item.readiness, 'BLOCKED');
    assert.ok(item.blockers.length > 0);
  }
});

test('generates one complete executable playbook per provider on the identical golden path', () => {
  const result = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  assert.equal(result.provider_playbooks.length, 21);
  for (const playbook of result.provider_playbooks) {
    assert.deepEqual(playbook.golden_path, contract.golden_path);
    for (const section of contract.required_playbook_sections) assert.ok(section in playbook, `${playbook.provider_id}:${section}`);
    assert.doesNotMatch(JSON.stringify(playbook), /\b(TODO|TBD|PLACEHOLDER)\b/i);
    assert.deepEqual(playbook.activation_checklist[0], { control: 'APPROVAL', state: 'BLOCKED' });
    assert.equal(playbook.production, 'HOLD');
  }
});

test('uses the latest evidenced communication event as Last Contact', () => {
  const result = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  const gemRate = result.provider_portfolio.find(item => item.provider_id === 'GEMRATE');
  assert.equal(gemRate.last_contact, '2026-08-27T14:18:21Z');
  const playbook = result.provider_playbooks.find(item => item.provider_id === 'GEMRATE');
  assert.ok(playbook.contact_history.evidence_refs.includes('gmail:message:1a0439617a831715'));
});

test('ranks every provider deterministically and identifies PSA Premium as priority zero', () => {
  const first = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  const second = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  assert.equal(first.portfolio_digest, second.portfolio_digest);
  assert.deepEqual(first.execution_queue.map(item => item.priority), Array.from({ length: 21 }, (_, index) => index));
  assert.equal(first.execution_queue[0].provider_id, 'PSA_PREMIUM');
  assert.ok(first.execution_queue[0].exact_reasons.length > 0);
  assert.ok(first.execution_queue[0].exact_blockers.length > 0);
});

test('reports every required gap dimension from repository evidence', () => {
  const result = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex);
  const psa = result.readiness_matrix.find(item => item.provider_id === 'PSA_PREMIUM');
  for (const item of result.readiness_matrix) assert.deepEqual(new Set(item.gaps.map(gap => gap.dimension)), new Set(contract.gap_dimensions), item.provider_id);
  assert.match(psa.exact_blockers.join('|'), /PROVENANCE_BOUND_ADMISSIBLE_MANIFEST_0_OF_120/);
});

test('accepts a complete provider-neutral receipt bundle without a code change', () => {
  const index = structuredClone(onboardingReceiptIndex);
  const makeReceipt = (name, extra = {}) => ({ provider_id: 'PSA_PREMIUM', state: 'VERIFIED_PASS', evidence_ref: `evidence/${name}.json`, receipt_digest: `sha256:${'b'.repeat(64)}`, immutable: true, ...extra });
  index.provider_receipt_bundles.push({
    provider_id: 'PSA_PREMIUM',
    ...Object.fromEntries(contract.receipt_bundle_controls.required_receipts.map(name => [name, makeReceipt(name, name === 'credential_binding_receipt' ? { secret_material_present: false } : {})]))
  });
  const result = buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, index);
  const psa = result.provider_portfolio.find(item => item.provider_id === 'PSA_PREMIUM');
  assert.equal(psa.readiness, 'READY');
  assert.equal(psa.activation_status, 'READY_FOR_GOVERNED_ACTIVATION_NOT_ACTIVE');
  assert.deepEqual(psa.gaps, []);
  const playbook = result.provider_playbooks.find(item => item.provider_id === 'PSA_PREMIUM');
  assert.ok(playbook.qualification_checklist.every(item => item.state === 'PASS'));
  assert.ok(playbook.activation_checklist.every(item => item.state === 'PASS'));
  assert.equal(result.providers_activated, 0);
});

test('fails closed on duplicate providers and weakened authority', () => {
  const duplicate = structuredClone(providerRegistry);
  duplicate.providers.push(structuredClone(duplicate.providers[0]));
  assert.throws(() => buildProviderOperationsRegistry(operationsContract, duplicate, rightsManifest, adapterManifest, communicationEvidence, { sourceSha, observedAt: providerRegistry.as_of }), /PROVIDER_OPS_DUPLICATE_CANONICAL_PROVIDER/);
  const weakened = structuredClone(contract);
  weakened.authority_boundary.provider_activation_authorized = true;
  assert.throws(() => buildProviderPortfolio(weakened, operationsContract, registry(), providerRegistry, adapterManifest, onboardingReceiptIndex), /PROVIDER_PORTFOLIO_AUTHORITY_BOUNDARY_BROKEN/);
  const secret = structuredClone(onboardingReceiptIndex);
  secret.provider_receipt_bundles.push({ provider_id: 'PSA_PREMIUM', credential_binding_receipt: { provider_id: 'PSA_PREMIUM', state: 'VERIFIED_PASS', evidence_ref: 'evidence/credential.json', receipt_digest: `sha256:${'c'.repeat(64)}`, immutable: true, secret_material_present: true } });
  assert.throws(() => buildProviderPortfolio(contract, operationsContract, registry(), providerRegistry, adapterManifest, secret), /PROVIDER_PORTFOLIO_CREDENTIAL_SECRET_FORBIDDEN/);
});
