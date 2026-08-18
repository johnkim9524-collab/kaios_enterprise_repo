#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/poc/global-market-evidence-poc-v2-diagnostic-exit-v1.json';const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.empirical_results.attention.mapped!==60||x.empirical_results.attention.history_300d_plus!==59||x.empirical_results.attention.errors!==0) throw new Error('ATTENTION_EMPIRICAL_MISMATCH');
if(x.empirical_results.regional.mapped!==60||x.empirical_results.regional.multi_region_representation!==55||x.empirical_results.regional.scopes_with_multi_region_representation!==31||x.empirical_results.regional.errors!==0) throw new Error('REGIONAL_EMPIRICAL_MISMATCH');
const c=x.empirical_results.challenger_terminalization;if(c.slots!==160||c.selected!==0||c.partial_evidence!==64||c.blocked_regional_independence!==32||c.blocked_market_activity!==64) throw new Error('TERMINALIZATION_MISMATCH');
if(x.eight_category_stress_test.decision!=='NO_CANONICAL_CATEGORY_CHANGE_JUSTIFIED_BY_CURRENT_POC') throw new Error('CATEGORY_DECISION');
if(x.provider_necessity_disposition.platform_wide_provider_required!==false||x.provider_necessity_disposition.broad_provider_contact!=='NOT_RECOMMENDED') throw new Error('PROVIDER_DISPOSITION');
if(x.diagnostic_exit.full_320_run!=='NOT_EXECUTED_BY_DESIGN'||x.diagnostic_exit.success!=='YES_DEFECT_FINDING_OBJECTIVE_MET') throw new Error('DIAGNOSTIC_EXIT');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('HOLD_GATE');
console.log(JSON.stringify({status:'PASS',attention:x.empirical_results.attention,regional:x.empirical_results.regional,challenger:c,category:x.eight_category_stress_test.decision,platform_provider_required:x.provider_necessity_disposition.platform_wide_provider_required,full_320:x.diagnostic_exit.full_320_run},null,2));
