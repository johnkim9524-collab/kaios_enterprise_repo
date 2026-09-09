import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml';

function validate(text) {
  const findings = [];
  const required = [
    'pull_request:',
    'validate-source-fabric-contract:',
    "if: github.event_name == 'pull_request'",
    'Validate source-fabric contracts without live provider requests',
    'source-fabric-scale-pi1:',
    "if: github.event_name != 'pull_request'",
    'Execute four governed scope rotations',
    'Emit terminal source-fabric receipt',
    'Upload terminal source-fabric packet',
    "state:priorStatus==='success'&&complete?'VERIFIED_PASS':'VERIFIED_FAIL'",
    "run_id:process.env.GITHUB_RUN_ID",
    "head_sha:process.env.EXPECTED_SHA",
    'promotion_authority:false',
    'empirical_admission_authority:false',
    'workflow_dispatch:',
    'schedule:',
    'push:',
  ];
  for (const marker of required) if (!text.includes(marker)) findings.push(`MISSING:${marker}`);
  if (!/validate-source-fabric-contract:\n    if: github\.event_name == 'pull_request'/.test(text)) {
    findings.push('PR_CONTRACT_JOB_NOT_EXACTLY_GUARDED');
  }
  if (!/source-fabric-scale-pi1:\n    if: github\.event_name != 'pull_request'/.test(text)) {
    findings.push('LIVE_RUNTIME_JOB_NOT_EXCLUDED_FROM_PR');
  }
  if (!/- name: Emit terminal source-fabric receipt\n        if: always\(\)/.test(text)) {
    findings.push('TERMINAL_RECEIPT_NOT_ALWAYS_RUN');
  }
  if (!/- name: Upload terminal source-fabric packet\n        if: always\(\)\n        uses: actions\/upload-artifact@/.test(text)) {
    findings.push('TERMINAL_ARTIFACT_NOT_ALWAYS_UPLOADED');
  }
  if (!text.includes("failure_id:priorStatus==='success'&&complete?null:'SOURCE_FABRIC_PRECEDING_STEP_FAILED_OR_PRODUCT_MISSING'")) {
    findings.push('TERMINAL_FAILURE_ID_NOT_FAIL_CLOSED');
  }
  return findings;
}

const source = fs.readFileSync(workflowPath, 'utf8');
const findings = validate(source);
if (findings.length) throw new Error(findings.join('\n'));

if (process.argv.includes('--self-test')) {
  const mutations = [
    text => text.replace("if: github.event_name == 'pull_request'", "if: github.event_name != 'pull_request'"),
    text => text.replace("if: github.event_name != 'pull_request'", "if: github.event_name == 'pull_request'"),
    text => text.replace('Validate source-fabric contracts without live provider requests', 'Execute live source-fabric discovery'),
    text => text.replace('if: always()\n        env:', 'if: success()\n        env:'),
    text => text.replace('if: always()\n        uses: actions/upload-artifact@', 'if: success()\n        uses: actions/upload-artifact@'),
    text => text.replace("?'VERIFIED_PASS':'VERIFIED_FAIL'", "?'VERIFIED_PASS':'VERIFIED_PASS'"),
    text => text.replace('run_id:process.env.GITHUB_RUN_ID', "run_id:'UNBOUND'"),
    text => text.replace('head_sha:process.env.EXPECTED_SHA', "head_sha:'UNBOUND'"),
    text => text.replace('promotion_authority:false', 'promotion_authority:true'),
  ];
  let rejected = 0;
  for (const mutate of mutations) if (validate(mutate(source)).length) rejected += 1;
  if (rejected !== mutations.length) throw new Error(`MUTATION_REJECTION_INCOMPLETE:${rejected}/${mutations.length}`);
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', mutations_rejected: rejected, external_requests_in_pr: 0 }));
} else {
  console.log(JSON.stringify({
    state: 'VERIFIED_PASS',
    pr_mode: 'STATIC_CONTRACT_VALIDATION_ONLY',
    main_runtime_mode: 'AUTONOMOUS_LIVE_DISCOVERY_WITH_FAILURE_TRUTH_PRESERVED',
    external_requests_in_pr: 0,
    empirical_gate_effect: 'NONE',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  }));
}
