#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml';
const text = fs.readFileSync(workflowPath, 'utf8');

const required = [
  'P1_SOURCE_SHA="$CURRENT_SHA"',
  'test "$P1_SOURCE_SHA" = "$CURRENT_SHA"',
  '.head_sha==$sha',
  'P1_EVENT_SOURCE_SHA" == "$CURRENT_SHA',
  'github.event_name',
  'github.event.workflow_run.id',
];
for (const marker of required) {
  if (!text.includes(marker)) {
    console.error(`missing exact-generation marker: ${marker}`);
    process.exit(2);
  }
}

const forbidden = [
  'git merge-base --is-' + 'ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"',
  '(.head_sha==$sha or (.head_sha | type=="string"))',
];
for (const marker of forbidden) {
  if (text.includes(marker)) {
    console.error(`forbidden ancestor-generation fallback: ${marker}`);
    process.exit(3);
  }
}

const concurrency = text.match(/concurrency:\n([\s\S]*?)\n\njobs:/)?.[1] ?? '';
if (!concurrency.includes('github.event_name') || !concurrency.includes('github.event.workflow_run.id')) {
  console.error('P2 concurrency is not isolated by trigger source/upstream run id');
  process.exit(4);
}

console.log(JSON.stringify({
  id: 'kidults-p2-same-generation-lineage-validation-v1',
  state: 'VERIFIED_PASS',
  exact_current_generation_required: true,
  ancestor_generation_fallback_allowed: false,
  trigger_scoped_concurrency_required: true,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));