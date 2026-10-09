import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertConsumedWorkflowInactive, INACTIVE_EVENTS} from '../../../scripts/kidults/kpmo/validate-cloudflare-consumed-workflow-v1.mjs';
const files = ['kidults-cloudflare-workers-shadow-deploy-v1.yml','kidults-cloudflare-workers-shadow-deploy-v2.yml','kidults-cloudflare-workers-shadow-deploy-v3.yml','kidults-cloudflare-credential-identity-preflight-v1.yml'];
for (const file of files) test(`consumed lane ${file} is valid, non-dispatchable and job-disabled`, () => {
  const result = assertConsumedWorkflowInactive(fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
  assert.equal(result.state,'VERIFIED_PASS'); assert.equal(result.provider_authority,false);
});
const good = `name: Consumed Historical Lane\n\n${INACTIVE_EVENTS}\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: consumed-test\n  cancel-in-progress: false\n\njobs:\n  consumed:\n    if: \${{ false }}\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo historical-only\n`;
test('canonical inert YAML subset is accepted',()=>assert.doesNotThrow(()=>assertConsumedWorkflowInactive(good)));
const mutations = [
 ['empty event array',s=>s.replace(INACTIVE_EVENTS,'on: []')],
 ['branch gate removed',s=>s.replace("    branches-ignore: ['**']\n",'')],
 ['tag gate removed',s=>s.replace("    tags-ignore: ['**']\n",'')],
 ['only flat branch names',s=>s.replace("branches-ignore: ['**']","branches-ignore: ['*']")],
 ['only main excluded',s=>s.replace("branches-ignore: ['**']","branches-ignore: ['main']")],
 ['tag explicitly enabled',s=>s.replace("tags-ignore: ['**']","tags: ['**']")],
 ['manual dispatch added',s=>s.replace('\npermissions:', '\n  workflow_dispatch:\n\npermissions:')],
 ['schedule added',s=>s.replace('\npermissions:', "\n  schedule:\n    - cron: '* * * * *'\n\npermissions:")],
 ['workflow_run added',s=>s.replace('\npermissions:', '\n  workflow_run:\n    workflows: [anything]\n    types: [completed]\n\npermissions:')],
 ['duplicate on key',s=>s+'\non: push\n'],
 ['quoted alternate on key',s=>s+'\n"on": push\n'],
 ['extra YAML document',s=>s+'\n---\non: push\n'],
 ['flow job bypass',s=>s+'  bypass: {runs-on: ubuntu-24.04, steps: []}\n'],
 ['extra job',s=>s+'  bypass:\n    runs-on: ubuntu-24.04\n    steps: []\n'],
 ['gate removed',s=>s.replace('    if: ${{ false }}\n','')],
 ['gate set true',s=>s.replace('${{ false }}','${{ true }}')],
 ['quoted false is truthy',s=>s.replace('${{ false }}',"'false'")],
 ['gate overwritten',s=>s.replace('    steps:', '    if: ${{ true }}\n    steps:')],
 ['write token',s=>s.replace('contents: read','contents: write')],
 ['job environment',s=>s.replace('    steps:', '    environment: production\n    steps:')],
 ['job permission',s=>s.replace('    steps:', '    permissions: write-all\n    steps:')],
 ['secret expression',s=>s.replace('historical-only','${{ secrets.CLOUDFLARE_API_TOKEN }}')],
 ['provider process',s=>s.replace('echo historical-only','npx wrangler deploy')],
 ['provider API',s=>s.replace('echo historical-only','curl https://api.cloudflare.com')],
 ['YAML tab',s=>s.replace('  push:', '\tpush:')],
];
for(const [label,mutate] of mutations)test(`fail closed: ${label}`,()=>assert.throws(()=>assertConsumedWorkflowInactive(mutate(good))));
test('regression is wired into existing closure workflow without adding provider authority',()=>{
 const s=fs.readFileSync('.github/workflows/kidults-cloudflare-workers-shadow-v3-approval-ready-validation-v1.yml','utf8');
 assert.ok(s.includes('node --test tests/kidults/kpmo/cloudflare-consumed-workflow-v1.test.mjs'));
 assert.ok(s.includes("'scripts/kidults/kpmo/validate-cloudflare-consumed-workflow-v1.mjs'"));
 assert.ok(s.includes("'tests/kidults/kpmo/cloudflare-consumed-workflow-v1.test.mjs'"));
});
