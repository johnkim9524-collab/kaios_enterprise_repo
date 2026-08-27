#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');
const fail = (message) => { throw new Error(message); };

function validate(source) {
  const required = [
    "      - 'KIDULTS ASI SHADOW Operating Evidence v1'",
    '- name: Validate exact ASI SHADOW upstream evidence binding',
    "if: github.event_name == 'workflow_run' && github.event.workflow_run.name == 'KIDULTS ASI SHADOW Operating Evidence v1'",
    'SHADOW_UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}',
    'SHADOW_UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}',
    'SHADOW_UPSTREAM_CONCLUSION: ${{ github.event.workflow_run.conclusion }}',
    'test "$SHADOW_UPSTREAM_CONCLUSION" = "success"',
    '/actions/runs/${SHADOW_UPSTREAM_RUN_ID}',
    '.name=="KIDULTS ASI SHADOW Operating Evidence v1"',
    '.path==".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"',
    '.repository.full_name==$repo',
    '.head_branch=="main"',
    '.head_sha==$sha',
    '.status=="completed"',
    '.conclusion=="success"',
    '/actions/runs/${SHADOW_UPSTREAM_RUN_ID}/artifacts?per_page=100',
    'SHADOW_ARTIFACT_COUNT=$(jq',
    'test "$SHADOW_ARTIFACT_COUNT" -eq 1',
    '.name=="kidults-asi-shadow-operating-evidence-v1"',
    '.workflow_run.id==$run',
    '.workflow_run.head_sha==$sha',
    '[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]'
  ];
  for (const marker of required) {
    if (!source.includes(marker)) fail(`MISSING:${marker}`);
  }
  const jobHeader = source.match(/jobs:\n  audit:\n([\s\S]*?)\n    runs-on:/)?.[1] || '';
  if (/workflow_run\.conclusion\s*==\s*['\"]success['\"]/.test(jobHeader)) {
    fail('SUCCESS_ONLY_JOB_FILTER_FORBIDDEN');
  }
  return true;
}

validate(text);

const mutations = [
  ["      - 'KIDULTS ASI SHADOW Operating Evidence v1'\n", ''],
  ['test "$SHADOW_UPSTREAM_CONCLUSION" = "success"', 'test -n "$SHADOW_UPSTREAM_CONCLUSION"'],
  ['.path==".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"', '.path!=".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"'],
  ['.head_sha==$sha', '.head_sha!=$sha'],
  ['test "$SHADOW_ARTIFACT_COUNT" -eq 1', 'test "$SHADOW_ARTIFACT_COUNT" -ge 1'],
  ['.workflow_run.id==$run', '.workflow_run.id!=$run'],
  ['[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]', '[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^md5: ]]']
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) fail(`NEGATIVE_MUTATION_SOURCE_MISSING:${from}`);
  const mutated = text.split(from).join(to);
  let rejected = false;
  try { validate(mutated); } catch { rejected = true; }
  if (!rejected) fail(`NEGATIVE_MUTATION_NOT_REJECTED:${from}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_CONTINUOUS_ASSURANCE_SHADOW_EVIDENCE_WATCH_V1',
  result: 'VERIFIED_PASS',
  watch_required: true,
  exact_upstream_run_binding: true,
  exact_artifact_cardinality: 1,
  provider_digest_required: true,
  mutations_rejected: mutations.length,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
