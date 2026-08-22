import crypto from 'node:crypto';

const TRUSTED_SOURCE = 'CONTROL_PLANE';
const PASS = 'PROVIDER_BINDING_VALID';
const REVALIDATE = 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function digestBinding(binding) {
  const body = structuredClone(binding);
  delete body.binding_digest;
  return sha256(body);
}

function digestProof(proof) {
  const body = structuredClone(proof);
  delete body.proof_digest;
  return sha256(body);
}

function buildBinding({ previous_provider_id = null, provider_id, adapter_id, source_owner_id, source_namespace, epoch = 1 }) {
  const binding = {
    trusted_source: TRUSTED_SOURCE,
    epoch,
    previous_provider_id,
    provider_id,
    adapter_id,
    source_owner_id,
    source_namespace
  };
  binding.binding_digest = digestBinding(binding);
  return binding;
}

function buildRevalidationProof(binding) {
  const proof = {
    trusted_source: TRUSTED_SOURCE,
    binding_digest: binding.binding_digest,
    binding_epoch: binding.epoch,
    provider_id: binding.provider_id,
    adapter_id: binding.adapter_id,
    source_owner_id: binding.source_owner_id,
    source_namespace: binding.source_namespace,
    adapter_validated: true,
    rights_revalidated: true,
    identity_revalidated: true,
    lineage_revalidated: true,
    revalidation_event_id: `provider-revalidation-${binding.epoch}-${binding.provider_id}`
  };
  proof.proof_digest = digestProof(proof);
  return proof;
}

function evaluateProviderTransition(recordProvider = {}, trustedContext = {}) {
  const binding = trustedContext.trusted_provider_binding;
  const minimumEpoch = trustedContext.minimum_provider_binding_epoch;
  const failures = [];

  if (!binding || typeof binding !== 'object') return { disposition: REVALIDATE, failures: ['trusted_provider_binding_missing'] };
  if (binding.trusted_source !== TRUSTED_SOURCE) failures.push('provider_binding_untrusted_source');
  if (!Number.isInteger(binding.epoch) || binding.epoch < 1) failures.push('provider_binding_epoch_invalid');
  if (Number.isInteger(minimumEpoch) && binding.epoch < minimumEpoch) failures.push('provider_binding_stale_epoch');
  if (!binding.provider_id || !binding.adapter_id || !binding.source_owner_id || !binding.source_namespace) failures.push('provider_binding_identity_incomplete');
  if (binding.binding_digest !== digestBinding(binding)) failures.push('provider_binding_digest_mismatch');
  if (recordProvider.provider_id !== binding.provider_id) failures.push('provider_payload_provider_id_mismatch');
  if (recordProvider.adapter_id !== binding.adapter_id) failures.push('provider_payload_adapter_id_mismatch');

  const substitution = typeof binding.previous_provider_id === 'string' && binding.previous_provider_id.length > 0 && binding.previous_provider_id !== binding.provider_id;
  if (recordProvider.substitution !== substitution) failures.push('provider_payload_substitution_claim_mismatch');

  if (substitution) {
    const proof = trustedContext.trusted_provider_revalidation;
    if (!proof || typeof proof !== 'object') {
      failures.push('trusted_provider_revalidation_missing');
    } else {
      if (proof.trusted_source !== TRUSTED_SOURCE) failures.push('provider_revalidation_untrusted_source');
      if (proof.proof_digest !== digestProof(proof)) failures.push('provider_revalidation_digest_mismatch');
      if (proof.binding_digest !== binding.binding_digest || proof.binding_epoch !== binding.epoch) failures.push('provider_revalidation_binding_mismatch');
      if (proof.provider_id !== binding.provider_id || proof.adapter_id !== binding.adapter_id) failures.push('provider_revalidation_provider_adapter_mismatch');
      if (proof.source_owner_id !== binding.source_owner_id || proof.source_namespace !== binding.source_namespace) failures.push('provider_revalidation_source_binding_mismatch');
      if (!proof.revalidation_event_id || typeof proof.revalidation_event_id !== 'string') failures.push('provider_revalidation_event_missing');
      for (const field of ['adapter_validated','rights_revalidated','identity_revalidated','lineage_revalidated']) {
        if (proof[field] !== true) failures.push(`provider_revalidation_${field}_not_proven`);
      }
    }
  }

  return failures.length ? { disposition: REVALIDATE, failures: [...new Set(failures)] } : { disposition: PASS, failures: [], substitution };
}

const sameBinding = buildBinding({ provider_id: 'provider-a', adapter_id: 'adapter-a-v1', source_owner_id: 'owner-a', source_namespace: 'partner-a', epoch: 7 });
const ordinaryRecord = { provider_id: 'provider-a', adapter_id: 'adapter-a-v1', substitution: false, adapter_validated: true, rights_revalidated: true, identity_revalidated: true, lineage_revalidated: true };
const ordinary = evaluateProviderTransition(ordinaryRecord, { trusted_provider_binding: sameBinding, minimum_provider_binding_epoch: 7 });
if (ordinary.disposition !== PASS || ordinary.substitution !== false) throw new Error(`ordinary trusted provider binding failed: ${JSON.stringify(ordinary)}`);

const changedBinding = buildBinding({ previous_provider_id: 'provider-a', provider_id: 'provider-b', adapter_id: 'adapter-b-v1', source_owner_id: 'owner-a', source_namespace: 'partner-a', epoch: 8 });
const forgedPayload = { provider_id: 'provider-b', adapter_id: 'adapter-b-v1', substitution: false, adapter_validated: true, rights_revalidated: true, identity_revalidated: true, lineage_revalidated: true };
const undeclared = evaluateProviderTransition(forgedPayload, { trusted_provider_binding: changedBinding, minimum_provider_binding_epoch: 8 });
if (undeclared.disposition !== REVALIDATE || !undeclared.failures.includes('provider_payload_substitution_claim_mismatch')) throw new Error(`undeclared provider substitution failed open: ${JSON.stringify(undeclared)}`);

const declaredSelfAttested = { ...forgedPayload, substitution: true };
const selfAttested = evaluateProviderTransition(declaredSelfAttested, { trusted_provider_binding: changedBinding, minimum_provider_binding_epoch: 8 });
if (selfAttested.disposition !== REVALIDATE || !selfAttested.failures.includes('trusted_provider_revalidation_missing')) throw new Error(`payload self-attested revalidation failed open: ${JSON.stringify(selfAttested)}`);

const validProof = buildRevalidationProof(changedBinding);
const validated = evaluateProviderTransition(declaredSelfAttested, { trusted_provider_binding: changedBinding, trusted_provider_revalidation: validProof, minimum_provider_binding_epoch: 8 });
if (validated.disposition !== PASS || validated.substitution !== true) throw new Error(`trusted provider substitution proof failed: ${JSON.stringify(validated)}`);

const mutations = [
  ['missing_binding', r => ({ record: structuredClone(declaredSelfAttested), context: { minimum_provider_binding_epoch: 8 } })],
  ['binding_untrusted', r => { r.context.trusted_provider_binding.trusted_source = 'PARTNER_PAYLOAD'; r.context.trusted_provider_binding.binding_digest = digestBinding(r.context.trusted_provider_binding); return r; }],
  ['binding_digest_tamper', r => { r.context.trusted_provider_binding.binding_digest = 'forged'; return r; }],
  ['provider_id_rebinding', r => { r.record.provider_id = 'provider-c'; return r; }],
  ['adapter_id_rebinding', r => { r.record.adapter_id = 'adapter-c-v1'; return r; }],
  ['undeclared_substitution', r => { r.record.substitution = false; return r; }],
  ['missing_revalidation', r => { delete r.context.trusted_provider_revalidation; return r; }],
  ['proof_untrusted_source', r => { r.context.trusted_provider_revalidation.trusted_source = 'PARTNER_PAYLOAD'; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_digest_tamper', r => { r.context.trusted_provider_revalidation.proof_digest = 'forged'; return r; }],
  ['proof_binding_replay', r => { r.context.trusted_provider_revalidation.binding_digest = sameBinding.binding_digest; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_provider_rebinding', r => { r.context.trusted_provider_revalidation.provider_id = 'provider-c'; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_adapter_rebinding', r => { r.context.trusted_provider_revalidation.adapter_id = 'adapter-c-v1'; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_source_owner_rebinding', r => { r.context.trusted_provider_revalidation.source_owner_id = 'owner-b'; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_namespace_rebinding', r => { r.context.trusted_provider_revalidation.source_namespace = 'partner-b'; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['proof_rights_false', r => { r.context.trusted_provider_revalidation.rights_revalidated = false; r.context.trusted_provider_revalidation.proof_digest = digestProof(r.context.trusted_provider_revalidation); return r; }],
  ['stale_binding_epoch', r => { r.context.minimum_provider_binding_epoch = 9; return r; }]
];

for (const [id, mutate] of mutations) {
  const seed = { record: structuredClone(declaredSelfAttested), context: { trusted_provider_binding: structuredClone(changedBinding), trusted_provider_revalidation: structuredClone(validProof), minimum_provider_binding_epoch: 8 } };
  const candidate = mutate(seed);
  const result = evaluateProviderTransition(candidate.record, candidate.context);
  if (result.disposition !== REVALIDATE) throw new Error(`provider transition mutation ${id} failed open: ${JSON.stringify(result)}`);
}

const independentBinding = buildBinding({ provider_id: 'provider-independent', adapter_id: 'adapter-independent-v1', source_owner_id: 'owner-independent', source_namespace: 'partner-independent', epoch: 3 });
const independent = evaluateProviderTransition({ provider_id: 'provider-independent', adapter_id: 'adapter-independent-v1', substitution: false }, { trusted_provider_binding: independentBinding, minimum_provider_binding_epoch: 3 });
if (independent.disposition !== PASS) throw new Error(`independent source owner was globally blocked: ${JSON.stringify(independent)}`);

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_PROVIDER_TRANSITION_TRUSTED_BINDING_V1',
  governing_issue: 1053,
  control_family: 'PROVIDER_INDEPENDENCE_CONCENTRATION',
  trusted_provider_identity_binding: true,
  substitution_derived_from_trusted_transition: true,
  payload_declared_substitution_not_authoritative: true,
  payload_revalidation_flags_not_authoritative: true,
  trusted_digest_bound_revalidation_required: true,
  fail_closed_mutation_cases: mutations.length,
  independent_source_owner_not_globally_blocked: true,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
