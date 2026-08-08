export function authorizeAction(policy, action) {
  const deny = (reason) => ({ allowed: false, reason });
  const allow = (reason = 'authorized') => ({ allowed: true, reason });

  const tier = policy?.riskTiers?.[action?.risk];
  if (!tier) return deny('unknown-risk-tier');

  const adapter = policy?.adapters?.[action?.adapter];
  if (!adapter?.enabled) return deny('unknown-or-disabled-adapter');

  const limits = policy?.limits?.[action.risk];
  if (!limits) return deny('missing-risk-limits');

  if ((action.estimatedCostUsd ?? 0) > limits.maxCostUsd) return deny('cost-limit-exceeded');
  if ((action.blastRadius ?? 0) > limits.maxBlastRadius) return deny('blast-radius-limit-exceeded');

  const isMutation = Boolean(action.mutation);
  const isProduction = action.environment === 'production';

  if (isMutation && policy.globalRequirements.mutationRequiresPreflight && !action.preflightPassed) {
    return deny('mutation-preflight-required');
  }

  if (adapter.preflightRequired && !action.preflightPassed) return deny('adapter-preflight-required');
  if (adapter.nonInteractiveRequired && action.interactive === true) return deny('interactive-execution-forbidden');

  if (isProduction && policy.globalRequirements.productionRequiresRollback && !action.rollbackReady) {
    return deny('production-rollback-required');
  }

  if (isProduction && policy.globalRequirements.productionRequiresCanary && !action.canaryPassed) {
    return deny('production-canary-required');
  }

  if (action.risk === 'R4') {
    if (!action.humanApproved) return deny('human-approval-required');
  } else if (tier.humanApprovalRequired && !action.humanApproved) {
    return deny('human-approval-required');
  }

  if (policy.globalRequirements.successRequiresEvidence && !action.evidenceContract) {
    return deny('evidence-contract-required');
  }

  return allow();
}

export function validateExecutionContract(policy, observedStages) {
  const required = policy?.executionContract ?? [];
  if (!Array.isArray(observedStages)) return { valid: false, missing: required };
  const positions = required.map((stage) => observedStages.indexOf(stage));
  const missing = required.filter((_, index) => positions[index] === -1);
  const ordered = positions.every((pos, index) => pos !== -1 && (index === 0 || pos > positions[index - 1]));
  return { valid: missing.length === 0 && ordered, missing, ordered };
}
