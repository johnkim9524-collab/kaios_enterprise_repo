const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const CHANGE_PROFILES = Object.freeze({
  WORKFLOW_ONLY: 'WORKFLOW_ONLY',
  CONTROL_PLANE: 'CONTROL_PLANE',
  CODE: 'CODE',
  STAGING_OPS: 'STAGING_OPS',
  OWNER_RESERVED: 'OWNER_RESERVED',
});

const profileRules = Object.freeze({
  [CHANGE_PROFILES.WORKFLOW_ONLY]: Object.freeze({
    required_contexts: Object.freeze([
      'KAIOS Solo Owner Preflight',
      'Validate KAIOS Foundation',
      'KIDULTS Delegated Autonomous Internal Authority V1',
      'KIDULTS Security Assurance Empirical R1',
      'KPMO PR Lifecycle Integrity V1',
    ]),
    excluded_contexts: Object.freeze([
      'Validate Production Container',
      'KIDULTS P0 Control Plane Closure v1',
      'KIDULTS Governed Landing Authorization V1',
    ]),
  }),
  [CHANGE_PROFILES.CONTROL_PLANE]: Object.freeze({
    required_contexts: Object.freeze([
      'KAIOS Solo Owner Preflight',
      'Validate KAIOS Foundation',
      'KIDULTS Delegated Autonomous Internal Authority V1',
      'KIDULTS P0 Control Plane Closure v1',
      'KIDULTS Security Assurance Empirical R1',
      'KPMO PR Lifecycle Integrity V1',
    ]),
    excluded_contexts: Object.freeze([
      'Validate Production Container',
      'KIDULTS Governed Landing Authorization V1',
    ]),
  }),
  [CHANGE_PROFILES.CODE]: Object.freeze({
    required_contexts: Object.freeze([
      'KAIOS Solo Owner Preflight',
      'Validate KAIOS Foundation',
      'Validate Production Container',
      'KIDULTS Security Assurance Empirical R1',
      'KPMO PR Lifecycle Integrity V1',
    ]),
    excluded_contexts: Object.freeze([
      'KIDULTS P0 Control Plane Closure v1',
      'KIDULTS Governed Landing Authorization V1',
    ]),
  }),
  [CHANGE_PROFILES.STAGING_OPS]: Object.freeze({
    required_contexts: Object.freeze([
      'KAIOS Solo Owner Preflight',
      'Validate KAIOS Foundation',
      'KIDULTS Delegated Autonomous Internal Authority V1',
      'KIDULTS P0 Control Plane Closure v1',
      'KIDULTS Security Assurance Empirical R1',
      'KPMO PR Lifecycle Integrity V1',
      'KIDULTS Governed Landing Authorization V1',
    ]),
    excluded_contexts: Object.freeze([
      'Validate Production Container',
    ]),
  }),
});

const WORKFLOW_ONLY_PATHS = Object.freeze([
  /^\.github\/workflows\//,
  /^tests\/kidults\/staging-operations\/autonomous-dispatcher-v1\.test\.[cm]?js$/,
  /^scripts\/kidults\/kpmo\/run-autonomous-dispatcher-v1\.mjs$/,
]);
const CONTROL_PLANE_PATHS = Object.freeze([
  /^\.github\/workflows\//,
  /^coordination\/kidults\/kpmo\//,
  /^scripts\/kidults\/kpmo\//,
  /^services\/kidults-control-plane\//,
  /^tests\/kidults\/kpmo\//,
  /^tests\/kidults\/staging-operations\//,
]);
const STAGING_OPS_PATHS = Object.freeze([
  /^infrastructure\//,
  /^infra\//,
  /^deploy\//,
  /^\.github\/workflows\/.*(?:aws|staging|deploy|cloudformation|iam).*$/i,
  /(?:^|\/)(?:cloudformation|iam|aws|staging)(?:\/|[-_])/i,
]);
const OWNER_RESERVED_PATHS = Object.freeze([
  /^(?:production|public|g5|secrets)\//i,
  /^CONSTITUTION\.md$/i,
  /^coordination\/kidults\/governance\/(?:delegated-autonomous-internal-authority-policy|autonomous-internal-landing-policy|autonomous-approval-policy-envelope|github-oidc-subject-customization|autonomous-workload-identity-registry)-v\d+\.json$/i,
]);

const normalize = path => {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('..')) {
    throw new Error('CHANGE_PROFILE_PATH_INVALID');
  }
  return path.replaceAll('\\', '/');
};

const matchesAny = (path, rules) => rules.some(rule => rule.test(path));

export function profileRule(profile) {
  const rule = profileRules[profile];
  if (!rule) throw new Error('CHANGE_PROFILE_UNKNOWN');
  return {required_contexts: [...rule.required_contexts], excluded_contexts: [...rule.excluded_contexts]};
}

export function classifyChangeProfile(files) {
  const paths = [...new Set((files || []).map(value => normalize(
    typeof value === 'string' ? value : value?.filename,
  )))].sort();
  if (!paths.length) throw new Error('CHANGE_PROFILE_EMPTY');

  if (paths.some(path => matchesAny(path, OWNER_RESERVED_PATHS))) {
    return {
      profile: CHANGE_PROFILES.OWNER_RESERVED,
      paths,
      reason: 'OWNER_RESERVED_PATH',
      ...profileRule(CHANGE_PROFILES.CODE),
      owner_action: 'HOLD_FOR_OWNER',
    };
  }
  if (paths.every(path => matchesAny(path, WORKFLOW_ONLY_PATHS))) {
    return {
      profile: CHANGE_PROFILES.WORKFLOW_ONLY,
      paths,
      reason: 'WORKFLOW_AND_DISPATCH_REGRESSION_ONLY',
      ...profileRule(CHANGE_PROFILES.WORKFLOW_ONLY),
      owner_action: 'AUTONOMOUS_INTERNAL_LANDING_ELIGIBLE',
    };
  }
  if (paths.some(path => matchesAny(path, STAGING_OPS_PATHS))) {
    return {
      profile: CHANGE_PROFILES.STAGING_OPS,
      paths,
      reason: 'STAGING_OR_INFRASTRUCTURE_EFFECT',
      ...profileRule(CHANGE_PROFILES.STAGING_OPS),
      owner_action: 'STAGING_APPROVAL_REQUIRED_PRODUCTION_HOLD',
    };
  }
  if (paths.some(path => matchesAny(path, CONTROL_PLANE_PATHS))) {
    return {
      profile: CHANGE_PROFILES.CONTROL_PLANE,
      paths,
      reason: 'CONTROL_PLANE_OR_GOVERNANCE_EFFECT',
      ...profileRule(CHANGE_PROFILES.CONTROL_PLANE),
      owner_action: 'AUTONOMOUS_INTERNAL_LANDING_ELIGIBLE',
    };
  }
  return {
    profile: CHANGE_PROFILES.CODE,
    paths,
    reason: 'APPLICATION_OR_GENERAL_CODE_EFFECT',
    ...profileRule(CHANGE_PROFILES.CODE),
    owner_action: 'AUTONOMOUS_INTERNAL_LANDING_ELIGIBLE',
  };
}

export function selectProfileRequiredContexts(classification, availableContexts = []) {
  if (!classification || !Object.values(CHANGE_PROFILES).includes(classification.profile)) {
    throw new Error('CHANGE_PROFILE_CLASSIFICATION_REQUIRED');
  }
  const available = new Set((availableContexts || []).map(value => String(value.context ?? value)));
  const required = classification.required_contexts.filter(context => available.size === 0 || available.has(context));
  const missing = classification.required_contexts.filter(context => available.size > 0 && !available.has(context));
  return {required_contexts: required, missing_contexts: missing, skipped_contexts: classification.excluded_contexts};
}

export function assertExactBinding({baseSha, headSha, treeSha} = {}) {
  for (const [name, value] of [['base', baseSha], ['head', headSha], ['tree', treeSha]]) {
    if (!SHA_PATTERN.test(String(value || ''))) throw new Error(`CHANGE_PROFILE_${name.toUpperCase()}_SHA_INVALID`);
  }
  return true;
}
