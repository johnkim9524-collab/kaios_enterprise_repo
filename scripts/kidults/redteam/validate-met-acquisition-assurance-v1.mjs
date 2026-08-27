#!/usr/bin/env node
import fs from 'node:fs';

const metPath = '.github/workflows/kidults-autonomous-met-sample.yml';
const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const exactGroup = "group: kidults-autonomous-met-sample-${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}";
const requiredWatch = "- 'KIDULTS Autonomous Met Open Access Sample'";

function validate(metWorkflow, assuranceWorkflow) {
  const failures = [];
  if (!metWorkflow.includes(exactGroup)) failures.push('MET_EXACT_EVENT_RUN_ISOLATION_MISSING');
  if (/^\s*group:\s*kidults-autonomous-met-sample\s*$/m.test(metWorkflow)) failures.push('MET_GLOBAL_CONCURRENCY_REINTRODUCED');
  if (!/^\s*cancel-in-progress:\s*true\s*$/m.test(metWorkflow)) failures.push('MET_CANCEL_POLICY_MISSING');
  if (!assuranceWorkflow.includes(requiredWatch)) failures.push('MET_ASSURANCE_WATCH_MISSING');
  if (failures.length) throw new Error(failures.join(','));
}

const metWorkflow = fs.readFileSync(metPath, 'utf8');
const assuranceWorkflow = fs.readFileSync(assurancePath, 'utf8');
validate(metWorkflow, assuranceWorkflow);

const mutations = [
  {
    id: 'GLOBAL_CONCURRENCY',
    met: metWorkflow.replace(exactGroup, 'group: kidults-autonomous-met-sample'),
    assurance: assuranceWorkflow
  },
  {
    id: 'ASSURANCE_WATCH_REMOVED',
    met: metWorkflow,
    assurance: assuranceWorkflow.replace(`${requiredWatch}\n`, '')
  }
];

const rejected = [];
for (const mutation of mutations) {
  try {
    validate(mutation.met, mutation.assurance);
  } catch {
    rejected.push(mutation.id);
  }
}
if (rejected.length !== mutations.length) {
  throw new Error(`MUTATION_NOT_REJECTED:${mutations.filter((item) => !rejected.includes(item.id)).map((item) => item.id).join(',')}`);
}

console.log(JSON.stringify({
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_MET_ACQUISITION_ASSURANCE_INVARIANT',
  state: 'VERIFIED_PASS',
  protected_boundary: 'POC_EVIDENCE_NOT_CANDIDATE',
  mutations_total: mutations.length,
  mutations_rejected: rejected.length,
  rejected
}, null, 2));
