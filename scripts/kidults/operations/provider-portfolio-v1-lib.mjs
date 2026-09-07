import { digest } from './provider-operations-capability-v1-lib.mjs';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const exactKeys = (value, required, code) => {
  for (const key of required) if (!(key in value)) throw new Error(`${code}:${key}`);
};

const lastContact = communication => [
  communication?.last_outbound_at,
  communication?.latest_provider_response_at,
  communication?.latest_substantive_rights_response_at,
  communication?.latest_acknowledgement_at
].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

const contactEvidenceRefs = communication => [...new Set([
  communication?.last_outbound_evidence_ref,
  communication?.latest_provider_response_evidence_ref,
  communication?.latest_substantive_rights_response_evidence_ref,
  communication?.latest_acknowledgement_evidence_ref
].filter(Boolean))];

const hasSubstantiveResponse = communication => Boolean(
  communication?.latest_provider_response_at
  || communication?.latest_substantive_rights_response_at
  || /RESPONSE_RECEIVED|PARTIAL_RESPONSE/.test(communication?.state ?? '')
);

const rightsProgressStates = new Set([
  'BOUNDED_PRIVATE_REFERENCE_AND_AUTHENTICATION_ONLY',
  'WRITTEN_BOUNDED_PILOT_RIGHTS_WITH_POST_TERMINATION_DERIVED_HOLD',
  'WRITTEN_PARTIAL_RESPONSE_NEEDS_CLARIFICATION',
  'NEEDS_CLARIFICATION'
]);

function readinessSignals(record, source, adapter, contract) {
  const signals = [];
  const add = name => signals.push({ name, weight: contract.priority_model.signals[name] });
  if (record.identity.source_registry_kind === 'CANONICAL_PROVIDER_REGISTRY') add('CANONICAL_REGISTRY_RECORD');
  if (source?.state === 'BOUNDED') add('OPERATING_STATE_BOUNDED');
  if (source?.state === 'CONDITIONAL') add('OPERATING_STATE_CONDITIONAL');
  if (source?.state === 'HOLD') add('OPERATING_STATE_HOLD');
  if (rightsProgressStates.has(source?.rights_state)) add('WRITTEN_OR_BOUNDED_RIGHTS_PROGRESS');
  if (/VERIFIED/.test(source?.schema_state ?? '') && !/NOT_LIVE|NOT_VERIFIED/.test(source?.schema_state ?? '')) add('SCHEMA_RESPONSE_VERIFIED');
  if (adapter) add('ADAPTER_FOUNDATION');
  if (hasSubstantiveResponse(source?.communication)) add('SUBSTANTIVE_PROVIDER_RESPONSE');
  if (lastContact(source?.communication)) add('CONTACT_EVIDENCE');
  if (source?.state === 'CLOSED' || record.lifecycle_state === 'RETIRED') add('CLOSED_OR_RETIRED');
  return signals;
}

function validateReceiptBundle(bundle, contract) {
  if (!bundle) return false;
  if (!bundle.provider_id) throw new Error('PROVIDER_PORTFOLIO_RECEIPT_PROVIDER_REQUIRED');
  for (const receiptName of contract.receipt_bundle_controls.required_receipts) {
    const receipt = bundle[receiptName];
    if (!receipt) continue;
    exactKeys(receipt, contract.receipt_bundle_controls.required_receipt_fields, `PROVIDER_PORTFOLIO_RECEIPT_FIELD_MISSING:${bundle.provider_id}:${receiptName}`);
    if (receipt.provider_id !== bundle.provider_id || receipt.state !== 'VERIFIED_PASS' || receipt.immutable !== true || !/^sha256:[0-9a-f]{64}$/.test(receipt.receipt_digest) || typeof receipt.evidence_ref !== 'string' || receipt.evidence_ref.length === 0) throw new Error(`PROVIDER_PORTFOLIO_RECEIPT_INVALID:${bundle.provider_id}:${receiptName}`);
    if (receiptName === 'credential_binding_receipt' && receipt.secret_material_present !== false) throw new Error(`PROVIDER_PORTFOLIO_CREDENTIAL_SECRET_FORBIDDEN:${bundle.provider_id}`);
  }
  return true;
}

const receiptPass = (bundle, name) => bundle?.[name]?.state === 'VERIFIED_PASS';

function gapsFor(record, source, adapter, bundle) {
  const gaps = [];
  const missingRightsReceipts = ['rights_receipt', 'field_rights_receipt', 'retention_receipt', 'derived_results_receipt'].filter(name => !receiptPass(bundle, name));
  if (record.rights.state !== 'PASS' && missingRightsReceipts.length) gaps.push({ dimension: 'MISSING_RIGHTS', reason: source?.rights_state ?? 'RIGHTS_RECORD_ABSENT', missing_receipts: missingRightsReceipts });
  if (record.qualification.schema.state !== 'PASS' && !receiptPass(bundle, 'schema_receipt')) gaps.push({ dimension: 'MISSING_SCHEMA', reason: source?.schema_state ?? 'LIVE_SCHEMA_NOT_RECEIVED' });
  const missingQualificationReceipts = ['evidence_receipt', 'confidence_receipt', 'current_sold_receipt', 'track_b_receipt', 'qualification_receipt', 'simulation_receipt'].filter(name => !receiptPass(bundle, name));
  if (record.qualification.state !== 'PASS' && missingQualificationReceipts.length) gaps.push({ dimension: 'MISSING_QUALIFICATION', reason: 'ACTIVATION_QUALIFICATION_RECEIPTS_INCOMPLETE', missing_receipts: missingQualificationReceipts });
  const missingRuntimeReceipts = ['runtime_receipt', 'monitoring_receipt', 'rollback_receipt'].filter(name => !receiptPass(bundle, name));
  if (record.health.state !== 'HEALTHY' && missingRuntimeReceipts.length) gaps.push({ dimension: 'MISSING_RUNTIME', reason: 'PROVIDER_RUNTIME_RECEIPTS_INCOMPLETE', missing_receipts: missingRuntimeReceipts });
  if (record.activation_status.state !== 'PASS' && !receiptPass(bundle, 'approval_receipt')) gaps.push({ dimension: 'MISSING_APPROVAL', reason: 'PROVIDER_ACTIVATION_NOT_AUTHORIZED' });
  if (!source?.activation_manifest_id && !receiptPass(bundle, 'activation_manifest_receipt')) gaps.push({ dimension: 'MISSING_MANIFEST', reason: source?.manifest_progress?.lawful_progress ? `ADMISSIBLE_MANIFEST_${source.manifest_progress.lawful_progress}` : 'ACTIVATION_MANIFEST_NOT_ADMITTED' });
  if ((source?.credential_authorized !== true || adapter?.credential_slot?.value === 'NONE') && !receiptPass(bundle, 'credential_binding_receipt')) gaps.push({ dimension: 'MISSING_CREDENTIALS', reason: 'CREDENTIAL_CREATION_AND_USE_NOT_AUTHORIZED' });
  if (record.evidence.empirical_record_count === 0 && !receiptPass(bundle, 'evidence_receipt')) gaps.push({ dimension: 'MISSING_EVIDENCE', reason: 'EMPIRICAL_PROVIDER_EVIDENCE_NOT_ADMITTED' });
  return gaps;
}

const checklist = (names, states) => names.map(name => ({ control: name, state: states[name] ?? 'BLOCKED' }));

function playbookFor(entry, record, contract, operationsContract, adapter) {
  const gap = dimension => entry.gaps.some(item => item.dimension === dimension);
  const qualificationStates = {
    SCHEMA: entry.schema_status,
    EVIDENCE: gap('MISSING_EVIDENCE') ? 'BLOCKED' : 'PASS',
    CONFIDENCE: gap('MISSING_QUALIFICATION') ? 'BLOCKED' : 'PASS',
    CURRENT_SOLD: gap('MISSING_QUALIFICATION') ? 'BLOCKED' : 'PASS',
    TRACK_B: gap('MISSING_QUALIFICATION') ? 'BLOCKED' : 'PASS',
    QUALIFICATION: entry.qualification_status
  };
  const activationStates = {
    RIGHTS: entry.rights_status,
    QUALIFICATION: entry.qualification_status,
    EVIDENCE: gap('MISSING_EVIDENCE') ? 'BLOCKED' : 'PASS',
    CURRENT_SOLD: gap('MISSING_QUALIFICATION') ? 'BLOCKED' : 'PASS',
    OPERATIONAL_HEALTH: gap('MISSING_RUNTIME') ? 'BLOCKED' : 'PASS'
  };
  const core = {
    playbook_id: `provider-playbook-${entry.provider_id.toLowerCase().replaceAll('_', '-')}-v1`,
    provider_id: entry.provider_id,
    golden_path: contract.golden_path,
    provider_overview: entry.identity,
    contact_history: {
      state: record.communication.state,
      last_contact: entry.last_contact,
      evidence_refs: contactEvidenceRefs(record.communication),
      duplicate_outreach_prohibited: record.communication.duplicate_outreach_prohibited ?? true,
      automatic_followup_authorized: record.communication.automatic_followup_authorized ?? false
    },
    rights_status: { ...record.rights, state: entry.rights_status },
    schema_mapping: adapter?.schema_mapper ?? { source_schema_version: 'UNBOUND', source_to_canonical: {}, state: 'BLOCKED_NO_ADAPTER_FOUNDATION' },
    qualification_checklist: checklist(operationsContract.qualification_controls, qualificationStates),
    activation_checklist: [
      { control: 'APPROVAL', state: entry.gaps.some(gap => gap.dimension === 'MISSING_APPROVAL') ? 'BLOCKED' : 'PASS' },
      ...checklist(operationsContract.activation_controls, activationStates)
    ],
    operational_checklist: [
      ...operationsContract.observability.map(control => ({ control, state: 'BLOCKED_NO_ACTIVE_PROVIDER_RUNTIME' })),
      { control: 'ROLLBACK', state: 'CONTROL_VALIDATED_PROVIDER_NOT_ACTIVE' }
    ],
    incident_handling: { lifecycle: operationsContract.incident_lifecycle, state: 'CONTROL_VALIDATED_NO_OPEN_PROVIDER_INCIDENT' },
    rollback: { action: contract.playbook_controls.rollback_action, current_state: 'NOT_REQUIRED_PROVIDER_NOT_ACTIVE' },
    next_action: entry.next_action,
    readiness: entry.readiness,
    blockers: entry.blockers,
    source_sha: record.source_sha,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  };
  return deepFreeze({ ...core, playbook_digest: digest(core) });
}

export function buildProviderPortfolio(contract, operationsContract, operationsRegistry, providerRegistry, adapterManifest, onboardingReceiptIndex) {
  if (contract.authority_boundary?.provider_activation_authorized !== false || contract.authority_boundary?.provider_contact_authorized !== false || contract.authority_boundary?.credential_creation_authorized !== false) throw new Error('PROVIDER_PORTFOLIO_AUTHORITY_BOUNDARY_BROKEN');
  if (contract.playbook_controls?.same_golden_path_for_every_provider !== true || contract.playbook_controls?.provider_specific_workflow_forbidden !== true) throw new Error('PROVIDER_PORTFOLIO_GOLDEN_PATH_POLICY_BROKEN');
  const sourceById = new Map((providerRegistry.providers ?? []).map(item => [item.provider_id, item]));
  if (sourceById.size !== providerRegistry.providers?.length) throw new Error('PROVIDER_PORTFOLIO_DUPLICATE_SOURCE_PROVIDER');
  const adapterByCanonical = new Map((adapterManifest.adapters ?? []).map(adapter => [operationsContract.adapter_identity_bindings[adapter.provider_id], adapter]));
  if (onboardingReceiptIndex?.authority_boundary?.receipt_bundle_self_authorizes_activation !== false || onboardingReceiptIndex?.secret_material_forbidden !== true) throw new Error('PROVIDER_PORTFOLIO_RECEIPT_INDEX_BOUNDARY_BROKEN');
  const bundles = new Map();
  for (const bundle of onboardingReceiptIndex?.provider_receipt_bundles ?? []) {
    validateReceiptBundle(bundle, contract);
    if (bundles.has(bundle.provider_id)) throw new Error(`PROVIDER_PORTFOLIO_DUPLICATE_RECEIPT_BUNDLE:${bundle.provider_id}`);
    if (!operationsRegistry.providers.some(record => record.provider_id === bundle.provider_id)) throw new Error(`PROVIDER_PORTFOLIO_RECEIPT_PROVIDER_UNREGISTERED:${bundle.provider_id}`);
    bundles.set(bundle.provider_id, bundle);
  }
  const entries = operationsRegistry.providers.map(record => {
    const source = sourceById.get(record.provider_id);
    const adapter = adapterByCanonical.get(record.provider_id);
    const bundle = bundles.get(record.provider_id);
    const gaps = gapsFor(record, source, adapter, bundle);
    const signals = readinessSignals(record, source, adapter, contract);
    const exactBlockers = [...new Set([source?.blocker, ...gaps.map(gap => `${gap.dimension}:${gap.reason}`)].filter(Boolean))];
    const core = {
      provider_id: record.provider_id,
      identity: record.identity,
      current_state: source?.state ?? record.lifecycle_state,
      lifecycle_state: record.lifecycle_state,
      priority: null,
      priority_score: signals.reduce((sum, signal) => sum + signal.weight, 0),
      priority_reasons: signals,
      rights_status: gaps.some(gap => gap.dimension === 'MISSING_RIGHTS') ? 'BLOCKED' : 'PASS',
      schema_status: gaps.some(gap => gap.dimension === 'MISSING_SCHEMA') ? 'BLOCKED' : 'PASS',
      qualification_status: gaps.some(gap => gap.dimension === 'MISSING_QUALIFICATION') ? 'BLOCKED' : 'PASS',
      activation_status: gaps.length === 0 ? 'READY_FOR_GOVERNED_ACTIVATION_NOT_ACTIVE' : 'BLOCKED',
      last_contact: lastContact(record.communication),
      next_action: source?.next_action ?? 'OBTAIN_WRITTEN_RIGHTS_SCHEMA_AND_PROVIDER_IDENTITY_EVIDENCE_BEFORE_EVALUATION',
      blockers: exactBlockers,
      gaps,
      risk: record.risk,
      owner: record.owner,
      readiness: gaps.length === 0 ? 'READY' : 'BLOCKED',
      evidence_refs: record.evidence_refs,
      source_record_digest: record.record_digest
    };
    exactKeys(core, contract.required_portfolio_fields, `PROVIDER_PORTFOLIO_FIELD_MISSING:${record.provider_id}`);
    return core;
  });
  entries.sort((a, b) => b.priority_score - a.priority_score || a.provider_id.localeCompare(b.provider_id));
  const ranked = entries.map((entry, priority) => ({ ...entry, priority }));
  const playbooks = ranked.map(entry => playbookFor(entry, operationsRegistry.providers.find(record => record.provider_id === entry.provider_id), contract, operationsContract, adapterByCanonical.get(entry.provider_id)));
  const core = {
    id: 'kidults-provider-portfolio-projection-v1', version: '1.0.0', source_sha: operationsRegistry.source_sha,
    source_registry_as_of: operationsRegistry.source_registry_as_of,
    authority: contract.authority,
    golden_path: contract.golden_path,
    counts: {
      providers: ranked.length,
      ready: ranked.filter(item => item.readiness === 'READY').length,
      blocked: ranked.filter(item => item.readiness === 'BLOCKED').length,
      playbooks: playbooks.length,
      queue_entries: ranked.length
    },
    provider_portfolio: ranked,
    readiness_matrix: ranked.map(item => ({ provider_id: item.provider_id, readiness: item.readiness, exact_blockers: item.blockers, gaps: item.gaps })),
    provider_playbooks: playbooks,
    execution_queue: ranked.map(item => ({ priority: item.priority, provider_id: item.provider_id, readiness: item.readiness, score: item.priority_score, exact_reasons: item.priority_reasons, exact_blockers: item.blockers })),
    provider_calls: 0, credentials_created: 0, providers_activated: 0,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  };
  return deepFreeze({ ...core, portfolio_digest: digest(core) });
}
