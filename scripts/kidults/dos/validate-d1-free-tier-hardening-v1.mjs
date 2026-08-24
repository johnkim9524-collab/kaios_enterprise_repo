import fs from 'node:fs';

const contractPath='coordination/kidults/dos/d1-free-tier-degraded-mode-contract-v1.json';
const migrationPath='services/kidults-autonomous-intelligence/migrations/0007_d1_query_efficiency_hardening_shadow.sql';
const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
const migration=fs.readFileSync(migrationPath,'utf8');
const errors=[];

if(contract.contract_id!=='KIDULTS_D1_FREE_TIER_DEGRADED_MODE_V1') errors.push('contract id drift');
if(contract.free_plan_daily_limits?.rows_read!==5000000) errors.push('rows_read limit drift');
if(contract.free_plan_daily_limits?.rows_written!==100000) errors.push('rows_written limit drift');
if(contract.non_bypass?.production!=='HOLD') errors.push('production boundary drift');
if(contract.non_bypass?.public!=='HOLD') errors.push('public boundary drift');
if(contract.non_bypass?.paid_plan_change!=='FOUNDER_EXPLICIT_APPROVAL_REQUIRED') errors.push('paid-plan approval boundary drift');
if(contract.recurring_query_rules?.full_table_count_prohibited!==true) errors.push('recurring full table count must be prohibited');
if(contract.recurring_query_rules?.select_star_hot_path_prohibited!==true) errors.push('hot-path select star must be prohibited');

const requiredIndexes=[
 'idx_asi_source_candidate_observations_latest',
 'idx_asi_source_pool_decisions_latest',
 'idx_asi_outbox_hot_selection',
 'idx_asi_replay_claim_covering'
];
for(const name of requiredIndexes) if(!migration.includes(name)) errors.push(`missing index ${name}`);

const requiredActions=[
 'STOP_NONESSENTIAL_POLLING',
 'STOP_NONESSENTIAL_REPLAY',
 'D1_MUTATING_PATHS_HOLD',
 'NO_SYNTHETIC_SUCCESS',
 'NO_PARTIAL_PROJECTION_ADVANCE',
 'MARK_RUNTIME_DEGRADED'
];
const actions=new Set([...(contract.red_band_actions||[]),...(contract.limit_exhausted_actions||[])]);
for(const action of requiredActions) if(!actions.has(action)) errors.push(`missing action ${action}`);

if(errors.length){
 console.error(JSON.stringify({suite:'D1_FREE_TIER_HARDENING_V1',result:'FAIL',errors},null,2));
 process.exit(1);
}
console.log(JSON.stringify({
 suite:'D1_FREE_TIER_HARDENING_V1',result:'PASS',required_indexes:requiredIndexes.length,
 rows_read_limit:contract.free_plan_daily_limits.rows_read,
 rows_written_limit:contract.free_plan_daily_limits.rows_written,
 degraded_mode:'FAIL_CLOSED',production:contract.non_bypass.production
},null,2));
