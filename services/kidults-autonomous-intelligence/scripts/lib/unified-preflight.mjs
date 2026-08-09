const OUTCOME_PRIORITY = ['FAIL_CLOSED','HUMAN_APPROVAL_REQUIRED','HOLD','CANARY_ONLY','READY_WITH_LIMITS','READY'];

const DEFAULT_CRITICAL_DOMAINS = [
  'engineering','runtime','security','data','provenance','provider','product','rights','entitlement','cost','observability','recovery',
];

function normalizeStatus(value) {
  const status = String(value || 'UNKNOWN').toUpperCase();
  return ['PASS','WARN','FAIL','UNKNOWN','NOT_APPLICABLE'].includes(status) ? status : 'UNKNOWN';
}

export function evaluateUnifiedPreflight(input = {}) {
  const criticalDomains = Array.isArray(input.criticalDomains) && input.criticalDomains.length
    ? input.criticalDomains
    : DEFAULT_CRITICAL_DOMAINS;
  const domains = {};
  const reasons = [];

  for (const name of criticalDomains) {
    const raw = input.domains?.[name] || {};
    const status = normalizeStatus(raw.status);
    const critical = raw.critical !== false;
    const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter(Boolean) : [];
    const evidenceRequired = raw.evidenceRequired !== false && status !== 'NOT_APPLICABLE';
    const evidenceComplete = !evidenceRequired || evidence.length > 0;
    const effectiveStatus = evidenceComplete ? status : 'FAIL';

    domains[name] = {
      status: effectiveStatus,
      declaredStatus: status,
      critical,
      evidenceRequired,
      evidenceComplete,
      evidence,
      note: raw.note || null,
    };

    if (effectiveStatus === 'FAIL') reasons.push(`${name}:FAIL`);
    if (effectiveStatus === 'UNKNOWN') reasons.push(`${name}:UNKNOWN`);
    if (effectiveStatus === 'WARN') reasons.push(`${name}:WARN`);
  }

  const criticalFailures = Object.entries(domains)
    .filter(([, value]) => value.critical && value.status === 'FAIL')
    .map(([name]) => name);
  const criticalUnknowns = Object.entries(domains)
    .filter(([, value]) => value.critical && value.status === 'UNKNOWN')
    .map(([name]) => name);
  const warnings = Object.entries(domains)
    .filter(([, value]) => value.status === 'WARN')
    .map(([name]) => name);

  let outcome = 'READY';
  if (criticalFailures.length) outcome = 'FAIL_CLOSED';
  else if (input.humanApprovalRequired === true) outcome = 'HUMAN_APPROVAL_REQUIRED';
  else if (criticalUnknowns.length) outcome = 'HOLD';
  else if (input.liveMutationRequested === true && input.liveOperationalCertified !== true) outcome = 'CANARY_ONLY';
  else if (input.commercialUseRequested === true && input.commercialRightsCertified !== true) outcome = 'CANARY_ONLY';
  else if (warnings.length) outcome = 'READY_WITH_LIMITS';

  const allowed = ['READY','READY_WITH_LIMITS'].includes(outcome);
  const canaryAllowed = ['READY','READY_WITH_LIMITS','CANARY_ONLY'].includes(outcome);

  return {
    schemaVersion: '1.0.0',
    engine: 'KIDULTS_UNIFIED_AUTONOMOUS_PREFLIGHT',
    outcome,
    outcomeRank: OUTCOME_PRIORITY.indexOf(outcome),
    allowed,
    canaryAllowed,
    productionMutationAllowed: allowed && input.liveOperationalCertified === true,
    commercialUseAllowed: allowed && input.commercialRightsCertified === true,
    humanApprovalRequired: input.humanApprovalRequired === true,
    liveOperationalCertified: input.liveOperationalCertified === true,
    commercialRightsCertified: input.commercialRightsCertified === true,
    criticalFailures,
    criticalUnknowns,
    warnings,
    reasons,
    domains,
  };
}

export const PREFLIGHT_OUTCOMES = Object.freeze([...OUTCOME_PRIORITY]);
