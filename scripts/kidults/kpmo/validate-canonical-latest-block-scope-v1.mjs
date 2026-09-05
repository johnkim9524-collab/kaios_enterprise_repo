#!/usr/bin/env node
import {execFileSync} from 'node:child_process';

const canonicalIssues=[235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const baselineTrustRootDefects=[1330,1412,1416,1419,1420,1421,1423,1427];
const correctionPr=1431;
const pattern=/<!-- KPMO_CANONICAL_TRUTH_V2_START -->([\s\S]*?)<!-- KPMO_CANONICAL_TRUTH_V2_END -->/g;
const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(!repo||!token) throw new Error('REPOSITORY_OR_TOKEN_MISSING');
const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
async function get(path){
 const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{headers,signal:AbortSignal.timeout(20000)});
 const t=await r.text(); if(!r.ok) throw new Error(`GITHUB_HTTP_${r.status}:${t.slice(0,300)}`); return JSON.parse(t);
}
function latest(body){const blocks=[...String(body||'').matchAll(pattern)];return blocks.length?blocks.at(-1)[1]:'';}
function validateLatest(body,active,expectedMainSha){
 const block=latest(body); const errors=[];
 if(!block) errors.push('LATEST_BLOCK_MISSING');
 if(!block.includes(`#${correctionPr}`)) errors.push(`LATEST_BLOCK_MISSING_CORRECTION_${correctionPr}`);
 for(const n of active) if(!block.includes(`#${n}`)) errors.push(`LATEST_BLOCK_MISSING_ACTIVE_${n}`);
 if(!/^[0-9a-f]{40}$/i.test(expectedMainSha||'')) errors.push('EXPECTED_MAIN_SHA_INVALID');
 else if(!block.includes(`protected main: \`${expectedMainSha}\``)) errors.push(`LATEST_BLOCK_STALE_MAIN_SHA_EXPECTED_${expectedMainSha}`);
 if(!/Production\/Public\/G5:\s*\*{0,2}HOLD\*{0,2}/i.test(block)) errors.push('LATEST_BLOCK_HOLD_MISSING');
 return errors;
}
function selfTest(){
 const expected='2222222222222222222222222222222222222222';
 const history=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`1111111111111111111111111111111111111111\`\n#1431 #1330\nProduction/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 const current=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`${expected}\`\n#1431 #1330\nProduction/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 if(validateLatest(`${history}\n${current}`,[1330],expected).length) throw new Error('SELF_VALID_REJECTED');
 const badMarkers=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`${expected}\`\ncurrent only\nProduction/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 const markerErrors=validateLatest(`${history}\n${badMarkers}`,[1330],expected);
 if(!markerErrors.some(x=>x.includes('CORRECTION'))||!markerErrors.some(x=>x.includes('ACTIVE'))) throw new Error('HISTORICAL_FALLBACK_NOT_REJECTED');
 const stale=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`1111111111111111111111111111111111111111\`\n#1431 #1330\nProduction/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 if(!validateLatest(stale,[1330],expected).some(x=>x.includes('STALE_MAIN_SHA'))) throw new Error('STALE_MAIN_SHA_NOT_REJECTED');
 const missingHold=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`${expected}\`\n#1431 #1330\nProduction/Public/G5: PASS\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 if(!validateLatest(missingHold,[1330],expected).includes('LATEST_BLOCK_HOLD_MISSING')) throw new Error('MISSING_HOLD_NOT_REJECTED');
 console.log(JSON.stringify({state:'VERIFIED_PASS',historical_fallback_rejected:true,stale_main_rejected:true,hold_required:true,v3_authority_requires_exact_committed_generation:true}));
}
function tryV3Authority(){
 try{
  const text=execFileSync(process.execPath,['scripts/kidults/kpmo/canonical-generation-v3.mjs'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']});
  const v3=JSON.parse(text);
  if(v3?.state!=='VERIFIED_PASS'||v3?.authority_model!=='CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT'||v3?.canonical_issue_count!==25||v3?.promotion_eligible!==false||v3?.production!=='HOLD'||v3?.public!=='HOLD'||v3?.g5!=='HOLD') throw new Error('V3_AUTHORITY_OUTPUT_INVALID');
  console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:v3.authority_model,protected_main_sha:v3.protected_main_sha,generation_id:v3.generation_id,aggregate_comment_id:v3.aggregate_comment_id,canonical_issue_count:v3.canonical_issue_count,material_defect_count:v3.material_defect_count,material_defect_registry_sha256:v3.material_defect_registry_sha256,legacy_v2_body_authority:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
  return true;
 }catch(error){
  console.error(`CANONICAL_V3_AUTHORITY_UNAVAILABLE_FALLING_BACK_TO_V2:${error instanceof Error?error.message:String(error)}`);
  return false;
 }
}
if(process.argv.includes('--self-test')){selfTest();process.exit(0);}
if(tryV3Authority())process.exit(0);
const liveMain=await get('/branches/main');
const expectedMainSha=String(liveMain?.commit?.sha||'');
if(!/^[0-9a-f]{40}$/i.test(expectedMainSha)) throw new Error('LIVE_MAIN_SHA_INVALID');
const baseline=await Promise.all(baselineTrustRootDefects.map(n=>get(`/issues/${n}`)));
const active=baseline.filter(x=>x.state==='open').map(x=>x.number);
const issues=await Promise.all(canonicalIssues.map(n=>get(`/issues/${n}`)));
const failures=[];
for(const issue of issues){for(const e of validateLatest(issue.body,active,expectedMainSha)) failures.push(`#${issue.number}:${e}`);}
if(failures.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',authority_model:'LEGACY_V2_BODY_FALLBACK',expected_main_sha:expectedMainSha,failures,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));process.exit(1);}
console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:'LEGACY_V2_BODY_FALLBACK',expected_main_sha:expectedMainSha,canonical_issue_count:issues.length,active_baseline_defects:active,latest_block_only:true,historical_fallback_rejected:true,stale_main_rejected:true,hold_required:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
