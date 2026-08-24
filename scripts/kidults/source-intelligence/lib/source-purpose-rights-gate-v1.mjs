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

const token = (value) => String(value ?? '').trim().toUpperCase();
const hasPositive = (value, values) => values.has(token(value));
const array = (value) => Array.isArray(value) ? value : [];
const refs = (row) => array(row?.evidence_refs ?? row?.rights_evidence_refs ?? row?.rights?.evidence_refs)
  .filter((value) => typeof value === 'string' && value.length > 0);

function fieldPurposeRightsPass(row) {
  if (row?.field_purpose_rights_verified === true || row?.purpose_specific_rights_verified === true) return true;
  if (token(row?.field_purpose_rights_state) === 'PASS' || token(row?.purpose_rights_state) === 'PASS') return true;
  const purpose = row?.purpose_rights;
  if (!purpose || typeof purpose !== 'object') return false;
  return ['collect', 'store', 'derive'].every((key) => hasPositive(purpose[key], POSITIVE_FIELD_RIGHTS));
}

function commercialReusePass(row) {
  if (row?.commercial_reuse_authorized === true || row?.commercial_use_authorized === true) return true;
  return ['commercial_use_state', 'commercial_reuse_state', 'commercial_rights_state']
    .some((key) => hasPositive(row?.[key], POSITIVE_RIGHTS));
}

function accessPass(row) {
  if (row?.access_authorized === true || row?.authorized_access === true) return true;
  return hasPositive(row?.access_state, POSITIVE_ACCESS) || hasPositive(row?.access_mode, POSITIVE_ACCESS);
}

/**
 * Decide whether a source is eligible to enter an acquisition/adapter backlog.
 * This is intentionally stricter than a runtime admission check: no source with
 * unknown, conditional, paid-but-unapproved, or permission-pending rights may
 * consume implementation priority. Discovery metadata remains candidate-only.
 */
export function classifyPurposeRights(row, purpose = 'CURRENT_SOLD_TRANSACTION') {
  const reasons = [];
  const rightsState = token(row?.rights_state ?? row?.rights_decision ?? row?.rights?.decision);
  const activationState = token(row?.activation_state);
  const blocker = token(row?.blocker ?? row?.blocking_reason);
  const explicitBlocker = /UNKNOWN|DENY|HOLD|CONDITIONAL|PENDING|REQUIRED|PROHIBIT|LOGIN|PAY|SPEND|ACCOUNT|CREDENTIAL|WAF|ROBOTS|SCRAP|TERMS/.test(
    `${rightsState} ${activationState} ${blocker}`
  );

  if (!hasPositive(rightsState, POSITIVE_RIGHTS) || explicitBlocker) reasons.push('RIGHTS_DECISION_NOT_EXPLICIT_PURPOSE_PASS');
  if (!fieldPurposeRightsPass(row)) reasons.push('FIELD_PURPOSE_COLLECT_STORE_DERIVE_RIGHTS_NOT_VERIFIED');
  if (!commercialReusePass(row)) reasons.push('COMMERCIAL_REUSE_RIGHT_NOT_EXPLICIT');
  if (!accessPass(row)) reasons.push('AUTHORIZED_ACCESS_NOT_EXPLICIT');
  if (refs(row).length === 0) reasons.push('RIGHTS_EVIDENCE_REFERENCE_MISSING');

  return {
    purpose,
    decision: reasons.length === 0 ? RIGHTS_CLEAR : RIGHTS_HOLD,
    eligible_for_acquisition_or_adapter_backlog: reasons.length === 0,
    reason_codes: [...new Set(reasons)].sort(),
    evidence_refs: refs(row)
  };
}

export function buildPurposeRightsIndex(preflight, sourceIds, purpose = 'CURRENT_SOLD_TRANSACTION') {
  if (!preflight || typeof preflight !== 'object' || !Array.isArray(preflight.rows)) {
    throw new Error('PURPOSE_RIGHTS_PREFLIGHT_LEDGER_INVALID');
  }
  const rows = new Map(preflight.rows.map((row) => [row.source_id, row]));
  const index = new Map();
  for (const sourceId of sourceIds) {
    const row = rows.get(sourceId);
    const result = row
      ? classifyPurposeRights(row, purpose)
      : {
          purpose,
          decision: RIGHTS_HOLD,
          eligible_for_acquisition_or_adapter_backlog: false,
          reason_codes: ['SOURCE_MISSING_FROM_PURPOSE_RIGHTS_PREFLIGHT_LEDGER'],
          evidence_refs: []
        };
    index.set(sourceId, { source_id: sourceId, ...result });
  }
  return index;
}
