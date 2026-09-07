#!/usr/bin/env node
import fs from 'node:fs';

const scriptPath = 'scripts/kidults/staging/verify-current-sold-postgres-resilience-v1.sh';
const workflowPath = '.github/workflows/kpmo-current-sold-postgres-resilience-v1.yml';
const fail = code => { throw new Error(code); };

function validateScript(text) {
  if (/\b1\s*\/\s*0\b/.test(text)) fail('CONSTANT_FOLDED_ASSERTION_TRAP_PRESENT');
  const failCall = text.indexOf('\nwrite_fail_receipt\n');
  const firstMutation = text.indexOf('CREATE DATABASE');
  const passCall = text.lastIndexOf('\nwrite_pass_receipt');
  const restart = text.indexOf('docker restart');
  if (failCall < 0 || firstMutation < 0 || failCall > firstMutation) fail('FAIL_RECEIPT_NOT_SEALED_BEFORE_MUTATION');
  if (!text.includes("| grep -qx '0'")) fail('ZERO_CARDINALITY_ASSERTION_MISSING');
  if (!text.includes("| grep -qx '1'")) fail('ONE_CARDINALITY_ASSERTION_MISSING');
  if (restart < 0 || passCall < restart) fail('PASS_RECEIPT_PUBLISHED_BEFORE_RESTART_PROOF');
  for (const token of [
    '"state": "VERIFIED_FAIL"',
    '"failure_code": "EXECUTION_INCOMPLETE_FAIL_CLOSED"',
    '"state": "VERIFIED_PASS"',
    '"remote_database_authority": false',
    '"production": "HOLD"',
    '"public": "HOLD"',
    '"g5": "HOLD"'
  ]) if (!text.includes(token)) fail(`RECEIPT_BOUNDARY_TOKEN_MISSING:${token}`);
}

function validateWorkflow(text) {
  for (const token of [
    'name: KPMO Current-SOLD PostgreSQL Resilience V1',
    'postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
    'ref: ${{ github.event.pull_request.head.sha }}',
    'persist-credentials: false',
    'validate-current-sold-postgres-resilience-contract-v1.mjs --self-test',
    'verify-current-sold-postgres-resilience-v1.sh',
    'if: always()',
    'out/current-sold-postgres-resilience/receipt.json',
    'if-no-files-found: error'
  ]) if (!text.includes(token)) fail(`WORKFLOW_CONTRACT_TOKEN_MISSING:${token}`);
}

const script = fs.readFileSync(scriptPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
validateScript(script);
validateWorkflow(workflow);

if (process.argv.includes('--self-test')) {
  const mutations = [
    [script.replace("| grep -qx '0'", "| cat"), 'ZERO_CARDINALITY_ASSERTION_MISSING'],
    [script.replace("| grep -qx '1'", "| cat"), 'ONE_CARDINALITY_ASSERTION_MISSING'],
    [script.replace('\nwrite_fail_receipt\n', '\n# removed fail receipt\n'), 'FAIL_RECEIPT_NOT_SEALED_BEFORE_MUTATION'],
    [script.replace('\nwrite_pass_receipt\n', '\ntrue\n'), 'PASS_RECEIPT_PUBLISHED_BEFORE_RESTART_PROOF'],
    [`${script}\nprintf '%s\\n' $((1/0))\n`, 'CONSTANT_FOLDED_ASSERTION_TRAP_PRESENT']
  ];
  for (const [candidate, expected] of mutations) {
    let observed = null;
    try { validateScript(candidate); } catch (error) { observed = error.message; }
    if (observed !== expected) fail(`MUTATION_NOT_REJECTED:${expected}:${observed || 'PASS'}`);
  }
}

console.log(JSON.stringify({
  suite: 'KPMO_CURRENT_SOLD_POSTGRES_RESILIENCE_CONTRACT_V1',
  state: 'VERIFIED_PASS',
  empirical_authority: false,
  remote_database_authority: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
