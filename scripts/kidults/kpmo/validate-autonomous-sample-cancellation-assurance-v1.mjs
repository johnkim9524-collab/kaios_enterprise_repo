#!/usr/bin/env node
import fs from 'node:fs';

const fail = message => { throw new Error(message); };
const controls = [
  {
    path: '.github/workflows/kidults-autonomous-smithsonian-sample.yml',
    prefix: 'kidults-autonomous-smithsonian-sample-',
    workflow: 'KIDULTS Autonomous Smithsonian Open Access Sample'
  },
  {
    path: '.github/workflows/kidults-autonomous-artic-sample.yml',
    prefix: 'kidults-autonomous-artic-sample-',
    workflow: 'KIDULTS Autonomous Art Institute Design Sample'
  }
];
const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';

function validateProducer(text, control) {
  const required = 'group: ' + control.prefix + "${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}";
  if (!text.includes(required)) fail(`${control.path}: exact event/run concurrency identity missing`);
  if (!text.includes('cancel-in-progress: true')) fail(`${control.path}: cancellation policy weakened`);
  if (text.includes(`group: ${control.prefix.slice(0, -1)}\n`)) fail(`${control.path}: fixed global group restored`);
  if (!text.includes('schedule:') || !text.includes('workflow_dispatch:') || !text.includes('push:')) fail(`${control.path}: trigger surface drift`);
}

function validateAssurance(text) {
  const permissions = text.indexOf('\npermissions:');
  const trigger = permissions >= 0 ? text.slice(0, permissions) : text;
  for (const control of controls) {
    if (!trigger.includes(`      - '${control.workflow}'`)) fail(`Assurance watch missing: ${control.workflow}`);
  }
  if (!trigger.includes('types: [completed]')) fail('Assurance must observe completed terminal events');
  if (!trigger.includes('branches: [main]')) fail('Assurance watch must remain main-bound');
  if (!text.includes("github.event.workflow_run.repository.full_name == github.repository")) fail('Assurance repository binding missing');
  if (!text.includes("github.event.workflow_run.head_branch == 'main'")) fail('Assurance upstream branch binding missing');
  const firstJobHeader = text.match(/jobs:\n([\s\S]*?)\n    runs-on:/)?.[1] || '';
  if (/github\.event\.workflow_run\.conclusion\s*==\s*['\"]success['\"]/.test(firstJobHeader)) fail('Assurance success-only filter hides cancelled or failed producers');
}

let mutations = 0;
const pristineProducer = [
  'on:',
  '  push:',
  '  schedule:',
  '  workflow_dispatch:',
  'concurrency:',
  "  group: sample-${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}",
  '  cancel-in-progress: true'
].join('\n');
const sampleControl = {path:'self/producer', prefix:'sample-', workflow:'Sample'};
validateProducer(pristineProducer, sampleControl);
for (const mutated of [
  pristineProducer.replace("group: sample-${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}", 'group: sample'),
  pristineProducer.replace('${{ github.event_name }}-', ''),
  pristineProducer.replace('github.run_id', 'github.ref'),
  pristineProducer.replace('cancel-in-progress: true', 'cancel-in-progress: false')
]) {
  let rejected = false;
  try { validateProducer(mutated, sampleControl); } catch { rejected = true; }
  if (!rejected) fail('producer negative mutation escaped');
  mutations += 1;
}

const pristineAssurance = [
  'on:',
  '  workflow_run:',
  '    workflows:',
  "      - 'KIDULTS Autonomous Smithsonian Open Access Sample'",
  "      - 'KIDULTS Autonomous Art Institute Design Sample'",
  '    branches: [main]',
  '    types: [completed]',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  classify:',
  "    if: github.event.workflow_run.repository.full_name == github.repository && github.event.workflow_run.head_branch == 'main'",
  '    runs-on: ubuntu-24.04'
].join('\n');
validateAssurance(pristineAssurance);
for (const mutated of [
  pristineAssurance.replace("      - 'KIDULTS Autonomous Smithsonian Open Access Sample'\n", ''),
  pristineAssurance.replace("      - 'KIDULTS Autonomous Art Institute Design Sample'\n", ''),
  pristineAssurance.replace('types: [completed]', 'types: [requested]'),
  pristineAssurance.replace("if: github.event.workflow_run.repository.full_name == github.repository && github.event.workflow_run.head_branch == 'main'", "if: github.event.workflow_run.conclusion == 'success'")
]) {
  let rejected = false;
  try { validateAssurance(mutated); } catch { rejected = true; }
  if (!rejected) fail('Assurance negative mutation escaped');
  mutations += 1;
}

for (const control of controls) validateProducer(fs.readFileSync(control.path, 'utf8'), control);
validateAssurance(fs.readFileSync(assurancePath, 'utf8'));

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'bounded-acquisition-sample-cancellation-and-assurance-visibility',
  producers: controls.map(control => control.workflow),
  mutation_rejections: mutations,
  empirical_evidence_authority: false,
  production: 'HOLD',
  public_release: 'HOLD'
}, null, 2));
