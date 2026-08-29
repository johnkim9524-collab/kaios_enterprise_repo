#!/usr/bin/env node

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
function validateLatest(body,active){
 const block=latest(body); const errors=[];
 if(!block) errors.push('LATEST_BLOCK_MISSING');
 if(!block.includes(`#${correctionPr}`)) errors.push(`LATEST_BLOCK_MISSING_CORRECTION_${correctionPr}`);
 for(const n of active) if(!block.includes(`#${n}`)) errors.push(`LATEST_BLOCK_MISSING_ACTIVE_${n}`);
 if(!/protected main:\s*`[0-9a-f]{40}`/i.test(block)) errors.push('LATEST_BLOCK_MAIN_SHA_MISSING');
 return errors;
}
function selfTest(){
 const history=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`1111111111111111111111111111111111111111\`\n#1431 #1330\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 const current=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`2222222222222222222222222222222222222222\`\n#1431 #1330\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 if(validateLatest(`${history}\n${current}`,[1330]).length) throw new Error('SELF_VALID_REJECTED');
 const bad=`<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`2222222222222222222222222222222222222222\`\ncurrent only\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
 const e=validateLatest(`${history}\n${bad}`,[1330]);
 if(!e.some(x=>x.includes('CORRECTION'))||!e.some(x=>x.includes('ACTIVE'))) throw new Error('HISTORICAL_FALLBACK_NOT_REJECTED');
 console.log(JSON.stringify({state:'VERIFIED_PASS',historical_fallback_rejected:true}));
}
if(process.argv.includes('--self-test')){selfTest();process.exit(0);}
const baseline=await Promise.all(baselineTrustRootDefects.map(n=>get(`/issues/${n}`)));
const active=baseline.filter(x=>x.state==='open').map(x=>x.number);
const issues=await Promise.all(canonicalIssues.map(n=>get(`/issues/${n}`)));
const failures=[];
for(const issue of issues){for(const e of validateLatest(issue.body,active)) failures.push(`#${issue.number}:${e}`);}
if(failures.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',failures,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));process.exit(1);}
console.log(JSON.stringify({state:'VERIFIED_PASS',canonical_issue_count:issues.length,active_baseline_defects:active,latest_block_only:true,historical_fallback_rejected:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
