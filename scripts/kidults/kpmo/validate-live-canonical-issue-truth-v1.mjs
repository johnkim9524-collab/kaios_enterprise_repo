const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1431');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
const requireExactMain = process.env.REQUIRE_EXACT_MAIN_IN_ISSUES === 'true';
const canonicalIssues = [235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const trackedDefects = [1330,1412,1416,1419,1420,1421,1423,1427];
const forbiddenClosureClaims = [/INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,/INTERNAL BLOCKERS CLOSED/i,/CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,/CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i];
const canonicalBlockPattern = /<!-- KPMO_CANONICAL_TRUTH_V2_START -->([\s\S]*?)<!-- KPMO_CANONICAL_TRUTH_V2_END -->/g;

function fail(message){ console.error(`FAIL canonical issue truth: ${message}`); process.exit(1); }
if(!repository || !token || !/^[0-9a-f]{40}$/i.test(expectedMainSha||'')) fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
if(!Number.isInteger(correctionPrNumber)||correctionPrNumber<1) fail('CANONICAL_CORRECTION_PR_NUMBER must be a positive integer');
if(expectedCorrectionHead && !/^[0-9a-f]{40}$/i.test(expectedCorrectionHead)) fail('EXPECTED_CORRECTION_HEAD_SHA must be empty or an exact SHA');
const [owner,name]=repository.split('/'); if(!owner||!name) fail('GITHUB_REPOSITORY must be owner/name');
const issueAlias=n=>`i${n}`;

async function githubGraphql(){
  const requested=[...new Set([...canonicalIssues,...trackedDefects])];
  const issueSelections=requested.map(n=>`${issueAlias(n)}: issue(number: ${n}) { number body state }`).join('\n');
  const query=`query($owner:String!,$name:String!,$correction:Int!){ repository(owner:$owner,name:$name){ ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid}}} pullRequest(number:$correction){headRefOid baseRefName} ${issueSelections} } }`;
  const response=await fetch('https://api.github.com/graphql',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({query,variables:{owner,name,correction:correctionPrNumber}}),signal:AbortSignal.timeout(15000)});
  const text=await response.text(); if(!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0,500)}`);
  const payload=JSON.parse(text); if(payload.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors).slice(0,1000)}`); if(!payload.data?.repository) throw new Error('GraphQL repository payload unavailable'); return payload.data.repository;
}
async function githubRest(path){
  const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
  const text=await response.text(); if(!response.ok) throw new Error(`REST HTTP ${response.status}: ${text.slice(0,500)}`); return JSON.parse(text);
}
function canonicalMainSha(body){
  const blocks=[...String(body||'').matchAll(canonicalBlockPattern)]; if(!blocks.length) return '';
  return blocks.at(-1)[1].match(/protected main:\s*`([0-9a-f]{40})`/i)?.[1]||'';
}
function validateBodies(mainSha,correctionHead,issues,activeDefects,enforceCorrectionHead,enforceExactMain){
  const errors=[];
  for(const issue of issues){
    const body=issue.body||''; const recorded=canonicalMainSha(body);
    if(!recorded) errors.push(`#${issue.number} missing canonical protected-main SHA`);
    if(enforceExactMain && recorded!==mainSha) errors.push(`#${issue.number} missing exact protected-main SHA ${mainSha}`);
    if(!body.includes(`#${correctionPrNumber}`)) errors.push(`#${issue.number} missing canonical correction PR #${correctionPrNumber}`);
    if(enforceCorrectionHead && !body.includes(correctionHead)) errors.push(`#${issue.number} missing live correction head ${correctionHead}`);
    for(const pattern of forbiddenClosureClaims) if(pattern.test(body)) errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
    for(const defect of activeDefects) if(!body.includes(`#${defect}`)) errors.push(`#${issue.number} omits active defect #${defect}`);
  }
  return errors;
}
async function validateMonotonicMain(mainSha,issues){
  const errors=[]; const groups=new Map();
  for(const issue of issues){ const recorded=canonicalMainSha(issue.body||''); if(!recorded) continue; if(!groups.has(recorded)) groups.set(recorded,[]); groups.get(recorded).push(issue.number); }
  for(const [recorded,numbers] of groups){
    if(recorded===mainSha) continue;
    try{
      const comparison=await githubRest(`/compare/${recorded}...${mainSha}`);
      if(!['ahead','identical'].includes(comparison.status)) errors.push(`#${numbers.join(',#')} canonical main ${recorded} is not ancestor-or-equal to protected main ${mainSha} (status=${comparison.status||'UNKNOWN'})`);
    }catch(error){ errors.push(`#${numbers.join(',#')} canonical main ${recorded} cannot be proven ancestor of ${mainSha}: ${error.message}`); }
  }
  return errors;
}

const live=await githubGraphql();
const observedMainSha=live.ref?.target?.oid||''; if(!/^[0-9a-f]{40}$/i.test(observedMainSha)) fail('live protected-main SHA is unavailable');
const correctionPrValidation=Boolean(expectedCorrectionHead);
if(!correctionPrValidation && observedMainSha!==expectedMainSha) fail(`main moved: expected ${expectedMainSha}, observed ${observedMainSha}`);
const effectiveMainSha=correctionPrValidation?observedMainSha:expectedMainSha;
const correctionPr=live.pullRequest; const correctionHead=correctionPr?.headRefOid||'';
if(!/^[0-9a-f]{40}$/i.test(correctionHead)) fail('canonical correction PR head is unavailable');
if(correctionPr?.baseRefName!=='main') fail(`canonical correction PR targets ${correctionPr?.baseRefName||'UNKNOWN'}, not main`);
if(expectedCorrectionHead && correctionHead!==expectedCorrectionHead) fail(`correction head moved: expected event head ${expectedCorrectionHead}, observed ${correctionHead}`);
const issueByNumber=new Map();
for(const number of [...new Set([...canonicalIssues,...trackedDefects])]){ const issue=live[issueAlias(number)]; if(!issue||issue.number!==number) fail(`issue #${number} unavailable from batch truth read`); issueByNumber.set(number,{number:issue.number,body:issue.body||'',state:String(issue.state||'').toLowerCase()}); }
const issues=canonicalIssues.map(n=>issueByNumber.get(n)); const defectIssues=trackedDefects.map(n=>issueByNumber.get(n)); const activeDefects=defectIssues.filter(i=>i.state==='open').map(i=>i.number);
const staticErrors=validateBodies(effectiveMainSha,correctionHead,issues,activeDefects,requireLiveCorrectionHead,requireExactMain);
const monotonicErrors=requireExactMain?[]:await validateMonotonicMain(effectiveMainSha,issues);
const errors=[...staticErrors,...monotonicErrors]; if(errors.length) fail(errors.join('; '));

const mainMutation=structuredClone(issues); const firstRecorded=canonicalMainSha(mainMutation[0].body);
mainMutation[0].body=mainMutation[0].body.replace(firstRecorded,'1111111111111111111111111111111111111111');
if(requireExactMain){ if(!validateBodies(effectiveMainSha,correctionHead,mainMutation,activeDefects,requireLiveCorrectionHead,true).length) fail('stale-main mutation was not rejected'); }
else { if(!(await validateMonotonicMain(effectiveMainSha,mainMutation)).length) fail('non-ancestor main mutation was not rejected'); }
const correctionMutation=structuredClone(issues); correctionMutation[0].body=`${correctionMutation[0].body}\n#${correctionPrNumber} exact head ${correctionHead}\n`.replaceAll(correctionHead,'1111111111111111111111111111111111111111'); if(!validateBodies(effectiveMainSha,correctionHead,correctionMutation,activeDefects,true,requireExactMain).length) fail('stale-correction-head mutation was not rejected');
if(activeDefects.length){ const omissionMutation=structuredClone(issues); omissionMutation[0].body=omissionMutation[0].body.replaceAll(`#${activeDefects[0]}`,''); if(!validateBodies(effectiveMainSha,correctionHead,omissionMutation,activeDefects,requireLiveCorrectionHead,requireExactMain).length) fail('active-defect omission mutation was not rejected'); }
const closureMutationTexts=['## Internal reversible-control truth — CLOSED AT CURRENT MAIN','## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED','## CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED'];
for(const mutationText of closureMutationTexts){ const closureMutation=structuredClone(issues); closureMutation[0].body+=`\n${mutationText}\n`; if(!validateBodies(effectiveMainSha,correctionHead,closureMutation,activeDefects,requireLiveCorrectionHead,requireExactMain).length) fail(`unsupported-closure mutation was not rejected: ${mutationText}`); }
console.log(JSON.stringify({validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',state:'VERIFIED_PASS',protected_main_sha:effectiveMainSha,event_base_sha:expectedMainSha,live_main_observed:observedMainSha,main_policy:requireExactMain?'EXACT_CURRENT_MAIN':'MONOTONIC_ANCESTOR_OR_EQUAL',correction_pr_validation:correctionPrValidation,canonical_correction_pr:correctionPrNumber,canonical_correction_head:correctionHead,live_correction_head_enforced_in_issues:requireLiveCorrectionHead,canonical_issues:canonicalIssues,active_defects:activeDefects,github_read_mode:'SINGLE_GRAPHQL_BATCH_PLUS_COMPARE',non_ancestor_main_mutation_rejected:true,stale_correction_head_mutation_rejected:true,active_defect_omission_mutation_rejected:activeDefects.length>0,unsupported_closure_mutations_rejected:closureMutationTexts.length,empirical_promotion:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
