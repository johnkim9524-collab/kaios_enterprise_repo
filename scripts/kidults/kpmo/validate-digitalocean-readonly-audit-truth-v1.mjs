import fs from 'node:fs';

const workflowPath = '.github/workflows/digitalocean-readonly-audit.yml';
const auditPath = 'scripts/operations/digitalocean_readonly_audit.py';
const docPath = 'docs/operations/digitalocean-readonly-integration-review-v1.md';

const expectedActions = new Map([
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-python', '5fda3b95a4ea91299a34e894583c3862153e4b97'],
  ['actions/upload-artifact', 'b7c566a772e6b6bfb58ed0dc250532a479d7789f'],
]);

function externalActionRefs(text) {
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)(?:\s+#.*)?$/);
    if (match) refs.push({ action: match[1], ref: match[2] });
  }
  return refs;
}

function violationsFor({ workflow, audit, doc }) {
  const violations = [];

  if (!/runs-on:\s*ubuntu-24\.04/.test(workflow)) violations.push('runner-not-pinned-ubuntu-24.04');
  if (!/ref:\s*\$\{\{\s*github\.sha\s*\}\}/.test(workflow)) violations.push('checkout-not-exact-trigger-sha');
  if (!/persist-credentials:\s*false/.test(workflow)) violations.push('checkout-credentials-persisted');

  const actionRefs = externalActionRefs(workflow);
  for (const { action, ref } of actionRefs) {
    if (!/^[0-9a-f]{40}$/.test(ref)) violations.push(`mutable-action-ref:${action}@${ref}`);
    const expected = expectedActions.get(action);
    if (expected && ref !== expected) violations.push(`unexpected-action-sha:${action}@${ref}`);
  }
  for (const [action, expected] of expectedActions) {
    if (!actionRefs.some(item => item.action === action && item.ref === expected)) {
      violations.push(`required-action-missing:${action}@${expected}`);
    }
  }

  const mainGuard = workflow.indexOf('test "$GITHUB_REF" = "refs/heads/main"');
  const secretUse = workflow.indexOf('DIGITALOCEAN_READ_TOKEN: ${{ secrets.DIGITALOCEAN_READ_TOKEN }}');
  if (mainGuard < 0) violations.push('main-ref-guard-missing');
  if (secretUse < 0) violations.push('digitalocean-secret-use-missing');
  if (mainGuard >= 0 && secretUse >= 0 && mainGuard > secretUse) violations.push('main-ref-guard-after-secret-consumption');
  if (/workflow_dispatch:\s*\n\s+inputs:/m.test(workflow)) violations.push('manual-target-input-reintroduced');
  if (!/KIDULTS_MONITORED_BASE_URL:\s*https:\/\/kaios\.kidults\.com/.test(workflow)) violations.push('canonical-runtime-target-not-hard-locked');

  if (!audit.includes('CANONICAL_BASE_URL = "https://kaios.kidults.com"')) violations.push('canonical-base-constant-missing');
  if (!audit.includes('CANONICAL_HOSTNAME = "kaios.kidults.com"')) violations.push('canonical-host-constant-missing');
  if (!audit.includes('class NoRedirectHandler')) violations.push('redirect-fail-close-missing');
  if (!audit.includes('open_no_redirect')) violations.push('no-redirect-open-path-missing');
  if (!audit.includes('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY')) violations.push('independent-observation-state-missing');
  if (!audit.includes('"runtime_droplet_binding_verified": False')) violations.push('runtime-droplet-binding-not-explicit-false');
  if (!audit.includes('"binding_method": "NONE"')) violations.push('binding-method-not-none');
  if (audit.includes('READ_ONLY_CONNECTION_VERIFIED')) violations.push('false-connection-verification-claim-in-audit');

  if (!doc.includes('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY')) violations.push('truth-safe-doc-state-missing');
  if (!doc.includes('runtime_droplet_binding_verified=false')) violations.push('doc-binding-false-missing');
  if (!doc.includes('binding_method=NONE')) violations.push('doc-binding-method-none-missing');
  if (doc.includes('READ_ONLY_CONNECTION_VERIFIED')) violations.push('false-connection-verification-claim-in-doc');

  return violations;
}

const base = {
  workflow: fs.readFileSync(workflowPath, 'utf8'),
  audit: fs.readFileSync(auditPath, 'utf8'),
  doc: fs.readFileSync(docPath, 'utf8'),
};

const baselineViolations = violationsFor(base);
if (baselineViolations.length) {
  console.error(JSON.stringify({ suite: 'DIGITALOCEAN_READONLY_AUDIT_TRUTH_V1', result: 'FAIL', violations: baselineViolations }, null, 2));
  process.exit(1);
}

const mutationCases = [
  {
    id: 'mutable-checkout',
    mutate: x => ({ ...x, workflow: x.workflow.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7') }),
  },
  {
    id: 'moving-runner',
    mutate: x => ({ ...x, workflow: x.workflow.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest') }),
  },
  {
    id: 'remove-main-ref-guard',
    mutate: x => ({ ...x, workflow: x.workflow.replace('test "$GITHUB_REF" = "refs/heads/main"', 'echo main-ref-check-disabled') }),
  },
  {
    id: 'reintroduce-manual-target-input',
    mutate: x => ({ ...x, workflow: x.workflow.replace('workflow_dispatch:', 'workflow_dispatch:\n    inputs:\n      base_url:\n        required: false') }),
  },
  {
    id: 'reintroduce-false-connection-claim',
    mutate: x => ({ ...x, audit: x.audit.replace('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY', 'READ_ONLY_CONNECTION_VERIFIED') }),
  },
  {
    id: 'claim-binding-verified',
    mutate: x => ({ ...x, audit: x.audit.replace('"runtime_droplet_binding_verified": False', '"runtime_droplet_binding_verified": True') }),
  },
  {
    id: 'remove-no-redirect-handler',
    mutate: x => ({ ...x, audit: x.audit.replace('class NoRedirectHandler', 'class RedirectHandlerDisabled') }),
  },
  {
    id: 'doc-false-binding-state',
    mutate: x => ({ ...x, doc: x.doc.replace('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY', 'READ_ONLY_CONNECTION_VERIFIED') }),
  },
];

for (const { id, mutate } of mutationCases) {
  const findings = violationsFor(mutate(base));
  if (findings.length === 0) {
    console.error(`FAIL mutation not detected: ${id}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  suite: 'DIGITALOCEAN_READONLY_AUDIT_TRUTH_V1',
  result: 'PASS',
  mutation_cases_detected: mutationCases.length,
  canonical_runtime_target: 'https://kaios.kidults.com',
  runtime_droplet_binding_verified: false,
  binding_method: 'NONE',
  workflow_ref_boundary: 'MAIN_ONLY_BEFORE_SECRET_CONSUMPTION',
  action_provenance: 'IMMUTABLE_SHA',
  runner: 'ubuntu-24.04',
  remote_execution_performed_by_validator: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
