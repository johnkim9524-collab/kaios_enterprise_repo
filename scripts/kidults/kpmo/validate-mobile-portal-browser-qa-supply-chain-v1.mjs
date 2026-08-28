import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const WORKFLOW = '.github/workflows/kidults-mobile-portal-release-qa-v1.yml';
const PACKAGE = 'tooling/kidults-mobile-portal-browser-qa/package.json';
const LOCK = 'tooling/kidults-mobile-portal-browser-qa/package-lock.json';
const BUILDER = 'scripts/kidults/kpmo/build-mobile-portal-browser-qa-toolchain-receipt-v1.mjs';
const RUNNER = 'scripts/kidults/portal/capture-mobile-portal-v1.mjs';
const ARTIFACT_VALIDATOR = 'scripts/kidults/portal/validate-independent-mobile-portal-v1.mjs';
const SELF = 'scripts/kidults/kpmo/validate-mobile-portal-browser-qa-supply-chain-v1.mjs';
const CHECKOUT = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE = '820762786026740c76f36085b0efc47a31fe5020';
const UPLOAD = 'b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const EXACT_SOURCE = '${{ github.event.pull_request.head.sha || github.sha }}';
const ATTEMPT_BOUND_ARTIFACT = 'kidults-mobile-portal-public-qa-v1-${{ github.event.pull_request.head.sha || github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}';
const ACTION_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}(?:\s+#\s*.+)?$/i;

function actionRefs(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim().match(/^-?\s*uses:\s*(.+)$/i)?.[1]?.trim())
    .filter(Boolean).filter(ref => !ref.startsWith('./') && !ref.startsWith('docker://'));
}

function workflowFindings(text) {
  const findings = [];
  const require = (value, id) => { if (!value) findings.push(id); };
  const refs = actionRefs(text);
  refs.forEach(ref => require(ACTION_REF.test(ref), `MUTABLE_OR_NONFULL_ACTION_REF:${ref}`));
  require(refs.includes(`actions/checkout@${CHECKOUT} # v7.0.1`), 'CHECKOUT_PIN_DRIFT');
  require(refs.includes(`actions/setup-node@${SETUP_NODE} # v7`), 'SETUP_NODE_PIN_DRIFT');
  require(refs.includes(`actions/upload-artifact@${UPLOAD} # v6.0.0`), 'UPLOAD_PIN_DRIFT');
  require(/runs-on:\s*ubuntu-24\.04/.test(text), 'RUNNER_NOT_PINNED');
  require(/^\s*permissions:\s*\n\s*contents:\s*read\s*\n\s*pull-requests:\s*read\s*$/m.test(text), 'LEAST_PRIVILEGE_PERMISSIONS_MISSING');
  require(text.includes(`ref: ${EXACT_SOURCE}`), 'EXACT_SOURCE_CHECKOUT_MISSING');
  require(/fetch-depth:\s*2/.test(text), 'BOUNDED_DEPTH_2_REQUIRED');
  require(/persist-credentials:\s*false/.test(text), 'CREDENTIAL_PERSISTENCE_FORBIDDEN');
  require(text.includes(`EXPECTED_SHA: ${EXACT_SOURCE}`), 'EXPECTED_SHA_BINDING_MISSING');
  require(text.includes(`SOURCE_SHA: ${EXACT_SOURCE}`), 'REPORT_SOURCE_SHA_BINDING_MISSING');
  require(text.includes(`node ${SELF}`), 'SELF_VALIDATION_MISSING');
  require(text.includes(`node ${ARTIFACT_VALIDATOR} --self-test`), 'ARTIFACT_PURITY_VALIDATION_MISSING');
  require(text.includes('node scripts/kidults/portal/validate-mobile-projection-client-v1.mjs'), 'PROJECTION_CLIENT_TEST_MISSING');
  require(text.includes('node scripts/kidults/portal/validate-mobile-portal-public-promotion-gate-v1.mjs --self-test'), 'PROMOTION_SELF_TEST_MISSING');
  require(text.includes('npm ci --prefix /tmp/kidults-mobile-qa --ignore-scripts --no-audit --no-fund'), 'NPM_CI_LOCKED_INSTALL_MISSING');
  require(text.includes('node /tmp/kidults-mobile-qa/node_modules/playwright/cli.js install --with-deps chromium webkit'), 'PINNED_BROWSER_INSTALL_MISSING');
  require(text.includes(`run: node ${RUNNER}`), 'BROWSER_RUNNER_MISSING');
  require(text.includes(`node ${BUILDER} /tmp/kidults-mobile-qa/toolchain-receipt.json`), 'TOOLCHAIN_BUILDER_MISSING');
  require(/- name:\s*Build exact toolchain receipt\s*\n\s*if:\s*always\(\)/.test(text), 'TOOLCHAIN_FAILURE_RECEIPT_NOT_ALWAYS');
  require(text.includes(`name: ${ATTEMPT_BOUND_ARTIFACT}`), 'ARTIFACT_IDENTITY_NOT_ATTEMPT_BOUND');
  require((text.match(/\$\{\{ github\.run_id \}\}/g) || []).length >= 1, 'ARTIFACT_RUN_ID_BINDING_MISSING');
  require((text.match(/\$\{\{ github\.run_attempt \}\}/g) || []).length >= 1, 'ARTIFACT_RUN_ATTEMPT_BINDING_MISSING');
  require(text.includes("const surfacePaths=['apps/kidults-mobile-portal/'];"), 'SURFACE_PATH_NOT_DEDICATED_APP');
  require((text.match(/changed=files\.some\(file=>\[file\.filename,file\.previous_filename\]\.filter\(Boolean\)\.some\(isPortalSurface\)\)/g) || []).length === 1, 'PR_SURFACE_DETECTION_DRIFT');
  require((text.match(/changed=files\.some\(isPortalSurface\)/g) || []).length === 1, 'PUSH_SURFACE_DETECTION_DRIFT');
  require(text.includes('validate-mobile-portal-public-promotion-gate-v1.mjs --promotion'), 'PROMOTION_MODE_MISSING');
  require(text.includes('validate-mobile-portal-public-promotion-gate-v1.mjs --contract'), 'CONTRACT_MODE_MISSING');
  require(text.includes("throw new Error('PUSH_COMMIT_FILE_LIST_TRUNCATED')"), 'PUSH_TRUNCATION_FAIL_CLOSE_MISSING');
  require(!/\bworkflow_dispatch\s*:/.test(text), 'MANUAL_DISPATCH_FALSE_GREEN');
  require(!/pull_request_target\s*:/.test(text), 'PULL_REQUEST_TARGET_FORBIDDEN');
  require(!/continue-on-error\s*:\s*true/.test(text), 'CONTINUE_ON_ERROR_FORBIDDEN');
  require(!/\bsecrets\s*\.|\bsecrets\s*\[|secrets\s*:\s*inherit/.test(text), 'SECRET_CONTEXT_FORBIDDEN');
  require(!/apps\/kidults-enterprise-staging|portal-r001|workspace\.html|\/workspace\b/i.test(text), 'CROSS_PRODUCT_WORKFLOW_DEPENDENCY');
  require(!/^\s*(?:run:\s*)?(?:npm\s+install|npx\b)/mi.test(text), 'MUTABLE_RUNTIME_RESOLUTION_FORBIDDEN');
  return [...new Set(findings)];
}

function stableDependencies(record) {
  return Object.fromEntries(Object.entries({ ...(record.dependencies || {}), ...(record.devDependencies || {}) }).sort(([a], [b]) => a.localeCompare(b)));
}

function lockFindings(pkg, lock) {
  const findings = [];
  const require = (value, id) => { if (!value) findings.push(id); };
  require(pkg.name === 'kidults-mobile-portal-browser-qa', 'PACKAGE_NAME_NOT_MOBILE_ONLY');
  require(lock.name === pkg.name && lock.packages?.['']?.name === pkg.name, 'LOCK_NAME_DRIFT');
  require(lock.lockfileVersion === 3 && lock.requires === true, 'LOCK_FORMAT_INVALID');
  require(JSON.stringify(stableDependencies(pkg)) === JSON.stringify(stableDependencies(lock.packages?.[''] || {})), 'PACKAGE_LOCK_DEPENDENCY_DRIFT');
  require(pkg.dependencies?.playwright === '1.62.1', 'PLAYWRIGHT_NOT_EXACT');
  require(pkg.dependencies?.['@axe-core/playwright'] === '4.13.0', 'AXE_NOT_EXACT');
  for (const [name, record] of Object.entries(lock.packages || {})) {
    if (!name || record.link) continue;
    require(/^https:\/\/registry\.npmjs\.org\//.test(record.resolved || ''), `LOCK_RESOLUTION_INVALID:${name}`);
    require(/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(record.integrity || ''), `LOCK_INTEGRITY_MISSING:${name}`);
  }
  return [...new Set(findings)];
}

function builderFindings(text) {
  return [
    'SOURCE_SHA_MISMATCH', 'NPM_CI_INSTALLED_TREE_LOCK_MISSING', 'INSTALLED_PACKAGE_VERSION_DRIFT',
    'INSTALLED_PACKAGE_INTEGRITY_DRIFT', 'BROWSER_QA_REPORT_NOT_PASS', 'BROWSER_QA_EXACT_13_CASES_REQUIRED',
    'LIVE_REVALIDATION_TIMEOUT_CANARY_MISSING', 'browser_qa_report_sha256', 'runner_sha256',
    'workflow_sha256', 'package_sha256', 'builder_sha256', 'supply_validator_sha256', 'failure_class',
    "public: 'HOLD'", "production: 'HOLD'", "g5: 'HOLD'",
  ].filter(marker => !text.includes(marker)).map(marker => `BUILDER_MARKER_MISSING:${marker}`);
}

function expectMutation(id, text, expected) {
  assert(workflowFindings(text).some(item => item.includes(expected)), `NEGATIVE_CANARY_NOT_REJECTED:${id}:${expected}`);
}

const workflow = fs.readFileSync(WORKFLOW, 'utf8');
const packageBytes = fs.readFileSync(PACKAGE);
const lockBytes = fs.readFileSync(LOCK);
const builder = fs.readFileSync(BUILDER, 'utf8');
const pkg = JSON.parse(packageBytes.toString('utf8'));
const lock = JSON.parse(lockBytes.toString('utf8'));
const findings = [...workflowFindings(workflow), ...lockFindings(pkg, lock), ...builderFindings(builder)];
if (findings.length) throw new Error(`MOBILE_PORTAL_QA_SUPPLY_CHAIN_INVALID:${findings.join(',')}`);

expectMutation('MUTABLE_CHECKOUT', workflow.replace(`actions/checkout@${CHECKOUT} # v7.0.1`, 'actions/checkout@v7'), 'MUTABLE_OR_NONFULL_ACTION_REF');
expectMutation('MANUAL_DISPATCH', workflow.replace('on:\n', 'on:\n  workflow_dispatch:\n'), 'MANUAL_DISPATCH_FALSE_GREEN');
expectMutation('CROSS_PRODUCT_TRIGGER', workflow.replace("      - 'apps/kidults-mobile-portal/**'", "      - 'apps/kidults-enterprise-staging/public/portal/**'"), 'CROSS_PRODUCT_WORKFLOW_DEPENDENCY');
expectMutation('SURFACE_FORCE_FALSE', workflow.replace("changed=files.some(isPortalSurface);", 'changed=false;'), 'PUSH_SURFACE_DETECTION_DRIFT');
expectMutation('ARTIFACT_VALIDATOR_REMOVAL', workflow.replace(`node ${ARTIFACT_VALIDATOR} --self-test`, 'true'), 'ARTIFACT_PURITY_VALIDATION_MISSING');
expectMutation('PROMOTION_SELF_TEST_REMOVAL', workflow.replace('node scripts/kidults/portal/validate-mobile-portal-public-promotion-gate-v1.mjs --self-test', 'true'), 'PROMOTION_SELF_TEST_MISSING');
expectMutation('CREDENTIAL_PERSIST', workflow.replace('persist-credentials: false', 'persist-credentials: true'), 'CREDENTIAL_PERSISTENCE_FORBIDDEN');
expectMutation('NPM_INSTALL', workflow.replace('npm ci --prefix /tmp/kidults-mobile-qa --ignore-scripts --no-audit --no-fund', 'npm install --prefix /tmp/kidults-mobile-qa'), 'MUTABLE_RUNTIME_RESOLUTION_FORBIDDEN');
expectMutation('PROMOTION_DOWNGRADE', workflow.replace('validate-mobile-portal-public-promotion-gate-v1.mjs --promotion', 'validate-mobile-portal-public-promotion-gate-v1.mjs --contract'), 'PROMOTION_MODE_MISSING');
expectMutation('STATIC_ARTIFACT_IDENTITY', workflow.replace(ATTEMPT_BOUND_ARTIFACT, 'kidults-mobile-portal-public-qa-v1'), 'ARTIFACT_IDENTITY_NOT_ATTEMPT_BOUND');

const lockMutation = structuredClone(lock);
delete Object.entries(lockMutation.packages).find(([name, record]) => name && !record.link)[1].integrity;
assert(lockFindings(pkg, lockMutation).some(item => item.includes('LOCK_INTEGRITY_MISSING')), 'NEGATIVE_CANARY_NOT_REJECTED:LOCK_INTEGRITY');

console.log(JSON.stringify({
  agent_id: 'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
  as_of: process.env.SOURCE_SHA ? `git:${process.env.SOURCE_SHA}` : 'LOCAL_WORKTREE',
  scope: 'INDEPENDENT_MOBILE_PORTAL_QA_SUPPLY_CHAIN',
  state: 'VERIFIED_PASS',
  workflow: WORKFLOW,
  workflow_sha256: `sha256:${crypto.createHash('sha256').update(workflow).digest('hex')}`,
  package_sha256: `sha256:${crypto.createHash('sha256').update(packageBytes).digest('hex')}`,
  lock_sha256: `sha256:${crypto.createHash('sha256').update(lockBytes).digest('hex')}`,
  negative_canaries_rejected: 11,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  autonomous_effect: 'Dedicated mobile changes trigger the exact-head QA without the enterprise portal workflow.',
  global_effect: 'Pinned Chromium and WebKit dependencies support the declared mobile viewport matrix.',
  irreplaceable_value_effect: 'KIDULTS owns the workflow, runner, lock, validator, and receipts.',
  transparency_effect: 'The validator binds every executable QA dependency and rejects cross-product triggers and unbound rerun artifact identity.'
}, null, 2));
