import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const paths = [
  'infrastructure/postgres/current-sold/0002_payload_binding_fail_closed_v1.sql',
  'infrastructure/postgres/source-intelligence/0003_payload_binding_fail_closed_v1.sql',
];
const upgrades = paths.map(p=>fs.readFileSync(p,'utf8'));
test('upgrade migrations strengthen all eight existing CHECK predicates with explicit TRUE',()=>{
  const all=upgrades.join('\n');
  assert.equal((all.match(/ADD CONSTRAINT [a-z_]+ CHECK \(\(/g)||[]).length,8);
  assert.equal((all.match(/\) IS TRUE\) NOT VALID;/g)||[]).length,8);
  const added=[...all.matchAll(/ADD CONSTRAINT ([a-z_]+)/g)].map(m=>m[1]);
  const validated=[...all.matchAll(/VALIDATE CONSTRAINT ([a-z_]+)/g)].map(m=>m[1]);
  assert.deepEqual(added,validated);
  assert.equal(new Set(added).size,8);
});
test('upgrades validate before atomic commit without data edits or privilege/trigger changes',()=>{
  for(const sql of upgrades){
    const active=sql.replace(/^--.*$/gm,'');
    assert.match(active,/^\s*BEGIN;/);
    assert.match(active,/SET LOCAL lock_timeout = '5s'/);
    assert.match(active,/SET LOCAL statement_timeout = '60s'/);
    assert.match(active,/VALIDATE CONSTRAINT [a-z_]+;\s*COMMIT;\s*$/);
    assert.doesNotMatch(active,/\b(?:UPDATE|DELETE|TRUNCATE|INSERT|GRANT|REVOKE)\b|DROP\s+(?:TABLE|TRIGGER|SCHEMA)/i);
  }
});
test('SQL boolean boundaries no longer accept string false or boolean coercion',()=>{
  const source=upgrades[1];
  assert.equal((source.match(/= 'false'::jsonb/g)||[]).length,10);
  assert.match(source,/#>'\{artifact,contains_external_raw_content\}' = to_jsonb\(contains_external_raw_content\)/);
  assert.doesNotMatch(source,/::boolean|->>'(?:activation_authorized|production_authorized)'/);
});
test('PostgreSQL fixture/transport self-test is offline and fails closed on bad execution identities',()=>{
  const p=spawnSync('python3',['scripts/staging/verify-kir-postgres-payload-binding-v1.py','--self-test'],{encoding:'utf8',timeout:10000});
  assert.equal(p.status,0,p.stderr);
  const value=JSON.parse(p.stdout);
  assert.equal(value.state,'VERIFIED_PASS');
  assert.equal(value.actual_postgres_executed,false);
  assert.ok(value.planned_cases_per_phase>100);
});
test('existing pinned Greenfield workflow runs and preserves the new SQL proof on PR and main',()=>{
  const wf=fs.readFileSync('.github/workflows/p0-postgres-greenfield-runtime.yml','utf8');
  for(const p of ['infrastructure/postgres/current-sold/**','infrastructure/postgres/source-intelligence/**',
      'scripts/staging/verify-kir-postgres-payload-binding-v1.py']){
    assert.equal(wf.split(`- '${p}'`).length-1,2);
  }
  assert.match(wf,/image: postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94/);
  assert.match(wf,/KIR_SQL_TEST_CONTAINER_ID: \$\{\{ job.services.postgres.id \}\}/);
  assert.match(wf,/verify-kir-postgres-payload-binding-v1.py --run-ci/);
  assert.match(wf,/Preserve KIR SQL boundary receipt without operational authority\s+if: always\(\)/);
  assert.doesNotMatch(wf,/\$\{\{\s*secrets\./);
});
