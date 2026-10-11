import test from 'node:test';
import assert from 'node:assert/strict';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
const filename='.github/workflows/kidults-direct-owner-landing-handoff-v1.yml';
const policy={delegated_internal_path_prefixes:['.github/workflows/'],delegated_internal_exact_path_exceptions:[]};
const old='run-name: "KIDULTS Direct Owner Handoff PR #${{ inputs.pull_request_number }} @ ${{ inputs.expected_head_sha }} / ${{ inputs.handoff_authorization_id }}"\n';
const next=`run-name: >-
  \${{ github.event_name == 'workflow_dispatch'
      && format('KIDULTS Direct Owner Handoff PR #{0} @ {1} / {2}', inputs.pull_request_number, inputs.expected_head_sha, inputs.handoff_authorization_id)
      || format('KIDULTS Direct Owner Approval-Mutation Watch issue #{0} / {1}', github.event.issue.number, github.event.action) }}
`;
const body='on:\n  workflow_dispatch:\njobs:\n  handoff:\n    permissions:\n      contents: read\n    if: allowed\n    steps:\n      - run: node scripts/verify.mjs\n';
const base='name: KIDULTS Direct Owner Landing Handoff V1\n'+old+body;
const head='name: KIDULTS Direct Owner Landing Handoff V1\n'+next+body;
const verify=(source,options={})=>independentlyVerifyCapabilityDelta({policy,files:[{filename,status:'modified',base_content:base,head_content:source,...options}]});
test('exact event-aware handoff display preserves primary and independent acceptance',()=>{
 const files=[{filename,status:'modified',base_content:base,head_content:head}];
 assert.equal(evaluateSemanticCapabilityDelta({files,policy}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
 const result=verify(head);assert.equal(result.state,'INDEPENDENT_CAPABILITY_VERIFIED');
 assert.equal(result.receipts[0].transition,'NON_AUTHORIZING_HANDOFF_RUN_NAME_DISPLAY_ONLY');
 assert.equal(result.receipts[0].authority_created,false);
});
for(const [label,change] of [
 ['secret reference',s=>s.replace('github.event.action','secrets.GITHUB_TOKEN')],
 ['vars reference',s=>s.replace('github.event.action','vars.AUTHORIZATION')],
 ['token reference',s=>s.replace('github.event.action','github.token')],
 ['unexpected context',s=>s.replace('github.event.action','github.run_id')],
 ['unexpected function',s=>s.replace('format(', 'fromJSON(')],
 ['manual display consumer drift',s=>s.replace('Handoff PR #{0}', 'Handoff pull request #{0}')],
 ['job condition',s=>s.replace('if: allowed','if: true')],
 ['permissions expansion',s=>s.replace('contents: read','contents: write')],
 ['executable command',s=>s.replace('node scripts/verify.mjs','curl https://example.invalid')],
 ['extra trigger',s=>s.replace('on:\n','on:\n  push:\n')],
 ['duplicate metadata',s=>s.replace('on:\n','run-name: duplicate\non:\n')],
 ['unsupported scalar',s=>s.replace('run-name: >-','run-name: |-')],
])test('display exception refuses '+label,()=>assert.throws(()=>verify(change(head)),error=>/^INDEPENDENT_/.test(error.code)));
test('display exception cannot authorize another workflow',()=>assert.throws(()=>verify(head,{filename:'.github/workflows/other.yml'}),error=>/^INDEPENDENT_/.test(error.code)));
