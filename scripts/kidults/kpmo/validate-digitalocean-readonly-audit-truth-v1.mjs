import fs from 'node:fs';

const workflowPath = '.github/workflows/digitalocean-readonly-audit.yml';
const auditPath = 'scripts/operations/digitalocean_readonly_audit.py';
const docPath = 'docs/operations/digitalocean-readonly-integration-review-v1.md';
const recordPath = 'coordination/kidults/registry/runtime/records/runtime-digitalocean-readonly-audit-v1.json';

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function violationsFor({ workflow, audit, doc, record }) {
  const violations = [];

  if (!/^\s*workflow_dispatch:\s*$/m.test(workflow)) violations.push('inert-manual-request-surface-missing');
  for (const trigger of ['schedule:', 'push:', 'pull_request:', 'pull_request_target:', 'workflow_run:']) {
    if (workflow.includes(trigger)) violations.push(`autonomous-or-untrusted-trigger-present:${trigger}`);
  }
  if (!/permissions:\s*\n\s+contents:\s*read/m.test(workflow)) violations.push('contents-read-permission-missing');
  if (!/if:\s*\$\{\{\s*false\s*\}\}/.test(workflow)) violations.push('provider-job-hard-disable-missing');
  if (!/runs-on:\s*ubuntu-24\.04/.test(workflow)) violations.push('runner-not-pinned-ubuntu-24.04');

  for (const forbidden of [
    'environment:',
    'secrets.',
    'DIGITALOCEAN_READ_TOKEN',
    'DIGITALOCEAN_DROPLET_ID',
    'digitalocean_readonly_audit.py',
    'api.digitalocean.com',
    'actions/checkout@',
    'actions/setup-python@',
    'actions/upload-artifact@',
  ]) {
    if (workflow.includes(forbidden)) violations.push(`provider-execution-edge-present:${forbidden}`);
  }
  if (/workflow_dispatch:\s*\n\s+inputs:/m.test(workflow)) violations.push('manual-provider-input-reintroduced');

  if (!audit.includes('CANONICAL_BASE_URL = "https://kaios.kidults.com"')) violations.push('canonical-base-constant-missing');
  if (!audit.includes('CANONICAL_HOSTNAME = "kaios.kidults.com"')) violations.push('canonical-host-constant-missing');
  if (!audit.includes('class NoRedirectHandler')) violations.push('redirect-fail-close-missing');
  if (!audit.includes('open_no_redirect')) violations.push('no-redirect-open-path-missing');
  if (!audit.includes('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY')) violations.push('independent-observation-state-missing');
  if (occurrences(audit, '"runtime_droplet_binding_verified": False') < 2) violations.push('runtime-droplet-binding-not-explicit-false');
  if (audit.includes('"runtime_droplet_binding_verified": True')) violations.push('runtime-droplet-binding-true-claim');
  if (!audit.includes('"binding_method": "NONE"')) violations.push('binding-method-not-none');
  if (audit.includes('READ_ONLY_CONNECTION_VERIFIED')) violations.push('false-connection-verification-claim-in-audit');

  if (!doc.includes('DISABLED_PENDING_EXACT_MAIN_APPROVAL')) violations.push('approval-boundary-doc-truth-missing');
  if (!doc.includes('runtime_droplet_binding_verified=false')) violations.push('doc-binding-false-missing');
  if (!doc.includes('binding_method=NONE')) violations.push('doc-binding-method-none-missing');
  if (doc.includes('READ_ONLY_CONNECTION_VERIFIED')) violations.push('false-connection-verification-claim-in-doc');

  if (record.digitalocean_api_connection !== 'DISABLED_PENDING_EXACT_MAIN_APPROVAL') violations.push('runtime-record-provider-state-not-disabled');
  if (record.provider_credential_resolution_authorized !== false) violations.push('runtime-record-credential-authority-not-false');
  if (record.autonomous_provider_execution_authorized !== false) violations.push('runtime-record-autonomous-authority-not-false');
  if (!Array.isArray(record.required_secret_names) || record.required_secret_names.length !== 0) violations.push('runtime-record-active-secret-requirements-present');
  if (record.production_connection_authorized !== false) violations.push('runtime-record-production-authority-not-false');
  if (record.production_state !== 'HOLD') violations.push('runtime-record-production-not-hold');

  return violations;
}

const base = {
  workflow: fs.readFileSync(workflowPath, 'utf8'),
  audit: fs.readFileSync(auditPath, 'utf8'),
  doc: fs.readFileSync(docPath, 'utf8'),
  record: JSON.parse(fs.readFileSync(recordPath, 'utf8')),
};

const baselineViolations = violationsFor(base);
if (baselineViolations.length) {
  console.error(JSON.stringify({ suite: 'DIGITALOCEAN_READONLY_APPROVAL_BOUNDARY_V2', result: 'FAIL', violations: baselineViolations }, null, 2));
  process.exit(1);
}

const mutationCases = [
  {
    id: 'restore-schedule',
    mutate: x => ({ ...x, workflow: x.workflow.replace('  workflow_dispatch:', '  workflow_dispatch:\n  schedule:\n    - cron: "17 20 * * *"') }),
  },
  {
    id: 'remove-hard-disable',
    mutate: x => ({ ...x, workflow: x.workflow.replace('if: ${{ false }}', 'if: github.ref == \'refs/heads/main\'') }),
  },
  {
    id: 'restore-environment',
    mutate: x => ({ ...x, workflow: x.workflow.replace('runs-on: ubuntu-24.04', 'environment: kidults-do-readonly\n    runs-on: ubuntu-24.04') }),
  },
  {
    id: 'restore-provider-secret',
    mutate: x => ({ ...x, workflow: x.workflow.replace('shell: bash', 'env:\n          DIGITALOCEAN_READ_TOKEN: ${{ secrets.DIGITALOCEAN_READ_TOKEN }}\n        shell: bash') }),
  },
  {
    id: 'restore-provider-call',
    mutate: x => ({ ...x, workflow: x.workflow.replace('echo "DISABLED_PENDING_EXACT_MAIN_APPROVAL"', 'python scripts/operations/digitalocean_readonly_audit.py') }),
  },
  {
    id: 'claim-standing-credential-authority',
    mutate: x => ({ ...x, record: { ...x.record, provider_credential_resolution_authorized: true } }),
  },
  {
    id: 'reintroduce-false-connection-claim',
    mutate: x => ({ ...x, audit: x.audit.replace('PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY', 'READ_ONLY_CONNECTION_VERIFIED') }),
  },
  {
    id: 'remove-approval-boundary-doc',
    mutate: x => ({ ...x, doc: x.doc.replace('DISABLED_PENDING_EXACT_MAIN_APPROVAL', 'READ_ONLY_AUDIT_AVAILABLE') }),
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
  suite: 'DIGITALOCEAN_READONLY_APPROVAL_BOUNDARY_V2',
  result: 'PASS',
  mutation_cases_detected: mutationCases.length,
  active_trigger: 'INERT_WORKFLOW_DISPATCH_REQUEST_SURFACE_ONLY',
  provider_job: 'HARD_DISABLED',
  environment_resolution: 'NONE',
  credential_resolution: 'NONE',
  provider_request: 'NONE',
  runtime_droplet_binding_verified: false,
  binding_method: 'NONE',
  remote_execution_performed_by_validator: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
