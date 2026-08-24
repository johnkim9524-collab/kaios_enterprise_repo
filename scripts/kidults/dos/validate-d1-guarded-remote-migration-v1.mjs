import fs from 'node:fs';

const path='services/kidults-autonomous-intelligence/scripts/d1-apply-query-hardening-remote.mjs';
const s=fs.readFileSync(path,'utf8');
const errors=[];
const required=[
  "kidults-intelligence-db-dev",
  "kidults-intelligence-db-staging",
  "kidults-intelligence-db', 'kidults-main-db', 'kidults_db",
  "KIDULTS_D1_REMOTE_MIGRATION_APPROVED",
  "process.env.KIDULTS_ENV === 'production'",
  "--target=dev or --target=staging",
  "d1', 'info'",
  "--remote",
  "0007_d1_query_efficiency_hardening_shadow.sql",
  "SELECT name FROM sqlite_master",
  "APPLIED_AND_VERIFIED"
];
for(const x of required) if(!s.includes(x)) errors.push(`missing guard/signature: ${x}`);
if(s.includes("targets.production")||s.includes("target: 'production'")) errors.push('production target must not exist');
if(errors.length){console.error(JSON.stringify({suite:'D1_GUARDED_REMOTE_MIGRATION_V1',result:'FAIL',errors},null,2));process.exit(1);}
console.log(JSON.stringify({suite:'D1_GUARDED_REMOTE_MIGRATION_V1',result:'PASS',allowed_targets:['dev','staging'],forbidden_targets:['kidults-intelligence-db','kidults-main-db','kidults_db','production'],apply_requires_explicit_env:true,postcondition_index_verification:true},null,2));
