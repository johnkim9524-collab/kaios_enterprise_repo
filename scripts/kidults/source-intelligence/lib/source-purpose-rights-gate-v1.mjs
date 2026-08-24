export const RIGHTS_CLEAR = 'RIGHTS_CLEAR_FOR_PURPOSE';
export const RIGHTS_HOLD = 'RIGHTS_HOLD';

const POSITIVE_RIGHTS = new Set([
  'ALLOW',
  'ALLOW_FOR_PURPOSE',
  'ADMITTED',
  'LICENSED_FOR_PURPOSE',
  'PASS',
  'RIGHTS_PASS',
  'VERIFIED_PASS'
]);
const POSITIVE_ACCESS = new Set([
  'AUTHORIZED',
  'AUTHORIZED_API',
  'AUTHORIZED_FEED',
  'CC0',
  'LICENSED_API',
  'LICENSED_FEED',
  'OPEN_API'
]);
const POSITIVE_FIELD_RIGHTS = new Set(['ALLOW', 'ALLOW_FOR_PURPOSE', 'PASS', 'VERIFIED_PASS']);

const PURPOSE_SPECS = new Map([
  ['CURRENT_SOLD_TRANSACTION_REFERENCE', {
    required_roles_all: ['SOLD_TRANSACTION'],
    required_evidence_classes_all: ['CURRENT_SOLD_TRANSACTION_REFERENCE'],
    required_field_groups: [
      ['source_record_id', 'equipment_id', 'equip_id', 'lot_id', 'transaction_id'],
      ['sale_price', 'realized_price', 'final_price'],
      ['sale_date', 'event_at', 'transaction_date']
    ],
    required_outputs_all: ['INTERNAL_CURRENT_SOLD_REFERENCE']
  }],
  ['CURRENT_SOLD_TRANSACTION', {
    required_roles_all: ['SOLD_TRANSACTION'],
    required_evidence_classes_all: ['CURRENT_SOLD_TRANSACTION'],
    required_field_groups: [
      ['source_record_id', 'lot_id', 'transaction_id'],
      ['terminal_market_state', 'sold_status', 'sale_status'],
      ['realized_price', 'final_price', 'hammer_price'],
      ['currency'],
      ['event_at', 'sale_date', 'transaction_date']
    ],
    required_outputs_all: ['INTERNAL_CURRENT_SOLD_EVIDENCE']
  }],
  ['CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION', {
    required_roles_all: ['SOLD_TRANSACTION', 'LISTING_SUPPLY'],
    required_evidence_classes_all: ['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_EXPOSURE'],
    required_field_groups: [
      ['source_record_id', 'lot_id', 'transaction_id'],
      ['terminal_market_state', 'sold_status', 'sale_status'],
      ['realized_price', 'final_price', 'hammer_price'],
      ['currency'],
      ['event_at', 'sale_date', 'transaction_date'],
      ['exposure_start_at'],
      ['observation_end_at'],
      ['outcome_state'],
      ['censoring_state']
    ],
    required_outputs_all: ['INTERNAL_CURRENT_SOLD_EVIDENCE', 'INTERNAL_LIQUIDITY_INPUT']
  }]
]);

const EXTERNAL_COMMITMENT_FLAGS = [
  'paid_plan_required',
  'spend_required',
  'eula_required',
  'contract_required',
  'credential_required',
  'account_required',
  'login_required',
  'written_permission_required'
];
const INVALIDATION_FLAGS = [
  'revoked',
  'rights_expired',
  'terms_changed',
  'scope_changed',
  'license_changed'
];

const token = value => String(value ?? '').trim().toUpperCase();
const hasPositive = (value, values) => values.has(token(value));
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))].sort();
const sha256 = value => /^sha256:[a-f0-9]{64}$/i.test(String(value ?? ''));
const canonicalRef = value => {
  const text = String(value ?? '');
  return /^https:\/\/[^\s]+$/i.test(text) ||
    /^repo:[^\s#]+#[^\s]+$/i.test(text) ||
    /^artifact:sha256:[a-f0-9]{64}$/i.test(text) ||
    /^registry:[^\s]+$/i.test(text);
};
const refs = (row, binding) => unique([
  ...array(binding?.evidence_refs),
  ...array(row?.evidence_refs ?? row?.rights_evidence_refs ?? row?.rights?.evidence_refs)
].filter(value => typeof value === 'string' && value.length > 0));

function fieldPurposeRightsPass(row) {
  if (row?.field_purpose_rights_verified === true || row?.purpose_specific_rights_verified === true) return true;
  if (token(row?.field_purpose_rights_state) === 'PASS' || token(row?.purpose_rights_state) === 'PASS') return true;
  const purpose = row?.purpose_rights;
  if (!purpose || typeof purpose !== 'object') return false;
  return ['collect', 'store', 'derive'].every(key => hasPositive(purpose[key], POSITIVE_FIELD_RIGHTS));
}

function commercialReusePass(row) {
  if (row?.commercial_reuse_authorized === true || row?.commercial_use_authorized === true) return true;
  return ['commercial_use_state', 'commercial_reuse_state', 'commercial_rights_state']
    .some(key => hasPositive(row?.[key], POSITIVE_RIGHTS));
}

function accessPass(row) {
  if (row?.access_authorized === true || row?.authorized_access === true) return true;
  return hasPositive(row?.access_state, POSITIVE_ACCESS) || hasPositive(row?.access_mode, POSITIVE_ACCESS);
}

function exactPurposeBinding(row, purpose) {
  const bindings = [
    ...array(row?.purpose_bindings),
    ...(row?.purpose_binding && typeof row.purpose_binding === 'object' ? [row.purpose_binding] : [])
  ];
  return bindings.find(binding => token(binding?.purpose) === token(purpose)) || null;
}

function externalApprovalPass(row, purpose) {
  const required = EXTERNAL_COMMITMENT_FLAGS.filter(key => row?.[key] === true);
  if (!required.length) return { pass: true, required };
  const receipt = row?.external_approval_receipt;
  const pass = receipt?.founder_decision === 'APPROVED' &&
    token(receipt?.purpose) === token(purpose) &&
    String(receipt?.source_id ?? '') === String(row?.source_id ?? '') &&
    sha256(receipt?.digest);
  return { pass, required };
}

function timestampState(row, binding, asOf) {
  const observedAt = binding?.observed_at ?? row?.observed_at ?? row?.rights_observed_at;
  const reviewDueAt = binding?.review_due_at ?? row?.review_due_at ?? row?.next_revalidation_at;
  const observed = observedAt ? new Date(observedAt) : null;
  const due = reviewDueAt ? new Date(reviewDueAt) : null;
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  return {
    observedAt,
    reviewDueAt,
    observedValid: Boolean(observed && !Number.isNaN(observed.getTime()) && observed <= now),
    dueValid: Boolean(due && !Number.isNaN(due.getTime()) && due >= now)
  };
}

function bindingReasons(row, purpose, binding) {
  const reasons = [];
  const spec = PURPOSE_SPECS.get(purpose);
  if (!spec) return ['PURPOSE_NOT_SUPPORTED_BY_GATE'];
  if (!binding) return ['EXACT_SOURCE_PURPOSE_BINDING_MISSING'];

  const roles = unique([...array(binding.source_roles), ...array(row?.source_roles)]);
  const evidenceClasses = unique(array(binding.evidence_classes ?? binding.evidence_class));
  const fields = unique(array(binding.fields ?? binding.field_allowlist));
  const outputs = unique(array(binding.outputs ?? binding.authorized_outputs));

  for (const role of spec.required_roles_all) if (!roles.includes(role)) reasons.push(`PURPOSE_REQUIRED_SOURCE_ROLE_MISSING:${role}`);
  for (const evidenceClass of spec.required_evidence_classes_all) if (!evidenceClasses.includes(evidenceClass)) reasons.push(`PURPOSE_EVIDENCE_CLASS_MISMATCH:${evidenceClass}`);
  for (const group of spec.required_field_groups) if (!group.some(field => fields.includes(field))) reasons.push(`PURPOSE_REQUIRED_FIELD_GROUP_MISSING:${group.join('|')}`);
  for (const output of spec.required_outputs_all) if (!outputs.includes(output)) reasons.push(`PURPOSE_REQUIRED_OUTPUT_MISSING:${output}`);
  if (binding.scope_verified !== true) reasons.push('PURPOSE_SCOPE_NOT_VERIFIED');
  if (binding.time_scope_verified !== true) reasons.push('PURPOSE_TIME_SCOPE_NOT_VERIFIED');
  if (binding.freshness_verified !== true) reasons.push('PURPOSE_FRESHNESS_NOT_VERIFIED');
  if (binding.license_scope_verified !== true) reasons.push('PURPOSE_LICENSE_SCOPE_NOT_VERIFIED');
  return reasons;
}

/**
 * Decide whether a source is eligible to enter a purpose-specific acquisition
 * or adapter backlog. Discovery, catalog, listing, generic access, or a global
 * PASS can never be widened to CURRENT_SOLD. The exact source × purpose ×
 * evidence-class × field × output × scope × time binding is mandatory.
 */
export function classifyPurposeRights(row, purpose = 'CURRENT_SOLD_TRANSACTION', asOf = new Date()) {
  const reasons = [];
  const rightsState = token(row?.rights_state ?? row?.rights_decision ?? row?.rights?.decision);
  const activationState = token(row?.activation_state);
  const blocker = token(row?.blocker ?? row?.blocking_reason);
  const explicitBlocker = /UNKNOWN|DENY|HOLD|CONDITIONAL|PENDING|REQUIRED|PROHIBIT|LOGIN|PAY|SPEND|ACCOUNT|CREDENTIAL|WAF|ROBOTS|SCRAP|TERMS/.test(
    `${rightsState} ${activationState} ${blocker}`
  );
  const binding = exactPurposeBinding(row, purpose);
  const evidenceRefs = refs(row, binding);
  const evidenceDigest = binding?.evidence_digest ?? row?.evidence_digest ?? row?.rights_evidence_digest;
  const timestamp = timestampState(row, binding, asOf);
  const externalApproval = externalApprovalPass(row, purpose);

  if (!PURPOSE_SPECS.has(purpose)) reasons.push('PURPOSE_NOT_SUPPORTED_BY_GATE');
  if (!hasPositive(rightsState, POSITIVE_RIGHTS) || explicitBlocker) reasons.push('RIGHTS_DECISION_NOT_EXPLICIT_PURPOSE_PASS');
  if (!fieldPurposeRightsPass(row)) reasons.push('FIELD_PURPOSE_COLLECT_STORE_DERIVE_RIGHTS_NOT_VERIFIED');
  if (!commercialReusePass(row)) reasons.push('COMMERCIAL_REUSE_RIGHT_NOT_EXPLICIT');
  if (!accessPass(row)) reasons.push('AUTHORIZED_ACCESS_NOT_EXPLICIT');
  reasons.push(...bindingReasons(row, purpose, binding));
  if (!evidenceRefs.length || evidenceRefs.some(value => !canonicalRef(value))) reasons.push('CANONICAL_RIGHTS_EVIDENCE_REFERENCE_MISSING_OR_INVALID');
  if (!sha256(evidenceDigest)) reasons.push('RIGHTS_EVIDENCE_DIGEST_MISSING_OR_INVALID');
  if (!timestamp.observedValid) reasons.push('RIGHTS_EVIDENCE_OBSERVED_AT_MISSING_OR_INVALID');
  if (!timestamp.dueValid) reasons.push('RIGHTS_EVIDENCE_STALE_OR_REVALIDATION_DUE');
  for (const flag of INVALIDATION_FLAGS) if (row?.[flag] === true || binding?.[flag] === true) reasons.push(`RIGHTS_INVALIDATED:${flag.toUpperCase()}`);
  if (!externalApproval.pass) reasons.push(`EXTERNAL_APPROVAL_RECEIPT_REQUIRED:${externalApproval.required.join('|')}`);

  const uniqueReasons = unique(reasons);
  const decision = uniqueReasons.length === 0 ? RIGHTS_CLEAR : RIGHTS_HOLD;
  return {
    purpose,
    decision,
    eligible_for_acquisition_or_adapter_backlog: decision === RIGHTS_CLEAR,
    reason_codes: uniqueReasons,
    evidence_refs: evidenceRefs,
    evidence_digest: sha256(evidenceDigest) ? evidenceDigest : null,
    purpose_binding_id: binding?.binding_id ?? null,
    source_roles: unique([...array(binding?.source_roles), ...array(row?.source_roles)]),
    evidence_classes: unique(array(binding?.evidence_classes ?? binding?.evidence_class)),
    observed_at: timestamp.observedAt ?? null,
    review_due_at: timestamp.reviewDueAt ?? null,
    external_approval_required: externalApproval.required.length > 0,
    external_approval_bound: externalApproval.required.length > 0 && externalApproval.pass
  };
}

export function buildPurposeRightsIndex(preflight, sourceIds, purpose = 'CURRENT_SOLD_TRANSACTION', asOf = new Date()) {
  if (!preflight || typeof preflight !== 'object' || !Array.isArray(preflight.rows)) {
    throw new Error('PURPOSE_RIGHTS_PREFLIGHT_LEDGER_INVALID');
  }
  const rows = new Map(preflight.rows.map(row => [row.source_id, row]));
  const index = new Map();
  for (const sourceId of sourceIds) {
    const row = rows.get(sourceId);
    const result = row
      ? classifyPurposeRights(row, purpose, asOf)
      : {
          purpose,
          decision: RIGHTS_HOLD,
          eligible_for_acquisition_or_adapter_backlog: false,
          reason_codes: ['SOURCE_MISSING_FROM_PURPOSE_RIGHTS_PREFLIGHT_LEDGER'],
          evidence_refs: [],
          evidence_digest: null,
          purpose_binding_id: null,
          source_roles: [],
          evidence_classes: [],
          observed_at: null,
          review_due_at: null,
          external_approval_required: false,
          external_approval_bound: false
        };
    index.set(sourceId, { source_id: sourceId, ...result });
  }
  return index;
}
