#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath='.github/workflows/kpmo-canonical-issue-rebound-v1.yml';
const runnerPath='scripts/kidults/kpmo/run-canonical-issue-rebound-v1.mjs';
const workflow=fs.readFileSync(workflowPath,'utf8');
const runner=fs.readFileSync(runnerPath,'utf8');
const req=(v,c)=>{if(!v)throw new Error(c);};

export function validateControl(w,r){
  req(w.includes('name: KPMO Canonical Issue Rebound V1'),'REBOUND_WORKFLOW_NAME');
  const onBlock=w.match(/^on:\n([\s\S]*?)\npermissions:/m)?.[1]||'';
  req(/^\s{2}workflow_dispatch:\s*$/m.test(onBlock),'REBOUND_NOT_MANUAL_ONLY');
  for(const trigger of ['push','pull_request','schedule','issues']) req(!new RegExp(`^\\s{2}${trigger}:\\s*$`,'m').test(onBlock),`REBOUND_AUTO_TRIGGER_FORBIDDEN:${trigger}`);
  req(w.includes('contents: read')&&w.includes('issues: write')&&w.includes('actions: read'),'REBOUND_PERMISSION_SET');
  req(!/(contents:\s*write|deployments:\s*write|statuses:\s*write|pull-requests:\s*write)/.test(w),'REBOUND_EXTRA_WRITE_PERMISSION');
  req(w.includes('cancel-in-progress: false'),'REBOUND_MUST_NOT_CANCEL_MID_TRANSACTION');
  req(w.includes("if: github.ref == 'refs/heads/main' && github.actor == 'johnkim9524-collab'"),'REBOUND_OWNER_MAIN_GATE');
  req(w.includes('ref: ${{ inputs.expected_main_sha }}'),'REBOUND_EXACT_CHECKOUT');
  req(w.includes('default: PLAN'),'REBOUND_PLAN_DEFAULT');
  req(w.includes('APPLY_25_CANONICAL_ISSUE_BODY_APPEND_ONLY'),'REBOUND_EXACT_CONFIRMATION_INPUT');
  req(!w.includes('secrets.')&&!/\nenvironment:/.test(w),'REBOUND_SECRET_OR_ENVIRONMENT_FORBIDDEN');

  const plan=w.indexOf('Build immutable preimage rollback plan before any issue mutation');
  const packet=w.indexOf('Persist rollback packet before first mutation');
  const apply=w.indexOf('APPLY bounded 25-board append-only rebound');
  const terminal=w.indexOf('Retain terminal receipt');
  req(plan>=0&&packet>plan&&apply>packet&&terminal>apply,'REBOUND_STEP_ORDER');
  const packetBlock=w.slice(packet,apply);
  req(packetBlock.includes('actions/upload-artifact@')&&packetBlock.includes('retention-days: 90')&&packetBlock.includes('if-no-files-found: error'),'REBOUND_PREMUTATION_PACKET_NOT_DURABLE');
  const applyBlock=w.slice(apply,terminal);
  req(applyBlock.includes("if: inputs.mode == 'APPLY'")&&applyBlock.includes('CONFIRM_APPLY: ${{ inputs.confirm_apply }}'),'REBOUND_APPLY_GATE');
  const terminalBlock=w.slice(terminal);
  req(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(terminalBlock)&&terminalBlock.includes('if-no-files-found: error'),'REBOUND_TERMINAL_NOT_ALWAYS_DURABLE');

  for(const token of [
    'REVERSIBLE_FAIL_CLOSED_NOT_GITHUB_ATOMIC',
    'CANONICAL-REBOUND-',
    'APPLY_25_CANONICAL_ISSUE_BODY_APPEND_ONLY',
    'preflightPreimages',
    'PRE_PATCH_BODY_MOVED',
    'PRE_PATCH_UPDATED_AT_MOVED',
    'async function rollbackChanged(plan,headers)',
    'receipt.rollback=await rollbackChanged(plan,headers)',
    'POSTREAD_BOARD_INCOMPLETE',
    'GITHUB_REST_HAS_NO_MULTI_ISSUE_ATOMIC_TRANSACTION',
    'READ_THEN_PATCH_RACE_WINDOW_NONZERO',
    'ROLLBACK_CAN_FAIL_IF_CONCURRENT_EXTERNAL_EDIT_OCCURS',
    "method:'PATCH',body:{body}",
    'MAX_BODY_BYTES=65536'
  ]) req(r.includes(token),`REBOUND_RUNNER_TOKEN_MISSING:${token}`);
  req(!r.includes("body:{body,state:")&&!r.includes("body:{body,labels:"),'REBOUND_PATCH_SCOPE_EXPANDED');
  req(r.includes('desired_body===appendCanonicalBlock(item.original_body,plan.canonical_block)'),'REBOUND_APPEND_ONLY_VALIDATION_MISSING');
  req(r.includes("validateCanonicalBlock(issue.body||'',plan.expected_main_sha"),'REBOUND_POSTREAD_CANONICAL_VALIDATION_MISSING');
  return {state:'VERIFIED_PASS',manual_only:true,rollback_packet_precedes_mutation:true,github_atomicity_claimed:false};
}

function selfTest(){
  validateControl(workflow,runner);
  const mutations=[
    ['ADD_PUSH',workflow.replace('on:\n  workflow_dispatch:','on:\n  push:\n    branches: [main]\n  workflow_dispatch:'),runner],
    ['CANCEL_TRUE',workflow.replace('cancel-in-progress: false','cancel-in-progress: true'),runner],
    ['REMOVE_PACKET',workflow.replace('Persist rollback packet before first mutation','removed rollback packet'),runner],
    ['REMOVE_OWNER_GATE',workflow.replace("if: github.ref == 'refs/heads/main' && github.actor == 'johnkim9524-collab'",'if: true'),runner],
    ['EXPAND_PATCH',workflow,runner.replace("method:'PATCH',body:{body}","method:'PATCH',body:{body,state:'closed'}")],
    ['REMOVE_ROLLBACK_CALL',workflow,runner.replace('receipt.rollback=await rollbackChanged(plan,headers);','receipt.rollback=[];')]
  ];
  for(const [name,w,r] of mutations){let rejected=false;try{validateControl(w,r);}catch{rejected=true;}req(rejected,`REBOUND_CONTROL_FALSE_ACCEPT:${name}`);}
  process.stdout.write(`${JSON.stringify({test:'CANONICAL_ISSUE_REBOUND_CONTROL_V1',state:'VERIFIED_PASS',negative_cases:mutations.length,manual_only:true,rollback_packet_precedes_mutation:true})}\n`);
}

try{if(process.argv.includes('--self-test'))selfTest();else process.stdout.write(`${JSON.stringify(validateControl(workflow,runner))}\n`);}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exit(1);}
