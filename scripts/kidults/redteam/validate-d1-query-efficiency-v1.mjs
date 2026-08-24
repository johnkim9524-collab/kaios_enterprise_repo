import fs from 'node:fs';

const files = [
  'services/kidults-autonomous-intelligence/src/index.ts',
  'services/kidults-autonomous-intelligence/src/asi/runtime.ts',
  'services/kidults-autonomous-intelligence/src/asi/processor-runtime.ts'
];
const errors=[];
const findings=[];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const text=fs.readFileSync(file,'utf8');
  const selectStar=[...text.matchAll(/SELECT\s+\*/gi)].length;
  const unbounded=[...text.matchAll(/SELECT[\s\S]{0,240}?FROM\s+[a-zA-Z0-9_]+(?![\s\S]{0,240}?\b(?:WHERE|LIMIT)\b)/gi)].length;
  findings.push({file,selectStar,unboundedCandidates:unbounded});
  if (selectStar>0) errors.push(`${file}: SELECT * present (${selectStar})`);
}
const migration='services/kidults-autonomous-intelligence/migrations/0004_asi_processor_shadow.sql';
if (fs.existsSync(migration)) {
  const sql=fs.readFileSync(migration,'utf8');
  for (const required of ['idx_asi_source_candidates_partition','idx_asi_source_candidates_host','idx_asi_candidate_observations_source','idx_asi_processor_assertions_fan_in','idx_asi_source_pool_decisions_state']) {
    if (!sql.includes(required)) errors.push(`missing hot-path index: ${required}`);
  }
}
if (errors.length) {
  console.error(JSON.stringify({suite:'D1_QUERY_EFFICIENCY_V1',result:'FAIL',errors,findings},null,2));
  process.exit(1);
}
console.log(JSON.stringify({suite:'D1_QUERY_EFFICIENCY_V1',result:'PASS',findings},null,2));
