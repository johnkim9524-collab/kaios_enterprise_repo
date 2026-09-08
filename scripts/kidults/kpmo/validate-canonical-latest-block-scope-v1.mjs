#!/usr/bin/env node
import {execFileSync} from 'node:child_process';

const MEMBERS=[235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const V2_START='<!-- KPMO_CANONICAL_TRUTH_V2_START -->';
const V2_END='<!-- KPMO_CANONICAL_TRUTH_V2_END -->';

function assertV3Authority(v3) {
  if(v3?.state!=='VERIFIED_PASS') throw new Error('V3_STATE_NOT_PASS');
  if(v3?.authority_model!=='CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT') throw new Error('V3_AUTHORITY_MODEL_INVALID');
  if(!/^[0-9a-f]{40}$/.test(v3?.protected_main_sha||'')) throw new Error('V3_MAIN_SHA_INVALID');
  if(!/^kpmo-canonical-v3-[0-9a-f]{12}-[1-9][0-9]*-[1-9][0-9]*$/.test(v3?.generation_id||'')) throw new Error('V3_GENERATION_ID_INVALID');
  if(!Number.isInteger(v3?.aggregate_comment_id)||v3.aggregate_comment_id<1) throw new Error('V3_AGGREGATE_COMMENT_INVALID');
  if(v3?.canonical_issue_count!==25||!Array.isArray(v3?.canonical_issues)||v3.canonical_issues.length!==25) throw new Error('V3_CANONICAL_CARDINALITY_INVALID');
  if(!Number.isInteger(v3?.material_defect_count)||v3.material_defect_count<0) throw new Error('V3_MATERIAL_COUNT_INVALID');
  if(!/^sha256:[0-9a-f]{64}$/.test(v3?.material_defect_registry_sha256||'')) throw new Error('V3_MATERIAL_DIGEST_INVALID');
  if(v3?.promotion_eligible!==false||v3?.production!=='HOLD'||v3?.public!=='HOLD'||v3?.g5!=='HOLD') throw new Error('V3_HOLD_BOUNDARY_INVALID');
  return true;
}

function latestV2Block(body){
  const escapedStart=V2_START.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const escapedEnd=V2_END.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const blocks=[...String(body||'').matchAll(new RegExp(`${escapedStart}([\\s\\S]*?)${escapedEnd}`,'g'))];
  return blocks.length?blocks.at(-1)[1]:null;
}

function assertV2IssueBody(body,issueNumber,mainSha){
  if(!/^[0-9a-f]{40}$/i.test(mainSha||'')) throw new Error('V2_MAIN_SHA_INVALID');
  const block=latestV2Block(body);
  if(block===null) throw new Error(`ISSUE_${issueNumber}_V2_BLOCK_MISSING`);
  const recorded=block.match(/protected main:\s*`([0-9a-f]{40})`/i)?.[1]||'';
  if(recorded!==mainSha) throw new Error(`ISSUE_${issueNumber}_V2_STALE_MAIN_${recorded||'NONE'}_EXPECTED_${mainSha}`);
  const hold=/Production\/Public\/G5:\s*\*\*HOLD\*\*/i.test(block)||(block.includes('Production/Public/G5')&&/\bHOLD\b/i.test(block));
  if(!hold) throw new Error(`ISSUE_${issueNumber}_V2_RELEASE_HOLD_MISSING`);
  if(/Production\/Public\/G5[^\n]*(?:PASS|GO|AUTHORIZED)/i.test(block)) throw new Error(`ISSUE_${issueNumber}_V2_RELEASE_ELEVATION_FORBIDDEN`);
  return true;
}

async function verifyV2Board(){
  const repo=process.env.GITHUB_REPOSITORY;
  const token=process.env.GITHUB_TOKEN;
  if(!repo) throw new Error('V2_REPOSITORY_MISSING');
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})};
  const mainRes=await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`,{headers});
  if(!mainRes.ok) throw new Error(`V2_MAIN_REF_HTTP_${mainRes.status}`);
  const mainSha=(await mainRes.json()).object?.sha;
  if(!/^[0-9a-f]{40}$/i.test(mainSha||'')) throw new Error('V2_LIVE_MAIN_INVALID');
  const results=await Promise.all(MEMBERS.map(async(issueNumber)=>{
    const response=await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`,{headers});
    if(!response.ok) throw new Error(`ISSUE_${issueNumber}_HTTP_${response.status}`);
    const issue=await response.json();
    assertV2IssueBody(issue.body,issueNumber,mainSha);
    return issueNumber;
  }));
  if(results.length!==25||new Set(results).size!==25) throw new Error('V2_CANONICAL_CARDINALITY_INVALID');
  return mainSha;
}

function selfTest(){
  const validV3={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',protected_main_sha:'a'.repeat(40),generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-123-1',aggregate_comment_id:100,canonical_issue_count:25,canonical_issues:Array.from({length:25},(_,i)=>i+1),material_defect_count:2,material_defect_registry_sha256:`sha256:${'1'.repeat(64)}`,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  assertV3Authority(validV3);
  const v3Mutations=[
    {...validV3,state:'VERIFIED_FAIL'},
    {...validV3,protected_main_sha:'b'.repeat(39)},
    {...validV3,canonical_issue_count:24},
    {...validV3,material_defect_registry_sha256:`sha256:${'0'.repeat(63)}`},
    {...validV3,production:'PASS'}
  ];
  for(const mutated of v3Mutations){let rejected=false;try{assertV3Authority(mutated);}catch{rejected=true;}if(!rejected)throw new Error('V3_AUTHORITY_MUTATION_ESCAPED');}

  const main='a'.repeat(40);
  const validBlock=`${V2_START}\nprotected main: \`${main}\`\nProduction/Public/G5: **HOLD**\n${V2_END}`;
  assertV2IssueBody(validBlock,235,main);
  const v2Mutations=[
    'no canonical block',
    `${V2_START}\nprotected main: \`${'b'.repeat(40)}\`\nProduction/Public/G5: **HOLD**\n${V2_END}`,
    `${V2_START}\nprotected main: \`${main}\`\nProduction/Public/G5: PASS\n${V2_END}`,
    `${validBlock}\n${V2_START}\nprotected main: \`${'b'.repeat(40)}\`\nProduction/Public/G5: **HOLD**\n${V2_END}`
  ];
  for(const mutated of v2Mutations){let rejected=false;try{assertV2IssueBody(mutated,235,main);}catch{rejected=true;}if(!rejected)throw new Error('V2_AUTHORITY_MUTATION_ESCAPED');}
  console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:'CANONICAL_V2_REQUIRED_PLUS_V3',v2_member_count:MEMBERS.length,v2_negative_cases:v2Mutations.length,v3_negative_cases:v3Mutations.length,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'}));
}

if(process.argv.includes('--self-test')){selfTest();process.exit(0);}
try{
  const v2Main=await verifyV2Board();
  const text=execFileSync(process.execPath,['scripts/kidults/kpmo/canonical-generation-v3.mjs'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']});
  const v3=JSON.parse(text);
  assertV3Authority(v3);
  if(v3.protected_main_sha!==v2Main) throw new Error(`V3_MAIN_NOT_CURRENT_${v3.protected_main_sha}_EXPECTED_${v2Main}`);
  console.log(JSON.stringify({state:'VERIFIED_PASS',authority_model:'CANONICAL_V2_REQUIRED_PLUS_V3',protected_main_sha:v2Main,generation_id:v3.generation_id,aggregate_comment_id:v3.aggregate_comment_id,canonical_issue_count:v3.canonical_issue_count,material_defect_count:v3.material_defect_count,material_defect_registry_sha256:v3.material_defect_registry_sha256,v2_issue_body_authority_required:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
}catch(error){
  console.error(JSON.stringify({state:'VERIFIED_FAIL',authority_model:'CANONICAL_V2_REQUIRED_PLUS_V3',failure_class:error instanceof Error?error.message:String(error),v2_issue_body_authority_required:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
  process.exit(1);
}
