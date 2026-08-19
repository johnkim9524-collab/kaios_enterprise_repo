import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [datasetPath, outPath='/tmp/er-blind-holdout-freeze-v1.json'] = process.argv.slice(2);
if (!datasetPath) throw new Error('Usage: node freeze-er-blind-holdout-v1.mjs <dataset.json> [output.json]');
const dataset=JSON.parse(await fs.readFile(datasetPath,'utf8'));
if (!Array.isArray(dataset.cases) || dataset.cases.length===0) throw new Error('DATASET_CASES_REQUIRED');
const holdout=dataset.cases.filter(x=>x.blind_holdout===true);
if (holdout.length===0) throw new Error('BLIND_HOLDOUT_REQUIRED');

const canonical=(v)=>Array.isArray(v)?v.map(canonical):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v);
const digest=(v)=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;

for (const item of holdout) {
  if (!item.case_id || !item.expected || !item.identity_boundary || !item.case_class) throw new Error(`HOLDOUT_CASE_INVALID:${item.case_id}`);
  if (!Array.isArray(item.provenance_refs) || item.provenance_refs.length===0) throw new Error(`HOLDOUT_PROVENANCE_REQUIRED:${item.case_id}`);
  if (item.rights_state!=='ALLOW') throw new Error(`HOLDOUT_RIGHTS_NOT_ADMITTED:${item.case_id}`);
}

const frozenCases=holdout.map(item=>({
  case_id:item.case_id,
  case_hash:digest(item),
  identity_boundary:item.identity_boundary,
  case_class:item.case_class,
  scope_id:item.scope_id,
  provenance_hash:digest(item.provenance_refs),
  rights_state:item.rights_state
}));
const artifact={
  id:'entity-resolution-blind-holdout-freeze-v1',
  dataset_id:dataset.id??null,
  dataset_hash:digest(dataset),
  holdout_count:holdout.length,
  holdout_case_set_hash:digest(holdout),
  frozen_cases:frozenCases,
  mutation_policy:'ANY_CHANGE_TO_FROZEN_CASE_CONTENT_REQUIRES_NEW_DATASET_ID_AND_NEW_FREEZE_ARTIFACT; NEVER_OVERWRITE',
  label_access_policy:'TRACK_A_CALIBRATION_MUST_NOT_USE_FROZEN_HOLDOUT_EXPECTED_LABELS_FOR_TUNING',
  production:'HOLD'
};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2));
console.log(JSON.stringify(artifact,null,2));
