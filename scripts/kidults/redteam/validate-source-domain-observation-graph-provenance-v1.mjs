#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = process.argv[2] || '.github/workflows/kidults-asi-source-domain-observation-graph-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');

const required = [
  'Restore exact-generation Self-Driving cycle inputs',
  'EXPECTED_SHA: ${{ github.sha }}',
  'EXPECTED_REPOSITORY: ${{ github.repository }}',
  'EXPECTED_WORKFLOW_PATH: .github/workflows/kidults-asi-self-driving-control-loop-v1.yml',
  '-f head_sha="$EXPECTED_SHA"',
  '.repository.full_name==$repo',
  '.path==$path',
  '.head_sha==$sha',
  '.conclusion=="success"',
  'test "$RUN_HEAD" = "$EXPECTED_SHA"',
  'test "$ART_COUNT" -eq 1',
  '[[ "$ART_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]',
  'schema:"kidults.source-domain-observation-graph.provenance-receipt.v1"',
  'exact_generation:true',
  'empirical_promotion:false',
  '/tmp/asi-source-domain-observation-graph-provenance-v1.json',
  '/actions/runs/${RUN_ID}/artifacts?per_page=100'
];

const forbidden = [
  '/actions/artifacts?per_page=100',
  'workflow_run.head_branch=="main")][0].id',
  'Restore latest main Self-Driving cycle inputs'
];

const failures = [];
for (const token of required) if (!text.includes(token)) failures.push(`missing:${token}`);
for (const token of forbidden) if (text.includes(token)) failures.push(`forbidden:${token}`);

const mutations = [
  ['drop exact SHA filter', s => s.replace('-f head_sha="$EXPECTED_SHA"', '-f per_page=100')],
  ['drop repository binding', s => s.replace('.repository.full_name==$repo and ', '')],
  ['drop canonical path binding', s => s.replace('.path==$path and ', '')],
  ['weaken artifact cardinality', s => s.replace('test "$ART_COUNT" -eq 1', 'test "$ART_COUNT" -ge 1')],
  ['drop provider digest', s => s.replace('[[ "$ART_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]', 'true')],
  ['forge receipt exactness', s => s.replace('exact_generation:true', 'exact_generation:false')],
  ['reintroduce repository-global artifact lookup', s => s.replace('/actions/runs/${RUN_ID}/artifacts?per_page=100', '/actions/artifacts?per_page=100')]
];

const validates = candidate => required.every(t => candidate.includes(t)) && forbidden.every(t => !candidate.includes(t));
if (!validates(text)) failures.push('pristine-validation-failed');
for (const [name, mutate] of mutations) {
  const mutated = mutate(text);
  if (mutated === text) failures.push(`mutation-not-applied:${name}`);
  else if (validates(mutated)) failures.push(`mutation-not-rejected:${name}`);
}

if (failures.length) {
  console.error(JSON.stringify({status:'FAIL', failures}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status:'PASS',
  workflow:workflowPath,
  required_controls:required.length,
  forbidden_patterns:forbidden.length,
  mutations_rejected:mutations.length,
  production:'HOLD'
}, null, 2));
