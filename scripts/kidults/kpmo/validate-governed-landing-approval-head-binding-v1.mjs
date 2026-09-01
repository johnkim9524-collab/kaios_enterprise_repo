#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-governed-landing-authorization-v1.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const start = workflow.indexOf('- name: Enforce active approval-generation equality before readiness');
const end = workflow.indexOf('- name: Enforce exact-head solo-owner authorization and ruleset monotonicity');
if (start < 0 || end <= start) throw new Error('APPROVAL_GENERATION_STEP_BOUNDARY_MISSING');
const block = workflow.slice(start, end);
if (!block.includes('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}')) {
  throw new Error('APPROVAL_GENERATION_EXPECTED_HEAD_BINDING_MISSING');
}
if (!block.includes('validate-approval-generation-equality-live-pr-v1.mjs')) {
  throw new Error('APPROVAL_GENERATION_VALIDATOR_CALL_MISSING');
}

const mutated = block.replace('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}', 'EXPECTED_HEAD_SHA_MISSING');
if (mutated.includes('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}')) {
  throw new Error('APPROVAL_GENERATION_HEAD_BINDING_NEGATIVE_CASE_FALSE_GREEN');
}

console.log('Governed landing approval-generation exact-head binding regression: PASS');
