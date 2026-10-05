const integrationId = value => {
  const direct = Number(value.app?.id ?? value.app_id ?? 0);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const match = String(value.avatar_url || '').match(/^https:\/\/avatars\.githubusercontent\.com\/in\/(\d+)(?:\?|$)/);
  return match ? Number(match[1]) : 0;
};

const landingContexts = new Set([
  'KIDULTS Governed Landing Authorization V1',
  'KIDULTS Atomic Landing Terminal V2',
  'KIDULTS Autonomous Internal Landing V1',
]);

export function bindRequiredGateEvidence({required, checks, statuses, headSha, fail}) {
  // Landing authorization is the output of this quorum, so it cannot be a
  // prerequisite for starting the quorum. The full required set remains bound
  // in the envelope and enforced by the protected branch ruleset.
  return required.filter(binding => !landingContexts.has(binding.context)).map(binding => {
    const matchingChecks = checks.filter(value => value.name === binding.context &&
      (!binding.integration_id || integrationId(value) === binding.integration_id) &&
      value.head_sha === headSha);
    const checkIntegrations = new Set(matchingChecks.map(integrationId));
    // GitHub legitimately creates another check-run for the same app, context,
    // and exact head when a PR moves from Draft to Ready or a workflow is
    // re-run. Bind the newest immutable run id. Different app identities remain
    // ambiguous when the ruleset does not pin an integration.
    if (checkIntegrations.size > 1) fail('REQUIRED_CONTEXT_AMBIGUOUS', binding.context);
    if (matchingChecks.length) {
      const check = [...matchingChecks].sort((a,b) => Number(b.id) - Number(a.id))[0];
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
