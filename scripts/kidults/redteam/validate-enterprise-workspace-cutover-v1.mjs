import fs from 'node:fs';

const policyPath = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const contractPath = 'coordination/kidults/redteam/enterprise-workspace-cutover-contract-v1.json';

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const errors = [];

const REQUIRED_GATES = [
  'CANONICAL_WORKSPACE_VALIDATOR_PASS',
  'PORTAL_VALIDATION_PASS',
  'REMOTE_STAGING_DEPLOYMENT_PROVEN',
  'CANONICAL_TARGET_DEPLOYMENT_PROVEN',
  'SOURCE_REVISION_MATCH_PASS',
  'DESKTOP_VISUAL_SMOKE_PASS',
  'MOBILE_VISUAL_SMOKE_PASS',
  'STAGING_ACCESS_CONTROL_ENFORCED',
  'SECURITY_HEADERS_PASS',
  'NOINDEX_AND_ROBOTS_PASS',
  'REAL_404_PASS',
  'SOURCE_REPOSITORY_DATA_CLASSIFICATION_PASS',
  'INTERNAL_DATA_EXCLUSION_PASS',
  'INTERACTION_AND_DEEP_LINK_PASS',
  'EMPIRICAL_METRIC_SUPPRESSION_PASS',
  'LINK_AND_ASSET_RESOLUTION_PASS',
  'FAIL_CLOSED_TRUTH_STATE_PASS',
  'NO_UNSUPPORTED_OPERATIONAL_CLAIMS_PASS',
  'ROLLBACK_TARGET_PRESERVED',
  'EXPLICIT_G5_APPROVAL_BEFORE_CUSTOM_DOMAIN_CUTOVER',
];

const REQUIRED_SEQUENCE = [
  'DEPLOY_CANONICAL_WORKSPACE_TO_REMOTE_STAGING_PROJECT',
  'VALIDATE_REMOTE_STAGING_PAGES_DOMAIN',
  'DEPLOY_APPROVED_REVISION_TO_CANONICAL_PROJECT',
  'VALIDATE_CANONICAL_PROJECT_PAGES_DOMAIN',
  'VERIFY_CANONICAL_SOURCE_REVISION',
  'CAPTURE_PRE_CUTOVER_ENTERPRISE_DOMAIN_BASELINE',
  'OBTAIN_EXPLICIT_G5_APPROVAL',
  'MOVE_ENTERPRISE_CUSTOM_DOMAIN_TO_CANONICAL_TARGET',
  'RUN_ENTERPRISE_DOMAIN_SMOKE_TEST',
  'OBSERVE_24H',
  'OBSERVE_72H_BEFORE_LEGACY_DELETE',
  'DELETE_LEGACY_KIDULTS_ENTERPRISE_PAGES_PROJECT',
  'VERIFY_LEGACY_PAGES_DOMAIN_NO_LONGER_SERVES',
  'CLOSE_ESTATE_RETIREMENT_RECORD',
];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

function requireFile(relativePath, label) {
  requireTrue(fs.existsSync(relativePath), `${label} missing: ${relativePath}`);
}

function validateExactOrderedList(actual, expected, label) {
  const listErrors = [];
  if (!Array.isArray(actual)) {
    return [`${label} must be an array.`];
  }

  for (const item of expected) {
    const count = actual.filter((candidate) => candidate === item).length;
    if (count !== 1) {
      listErrors.push(`${label} must contain ${item} exactly once; found ${count}.`);
    }
  }

  for (const item of actual) {
    if (!expected.includes(item)) {
      listErrors.push(`${label} contains unexpected item: ${item}.`);
    }
  }

  if (actual.length !== expected.length) {
    listErrors.push(`${label} length mismatch: expected ${expected.length}, found ${actual.length}.`);
  }

  for (let index = 0; index < expected.length - 1; index += 1) {
    const current = expected[index];
    const next = expected[index + 1];
    const currentIndex = actual.indexOf(current);
    const nextIndex = actual.indexOf(next);
    if (currentIndex >= 0 && nextIndex >= 0 && currentIndex >= nextIndex) {
      listErrors.push(`${label} order invalid: ${current} must precede ${next}.`);
    }
  }

  return listErrors;
}

function runMutationSelfTests() {
  const tests = [
    {
      name: 'missing-g5-approval-step',
      actual: REQUIRED_SEQUENCE.filter((step) => step !== 'OBTAIN_EXPLICIT_G5_APPROVAL'),
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
    {
      name: 'missing-72h-observation-step',
      actual: REQUIRED_SEQUENCE.filter((step) => step !== 'OBSERVE_72H_BEFORE_LEGACY_DELETE'),
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
    {
      name: 'duplicate-g5-approval-step',
      actual: [...REQUIRED_SEQUENCE, 'OBTAIN_EXPLICIT_G5_APPROVAL'],
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
    {
      name: 'domain-cutover-before-g5',
      actual: REQUIRED_SEQUENCE.map((step) => {
        if (step === 'OBTAIN_EXPLICIT_G5_APPROVAL') return 'MOVE_ENTERPRISE_CUSTOM_DOMAIN_TO_CANONICAL_TARGET';
        if (step === 'MOVE_ENTERPRISE_CUSTOM_DOMAIN_TO_CANONICAL_TARGET') return 'OBTAIN_EXPLICIT_G5_APPROVAL';
        return step;
      }),
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
    {
      name: 'missing-mobile-visual-gate',
      actual: REQUIRED_GATES.filter((gate) => gate !== 'MOBILE_VISUAL_SMOKE_PASS'),
      expected: REQUIRED_GATES,
      label: 'pre_cutover_gates',
    },
    {
      name: 'duplicate-g5-gate',
      actual: [...REQUIRED_GATES, 'EXPLICIT_G5_APPROVAL_BEFORE_CUSTOM_DOMAIN_CUTOVER'],
      expected: REQUIRED_GATES,
      label: 'pre_cutover_gates',
    },
    {
      name: 'missing-access-control-gate',
      actual: REQUIRED_GATES.filter((gate) => gate !== 'STAGING_ACCESS_CONTROL_ENFORCED'),
      expected: REQUIRED_GATES,
      label: 'pre_cutover_gates',
    },
    {
      name: 'missing-source-repository-classification-gate',
      actual: REQUIRED_GATES.filter((gate) => gate !== 'SOURCE_REPOSITORY_DATA_CLASSIFICATION_PASS'),
      expected: REQUIRED_GATES,
      label: 'pre_cutover_gates',
    },
    {
      name: 'missing-canonical-target-deployment-gate',
      actual: REQUIRED_GATES.filter((gate) => gate !== 'CANONICAL_TARGET_DEPLOYMENT_PROVEN'),
      expected: REQUIRED_GATES,
      label: 'pre_cutover_gates',
    },
    {
      name: 'missing-source-revision-step',
      actual: REQUIRED_SEQUENCE.filter((step) => step !== 'VERIFY_CANONICAL_SOURCE_REVISION'),
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
    {
      name: 'canonical-deployment-after-g5',
      actual: REQUIRED_SEQUENCE.map((step) => {
        if (step === 'DEPLOY_APPROVED_REVISION_TO_CANONICAL_PROJECT') return 'OBTAIN_EXPLICIT_G5_APPROVAL';
        if (step === 'OBTAIN_EXPLICIT_G5_APPROVAL') return 'DEPLOY_APPROVED_REVISION_TO_CANONICAL_PROJECT';
        return step;
      }),
      expected: REQUIRED_SEQUENCE,
      label: 'cutover_sequence',
    },
  ];

  requireTrue(
    validateExactOrderedList(REQUIRED_SEQUENCE, REQUIRED_SEQUENCE, 'self_test_sequence').length === 0,
    'Validator self-test rejected the canonical cutover sequence.',
  );
  requireTrue(
    validateExactOrderedList(REQUIRED_GATES, REQUIRED_GATES, 'self_test_gates').length === 0,
    'Validator self-test rejected the canonical gate list.',
  );

  for (const test of tests) {
    requireTrue(
      validateExactOrderedList(test.actual, test.expected, test.label).length > 0,
      `Validator mutation self-test accepted unsafe mutation: ${test.name}.`,
    );
  }
}

runMutationSelfTests();

requireTrue(contract.contract_id === 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1', 'Unexpected cutover contract id.');
requireTrue(contract.status === 'CUTOVER_PREPARED_PRODUCTION_HOLD', 'Cutover must remain prepared/HOLD before G5.');
requireTrue(contract.source?.project === 'kidults-enterprise', 'Legacy source project must be kidults-enterprise.');
requireTrue(contract.source?.custom_domain === 'enterprise.kidults.com', 'Enterprise custom domain mismatch.');
requireTrue(contract.source?.deletion_allowed_before_cutover === false, 'Legacy Pages deletion must be prohibited before cutover.');

requireTrue(policy.migrate_then_retire?.includes('kidults-enterprise'), 'kidults-enterprise must be MIGRATE_THEN_RETIRE.');
requireTrue(!policy.quarantine_retire_candidates?.includes('kidults-enterprise'), 'kidults-enterprise must not remain a direct quarantine/delete candidate.');
requireTrue(policy.forbidden_new_deploy_targets?.includes('kidults-enterprise'), 'Legacy project name must remain forbidden for new deployments.');

const target = contract.target || {};
requireFile(target.canonical_publish_root, 'Canonical portal publish root');
requireFile(target.canonical_workspace_entry, 'Canonical Workspace entry');
requireFile(target.workspace_contract, 'Workspace contract');
requireFile(target.workspace_validator, 'Workspace validator');
requireTrue(target.workspace_validator === 'scripts/kidults/portal/validate-workspace.mjs', 'Canonical Workspace validator path mismatch.');
requireTrue(target.staging_project === 'kidults-workspace-staging', 'Staging project must be kidults-workspace-staging.');
requireTrue(target.canonical_project === 'kidults-workspace', 'Canonical project must be kidults-workspace.');
requireTrue(target.canonical_project_state === 'NOT_YET_CREATED', 'Canonical project must remain explicitly NOT_YET_CREATED until deployed.');
requireTrue(target.staging_access_control === 'NOT_YET_ENFORCED', 'Staging access control must remain explicitly NOT_YET_ENFORCED until Cloudflare Access is empirically verified.');
requireTrue(target.source_repository_visibility === 'PUBLIC', 'Observed source repository visibility must remain explicit.');
requireTrue(
  target.internal_record_confidentiality === 'NOT_PROVIDED_BY_SOURCE_REPOSITORY',
  'Public source repository must not be represented as confidential storage for internal records.',
);
requireTrue(target.domain_cutover_target_project === target.canonical_project, 'Custom-domain cutover target must be the canonical project.');
requireTrue(target.public_portal_navigation_evidence?.canonical_url === 'https://kidults.com/', 'Canonical public portal URL mismatch.');
requireTrue(
  JSON.stringify(target.public_portal_navigation_evidence?.verified_fragment_ids) === JSON.stringify(['main', 'universe', 'intelligence', 'partners', 'trust']),
  'Public portal navigation evidence must record the currently verified fragment IDs.',
);
requireTrue(target.staging_project !== contract.source.project, 'Remote staging project must not reuse legacy project name.');
requireTrue(target.canonical_project !== contract.source.project, 'Canonical target must not reuse legacy project name.');
requireTrue(!policy.forbidden_new_deploy_targets?.includes(target.staging_project), 'Staging project is forbidden by estate policy.');
requireTrue(!policy.forbidden_new_deploy_targets?.includes(target.canonical_project), 'Canonical project is forbidden by estate policy.');
requireTrue(
  [
    'NOT_YET_PROVEN',
    'EMPIRICALLY_PROVEN_PRIOR_REVISION',
    'EMPIRICALLY_PROVEN_WITH_CURRENT_REVISION_PENDING',
  ].includes(target.remote_staging_deployment),
  'Remote staging deployment state must remain bounded to observed evidence and current-revision revalidation.',
);
if (target.remote_staging_evidence !== undefined) {
  requireTrue(
    typeof target.remote_staging_evidence === 'object' &&
      typeof target.remote_staging_evidence?.observed_revision === 'string' &&
      target.remote_staging_evidence.observed_revision.trim().length > 0,
    'Remote staging evidence must record a non-empty observed_revision when present.',
  );
  if (target.remote_staging_deployment === 'EMPIRICALLY_PROVEN_PRIOR_REVISION') {
    requireTrue(
      target.remote_staging_evidence?.current_revision_revalidation === 'REQUIRED_AFTER_MERGE',
      'Prior-revision staging evidence must explicitly require current-revision revalidation after merge.',
    );
  }
}
requireTrue(target.custom_domain_cutover === 'NOT_AUTHORIZED', 'Custom-domain cutover must remain unauthorized before G5.');
requireTrue(target.production_public === 'HOLD_EXPLICIT_G5_APPROVAL_REQUIRED', 'Production/Public must remain explicit-G5 HOLD.');

const workspaceContract = JSON.parse(fs.readFileSync(target.workspace_contract, 'utf8'));
requireTrue(workspaceContract.truth_rules?.allow_data_mutation === false, 'Canonical Workspace must prohibit data mutation.');
requireTrue(workspaceContract.truth_rules?.allow_registry_mutation === false, 'Canonical Workspace must prohibit Registry mutation.');
requireTrue(workspaceContract.truth_rules?.preserve_fail_closed_states === true, 'Canonical Workspace must preserve fail-closed states.');

const workspaceHtml = fs.readFileSync(target.canonical_workspace_entry, 'utf8');
for (const marker of ['data-page="workspace"', 'data-workspace-context', 'data-workspace-mount', 'KIDULTS Intelligence Workspace']) {
  requireTrue(workspaceHtml.includes(marker), `Canonical Workspace entry missing marker: ${marker}`);
}

const publishRoot = target.canonical_publish_root;
const portalIndexPath = `${publishRoot}/index.html`;
const headersPath = `${publishRoot}/_headers`;
const robotsPath = `${publishRoot}/robots.txt`;
const notFoundPath = `${publishRoot}/404.html`;
requireFile(portalIndexPath, 'Canonical portal entry');
requireFile(headersPath, 'Pages security headers');
requireFile(robotsPath, 'Robots policy');
requireFile(notFoundPath, 'Real Pages 404 document');
for (const retiredArtifact of ['deploy-v656.txt', 'deploy-v657.txt', 'deploy-v660.txt']) {
  requireTrue(
    !fs.existsSync(`${publishRoot}/${retiredArtifact}`),
    `Retired deployment marker must not remain in the public publish root: ${retiredArtifact}`,
  );
}

const portalIndex = fs.existsSync(portalIndexPath) ? fs.readFileSync(portalIndexPath, 'utf8') : '';
const headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : '';
const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, 'utf8') : '';

for (const [label, html] of [['Workspace', workspaceHtml], ['Portal', portalIndex], ['404', notFound]]) {
  requireTrue(
    /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*nofollow[^"']*["']/i.test(html),
    `${label} must declare noindex,nofollow.`,
  );
}

for (const marker of [
  "Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
  'X-Robots-Tag: noindex, nofollow, noarchive',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy: same-origin',
]) {
  requireTrue(headers.includes(marker), `Pages security headers missing marker: ${marker}`);
}
requireTrue(/^User-agent:\s*\*$/im.test(robots), 'robots.txt must address all crawlers.');
requireTrue(/^Disallow:\s*\/$/im.test(robots), 'robots.txt must disallow the entire staging surface.');

for (const href of [
  'https://kidults.com/',
  'https://kidults.com/#main',
  'https://kidults.com/#universe',
  'https://kidults.com/#intelligence',
  'https://kidults.com/#partners',
  'https://kidults.com/#trust',
]) {
  requireTrue(workspaceHtml.includes(`href="${href}"`), `Workspace canonical public link missing: ${href}`);
}
requireTrue(!/href=["'](?:\.\/)?index\.html(?:#|["'])/i.test(workspaceHtml), 'Workspace must not use local index.html links that rewrite back to Workspace.');

const risks = contract.source?.observed_risks || {};
requireTrue(risks.raw_javascript_text_visible_in_ui === true, 'Observed raw-JS legacy risk must remain recorded until retirement.');
requireTrue(risks.legacy_operational_claims_visible === true, 'Observed legacy operational-claim risk must remain recorded until retirement.');

errors.push(...validateExactOrderedList(contract.pre_cutover_gates, REQUIRED_GATES, 'pre_cutover_gates'));
errors.push(...validateExactOrderedList(contract.cutover_sequence, REQUIRED_SEQUENCE, 'cutover_sequence'));

requireTrue(contract.rollback?.required === true, 'Rollback must be mandatory.');
requireTrue(contract.rollback?.legacy_project_must_remain_intact_until === 'POST_CUTOVER_72H_PASS', 'Legacy Pages must remain intact through 72h post-cutover observation.');
requireTrue(contract.rollback?.data_store_deletion === 'NOT_AUTHORIZED', 'Data-store deletion must not be authorized by this cutover contract.');

if (errors.length) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1',
    result: 'FAIL',
    errors,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1',
  result: 'PASS',
  mutation_self_tests: 11,
  source_state: contract.source.remote_observed_state,
  target_remote_staging: contract.target.remote_staging_deployment,
  production_public: contract.target.production_public,
  legacy_delete: 'BLOCKED_UNTIL_POST_CUTOVER_72H_PASS',
}, null, 2));
