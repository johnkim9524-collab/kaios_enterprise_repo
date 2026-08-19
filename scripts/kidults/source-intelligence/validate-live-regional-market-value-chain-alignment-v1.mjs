import fs from 'node:fs';

const path = 'coordination/kidults/architecture/live-regional-market-value-chain-alignment-v1.json';
const x = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
const rules = new Set(x.non_negotiable_rules || []);
for (const r of [
  'RAW_RECORDS_MUST_NOT_DIRECTLY_MUTATE_COLLECTION_QUOTAS',
  'RAW_RECORDS_MUST_NOT_DIRECTLY_MUTATE_ANALYTICAL_WEIGHTS',
  'COLLECTION_SHARE_IS_NOT_ANALYTICAL_WEIGHT',
  'MISSING_FACTOR_IS_UNKNOWN_NOT_ZERO',
  'BOOTSTRAP_VALUES_ARE_NOT_FACTUAL_MARKET_SHARE',
  'GLOBAL_CLAIMS_REQUIRE_GLOBAL_GEOGRAPHY_GATE',
  'TRACK_B_REMAINS_INDEPENDENT',
  'PRODUCTION_REQUIRES_SEPARATE_G5'
]) if (!rules.has(r)) fail(`missing rule ${r}`);

const stages = new Map((x.value_chain_bindings || []).map(v => [v.stage, v]));
for (const s of ['F0_GLOBAL_MARKET_SENSING','F1_SOURCE_IDENTITY_AND_CLASSIFICATION','F2_SOURCE_QUALIFICATION_ANALYSIS','F2B_REGIONAL_BASELINE_COMPILATION','F3_SOURCE_PORTFOLIO_DECISION','F4_RIGHTS_AWARE_COLLECTION_AND_CONTROL','F5A_CANONICAL_TRUTH_AND_MEMORY','F5B_EVIDENCE_AND_MARKET_GRAPH','F6_IRREPLACEABLE_MARKET_INTELLIGENCE','F7_GOVERNED_PROJECTION_AND_EXPERIENCE']) {
  if (!stages.has(s)) fail(`missing stage ${s}`);
}
if (!stages.get('F2B_REGIONAL_BASELINE_COMPILATION')?.output?.includes('REGIONAL_MARKET_BASELINE_SNAPSHOT')) fail('baseline snapshot output missing');
if (!stages.get('F3_SOURCE_PORTFOLIO_DECISION')?.output?.includes('REGIONAL_COLLECTION_QUOTA_PLAN')) fail('quota plan output missing');
if (!stages.get('F6_IRREPLACEABLE_MARKET_INTELLIGENCE')?.regional_role?.includes('separately from collection share')) fail('analysis/collection separation missing');
if (x.global_claim_gate_binding?.failure_state !== 'NOT_VERIFIED_GLOBAL') fail('global fail-closed state drift');
if (x.current_truth?.production !== 'HOLD') fail('production must remain HOLD');
if (x.current_truth?.live_market_scale_estimates_verified !== false) fail('must not claim verified live market scale yet');
if (x.current_truth?.live_market_maturity_scores_verified !== false) fail('must not claim verified live maturity yet');
for (const t of ['TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E']) if (!x.track_bindings?.[t]) fail(`missing ${t} binding`);
if (!process.exitCode) console.log('PASS: live regional market baseline is aligned across the KIDULTS value chain and remains fail-closed.');
