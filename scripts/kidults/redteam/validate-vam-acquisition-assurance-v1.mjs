#!/usr/bin/env node
import fs from 'node:fs';

const producerPath = '.github/workflows/kidults-autonomous-vam-fashion-sample.yml';
const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const exactGroup = "group: kidults-autonomous-vam-fashion-sample-${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}";
const requiredWatch = "- 'KIDULTS Autonomous V&A Fashion Sample'";

function validate(producerWorkflow, assuranceWorkflow) {
  const failures = [];
  if (!producerWorkflow.includes(exactGroup)) failures.push('VAM_EXACT_EVENT_RUN_ISOLATION_MISSING');
  if (/^\s*group:\s*kidults-autonomous-vam-fashion-sample\s*$/m.test(producerWorkflow)) failures.push('VAM_GLOBAL_CONCURRENCY_REINTRODUCED');
  if (!/^\s*cancel-in-progress:\s*true\s*$/m.test(producerWorkflow)) failures.push('VAM_CANCEL_POLICY_MISSING');
  if (!assuranceWorkflow.includes(requiredWatch)) failures.push('VAM_ASSURANCE_WATCH_MISSING');
  if (failures.length) throw new Error(failures.join(','));
}

const producerWorkflow = fs.readFileSync(producerPath, 'utf8');
const assuranceWorkflow = fs.readFileSync(assurancePath, 'utf8');
validate(producerWorkflow, assuranceWorkflow);

const mutations = [
  {
    id: 'GLOBAL_CONCURRENCY',
    producer: producerWorkflow.replace(exactGroup, 'group: kidults-autonomous-vam-fashion-sample'),
    assurance: assuranceWorkflow
  },
  {
    id: 'ASSURANCE_WATCH_REMOVED',
    producer: producerWorkflow,
    assurance: assuranceWorkflow.replace(`${requiredWatch}\n`, '')
  }
];

const rejected = [];
for (const mutation of mutations) {
  try {
    validate(mutation.producer, mutation.assurance);
  } catch {
    rejected.push(mutation.id);
  }
}
if (rejected.length !== mutations.length) {
  throw new Error(`MUTATION_NOT_REJECTED:${mutations.filter((item) => !rejected.includes(item.id)).map((item) => item.id).join(',')}`);
}

console.log(JSON.stringify({
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_VAM_ACQUISITION_ASSURANCE_INVARIANT',
  state: 'VERIFIED_PASS',
  rights_boundary: 'INTERNAL_NONCOMMERCIAL_POC_ONLY',
  protected_boundary: 'POC_EVIDENCE_NOT_CANDIDATE',
  mutations_total: mutations.length,
  mutations_rejected: rejected.length,
  rejected
}, null, 2));
