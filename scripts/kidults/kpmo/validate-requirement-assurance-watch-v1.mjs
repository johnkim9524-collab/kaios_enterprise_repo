#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');
const fail = message => { throw new Error(message); };
const count = (text, marker) => text.split(marker).length - 1;

function extractStep(text, name) {
  const marker = `      - name: ${name}\n`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`STEP_MISSING:${name}`);
  const next = text.indexOf('\n      - name:', start + marker.length);
  const upload = text.indexOf('\n      - uses:', start + marker.length);
  const ends = [next, upload].filter(value => value >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
}

function validate(text) {
  const watch = "      - 'KIDULTS ASI Requirement-to-Adapter Coverage v1'";
  if (count(text, watch) !== 1) fail('REQUIREMENT_WATCH_CARDINALITY_NOT_ONE');
  const block = extractStep(text, 'Validate exact Requirement Coverage upstream evidence binding');
  const required = [
    "if: github.event_name == 'workflow_run' && github.event.workflow_run.name == 'KIDULTS ASI Requirement-to-Adapter Coverage v1'",
    'GH_TOKEN: ${{ github.token }}',
    'REQUIREMENT_UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}',
    'REQUIREMENT_UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}',
    'REQUIREMENT_UPSTREAM_CONCLUSION: ${{ github.event.workflow_run.conclusion }}',
    '^(success|failure|cancelled|timed_out|action_required|neutral|skipped|stale)$',
    '/actions/runs/${REQUIREMENT_UPSTREAM_RUN_ID}',
    '.name=="KIDULTS ASI Requirement-to-Adapter Coverage v1"',
    '.path==".github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml"',
    '.repository.full_name==$repo',
    '.head_branch=="main"',
    'and .head_sha==$sha',
    '.status=="completed"',
    '.conclusion==$conclusion',
    '/actions/runs/${REQUIREMENT_UPSTREAM_RUN_ID}/artifacts?per_page=100',
    'kidults-asi-requirement-adapter-coverage-v1',
    'test "$REQUIREMENT_ARTIFACT_COUNT" -eq 1',
    'test "$REQUIREMENT_ARTIFACT_COUNT" -eq 0',
    '[[ "$REQUIREMENT_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]',
    'REQUIREMENT_BINDING_STATUS=VERIFIED_PASS',
    'REQUIREMENT_BINDING_STATUS=VERIFIED_FAIL',
    '--arg status "$REQUIREMENT_BINDING_STATUS"',
    '{status:$status',
    'if [ "$REQUIREMENT_UPSTREAM_CONCLUSION" != success ]; then',
    'exit 1'
  ];
  for (const marker of required) if (!block.includes(marker)) fail(`REQUIREMENT_MARKER_MISSING:${marker}`);
  if (block.includes('{status:"VERIFIED_PASS"')) fail('REQUIREMENT_HARD_CODED_PASS_FORBIDDEN');
  const header = text.match(/jobs:\n  audit:\n([\s\S]*?)\n    runs-on:/)?.[1] || '';
  if (/workflow_run\.conclusion\s*==\s*['"]success['"]/.test(header)) fail('SUCCESS_ONLY_FILTER_FORBIDDEN');
}

validate(source);

const block = extractStep(source, 'Validate exact Requirement Coverage upstream evidence binding');
const mutations = [
  ['GH_TOKEN: ${{ github.token }}\n', ''],
  ['.path==".github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml"', '.path!=".github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml"'],
  ['and .head_sha==$sha', 'and .head_sha!=$sha'],
  ['test "$REQUIREMENT_ARTIFACT_COUNT" -eq 1', 'test "$REQUIREMENT_ARTIFACT_COUNT" -ge 1'],
  ['REQUIREMENT_BINDING_STATUS=VERIFIED_FAIL', 'REQUIREMENT_BINDING_STATUS=VERIFIED_PASS'],
  ['{status:$status', '{status:"VERIFIED_PASS"'],
  ['exit 1', 'true']
];
for (const [from, to] of mutations) {
  if (!block.includes(from)) fail(`SELF_TEST_MARKER_MISSING:${from}`);
  const mutated = source.replace(block, block.replace(from, to));
  let rejected = false;
  try { validate(mutated); } catch { rejected = true; }
  if (!rejected) fail(`MUTATION_NOT_REJECTED:${from}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_REQUIREMENT_ASSURANCE_WATCH_V1',
  state: 'VERIFIED_PASS',
  exact_terminal_run_binding: true,
  success_failure_cancelled_observation: true,
  exact_success_artifact_cardinality_and_digest: true,
  github_cli_token_explicit: true,
  failed_upstream_fails_assurance_closed: true,
  hard_coded_pass_rejected: true,
  mutations_rejected: mutations.length,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
