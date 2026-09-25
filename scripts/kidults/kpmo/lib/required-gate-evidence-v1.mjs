const integrationId = value => {
  const direct = Number(value.app?.id ?? value.app_id ?? 0);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const match = String(value.avatar_url || '').match(/^https:\/\/avatars\.githubusercontent\.com\/in\/(\d+)(?:\?|$)/);
  return match ? Number(match[1]) : 0;
};

export function bindRequiredGateEvidence({required, checks, statuses, headSha, fail}) {
  return required.map(binding => {
    const matchingChecks = checks.filter(value => value.name === binding.context &&
      (!binding.integration_id || integrationId(value) === binding.integration_id) &&
      value.head_sha === headSha);
    if (matchingChecks.length > 1) fail('REQUIRED_CONTEXT_AMBIGUOUS', binding.context);
    if (matchingChecks.length === 1) {
      const check = matchingChecks[0];
      if (!Number.isSafeInteger(Number(check.id)) || Number(check.id) < 1) fail('REQUIRED_STATUS_ID_INVALID', binding.context);
      if (check.status !== 'completed' || check.conclusion !== 'success') fail('REQUIRED_STATUS_NOT_GREEN', binding.context);
      return {kind:'check', id:Number(check.id), app_id:integrationId(check), context:binding.context};
    }
    const matchingStatuses = statuses.filter(value => value.context === binding.context &&
      value.sha === headSha &&
      (!binding.integration_id || integrationId(value) === binding.integration_id));
    if (!matchingStatuses.length) fail('REQUIRED_CONTEXT_MISSING', binding.context);
    const status = [...matchingStatuses].sort((a,b) => Number(b.id) - Number(a.id))[0];
    if (!Number.isSafeInteger(Number(status.id)) || Number(status.id) < 1) fail('REQUIRED_STATUS_ID_INVALID', binding.context);
    if (status.state !== 'success') fail('REQUIRED_STATUS_NOT_GREEN', binding.context);
    return {kind:'status', id:Number(status.id), app_id:integrationId(status), context:binding.context};
  });
}
