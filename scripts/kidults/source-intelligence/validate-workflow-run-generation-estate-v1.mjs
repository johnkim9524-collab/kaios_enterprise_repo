#!/usr/bin/env node
import fs from 'node:fs';

const TARGETS = [
  ['.github/workflows/kidults-global-source-mesh-v1.yml', '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml'],
  ['.github/workflows/kidults-asi-mission-consumption-v1.yml', null],
  ['.github/workflows/kidults-asi-p0-mission-consumption-v1.yml', '.github/workflows/kidults-asi-intelligence-preparation-wave-v1.yml'],
  ['.github/workflows/kidults-asi-p1-market-event-adapter-runtime-v1.yml', '.github/workflows/kidults-asi-mission-directed-discovery-v1.yml'],
  ['.github/workflows/kidults-asi-intelligence-preparation-wave-v1.yml', null],
  ['.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml', null],
];

const CLASSIFIER = 'scripts/kidults/source-intelligence/classify-workflow-run-generation-v1.mjs';
const MARKER = 'KPMO_WORKFLOW_RUN_GENERATION_GUARD_V1';

function inspect(path) {
  const text = fs.readFileSync(path, 'utf8');
  const hasWorkflowRun = /^  workflow_run:/m.test(text);
  const hardDisabled = text.includes('P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED') && !hasWorkflowRun;
  const classifierBound = text.includes(CLASSIFIER) && text.includes(MARKER) &&
    text.includes('CURRENT_MAIN_EXACT') && text.includes('EXPECTED_NONAUTHORITATIVE_SKIP') &&
    text.includes('INVALID_TRIGGER');
  return {path, has_workflow_run: hasWorkflowRun, hard_disabled_no_workflow_run: hardDisabled, classifier_bound: classifierBound};
}

export function evaluateEstate() {
  const rows = TARGETS.map(([path]) => inspect(path));
  const blocked = rows.filter((row) => row.has_workflow_run && !row.classifier_bound);
  return {
    id: 'kidults-workflow-run-generation-estate-v1',
    state: blocked.length === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    issue: 1724,
    classifier: CLASSIFIER,
    coverage_scope: 'KNOWN_WORKFLOW_RUN_GENERATION_CONSUMERS',
    rows,
    blocked_count: blocked.length,
    blocked_paths: blocked.map((row) => row.path),
    promotion_eligible: false,
    empirical_authority: false,
    provider_authority: false,
    database_authority: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

function selfTest() {
  const classifierText = fs.readFileSync(CLASSIFIER, 'utf8');
  for (const required of ['CURRENT_MAIN_EXACT','EXPECTED_NONAUTHORITATIVE_SKIP','INVALID_TRIGGER','STALE_PRIOR_MAIN_TRIGGER','CURRENT_MAIN_ADVANCED_DURING_CLASSIFICATION']) {
    if (!classifierText.includes(required)) throw new Error(`ESTATE_CLASSIFIER_CONTRACT_MISSING:${required}`);
  }
  const result = evaluateEstate();
  if (!Array.isArray(result.rows) || result.rows.length !== TARGETS.length) throw new Error('ESTATE_TARGET_CARDINALITY');
  if (!result.rows.find((row) => row.path.endsWith('p0b-bounded-discovery-candidates-v1.yml'))?.hard_disabled_no_workflow_run) throw new Error('ESTATE_P0B_HARD_DISABLE_NOT_RECOGNIZED');
  console.log(JSON.stringify({...result, self_test:'VERIFIED_PASS'}));
  return result;
}

const result = selfTest();
if (process.argv.includes('--report-only')) process.exit(0);
if (result.state !== 'VERIFIED_PASS') {
  console.error(`WORKFLOW_RUN_GENERATION_ESTATE_BLOCKED:${result.blocked_paths.join(',')}`);
  process.exit(1);
}
