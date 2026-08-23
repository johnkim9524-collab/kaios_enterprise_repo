#!/usr/bin/env node

const ALLOWED_DECISIONS = new Set(['PASS', 'HOLD', 'DENY']);
const REQUIRED = [
  'provider_id',
  'field_pattern',
  'purpose',
  'decision',
  'evidence_type',
  'evidence_reference',
  'effective_at',
  'expires_at',
  'entity_scope',
  'territory_scope',
  'environment_scope'
];

function parseTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? NaN : t;
}

export function evaluateRightsPolicy({ grants = [], request, now = new Date().toISOString() }) {
  const reasonCodes = [];
  const conflicts = [];
  const matched = [];

  if (!request || !request.provider_id || !request.field || !request.purpose) {
    return { decision: 'HOLD', reason_codes: ['INVALID_REQUEST'], matched_grants: [], conflicts: [] };
  }

  const nowTs = Date.parse(now);
  for (const grant of grants) {
    const missing = REQUIRED.filter((k) => grant[k] === undefined || grant[k] === null || grant[k] === '');
    if (missing.length) continue;
    if (!ALLOWED_DECISIONS.has(grant.decision)) continue;
    if (grant.provider_id !== request.provider_id) continue;
    if (!(grant.field_pattern === '*' || grant.field_pattern === request.field)) continue;
    if (grant.purpose !== request.purpose) continue;

    const effective = parseTime(grant.effective_at);
    const expires = parseTime(grant.expires_at);
    if (Number.isNaN(effective) || Number.isNaN(expires)) continue;
    if (effective !== null && effective > nowTs) continue;
    if (expires !== null && expires < nowTs) {
      reasonCodes.push('EXPIRED_GRANT');
      continue;
    }

    const scopeChecks = [
      ['entity_scope', request.entity],
      ['territory_scope', request.territory],
      ['environment_scope', request.environment]
    ];
    let scopeMismatch = false;
    for (const [key, value] of scopeChecks) {
      const allowed = Array.isArray(grant[key]) ? grant[key] : [grant[key]];
      if (!(allowed.includes('*') || allowed.includes(value))) {
        scopeMismatch = true;
        reasonCodes.push(key === 'entity_scope' ? 'ENTITY_SCOPE_MISMATCH' : key === 'territory_scope' ? 'TERRITORY_SCOPE_MISMATCH' : 'ENVIRONMENT_SCOPE_MISMATCH');
      }
    }
    if (scopeMismatch) continue;
    matched.push(grant);
  }

  if (!matched.length) {
    if (!reasonCodes.length) reasonCodes.push('MISSING_WRITTEN_EVIDENCE');
    return { decision: 'HOLD', reason_codes: [...new Set(reasonCodes)], matched_grants: [], conflicts: [] };
  }

  const decisions = [...new Set(matched.map((g) => g.decision))];
  if (decisions.length > 1) {
    conflicts.push(...matched.map((g) => ({ evidence_reference: g.evidence_reference, decision: g.decision })));
    return { decision: 'HOLD', reason_codes: ['CONFLICTING_GRANTS'], matched_grants: matched, conflicts };
  }

  return {
    decision: decisions[0],
    reason_codes: reasonCodes.length ? [...new Set(reasonCodes)] : [],
    matched_grants: matched,
    conflicts: []
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  process.stdout.write(`${JSON.stringify(evaluateRightsPolicy(input), null, 2)}\n`);
}
