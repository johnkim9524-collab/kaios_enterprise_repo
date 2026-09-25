const LANDING_CONTEXTS = new Set([
  'KIDULTS Governed Landing Authorization V1',
  'KIDULTS Atomic Landing Terminal V2',
  'KIDULTS Autonomous Internal Landing V1',
]);

export function bindRequiredGateEvidence({required, checks, statuses, headSha, fail}) {
  return required.filter(binding => !LANDING_CONTEXTS.has(binding.context)).map(binding => {
    const matchingChecks = checks.filter(value => value.name === binding.context &&
      (!binding.integration_id || Number(value.app?.id ?? value.app_id ?? 0) === binding.integration_id) &&
      value.head_sha === headSha);
    if (matchingChecks.length > 1) fail('REQUIRED_CONTEXT_AMBIGUOUS', binding.context);
    if (matchingChecks.length === 1) {
      const check = matchingChecks[0];
      if (check.status !== 'completed' || check.conclusion !== 'success') fail('REQUIRED_STATUS_NOT_GREEN', binding.context);
      return {kind:'check', id:Number(check.id), app_id:Number(check.app?.id ?? check.app_id ?? 0), context:binding.context};
    }
    // The repository's ruleset also accepts commit statuses. The ruleset owns
    // the integration binding; this code binds the exact head and status id.
    const matchingStatuses = statuses.filter(value => value.context === binding.context &&
      (!value.sha || value.sha === headSha));
    if (!matchingStatuses.length) fail('REQUIRED_CONTEXT_MISSING', binding.context);
    const status = [...matchingStatuses].sort((a,b) => Number(b.id) - Number(a.id))[0];
    if (!Number.isSafeInteger(Number(status.id)) || Number(status.id) < 1) fail('REQUIRED_STATUS_ID_INVALID', binding.context);
    if (status.state !== 'success') fail('REQUIRED_STATUS_NOT_GREEN', binding.context);
    return {kind:'status', id:Number(status.id), app_id:binding.integration_id, context:binding.context};
  });
}
