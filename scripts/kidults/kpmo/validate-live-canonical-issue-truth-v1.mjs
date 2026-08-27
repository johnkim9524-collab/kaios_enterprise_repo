import fs from 'node:fs';

const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
const expectedMainSha=process.env.EXPECTED_PROTECTED_MAIN_SHA;
const validationEvent=process.env.CANONICAL_VALIDATION_EVENT||'';
const correctionPrNumber=Number(process.env.CANONICAL_CORRECTION_PR_NUMBER||'1431');
const canonicalIssues=[235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const trackedDefects=[1330,1412,1416,1419,1420,1421,1423,1427];
const truthStart='<!-- KPMO_CANONICAL_TRUTH_V2_START -->';
const truthEnd='<!-- KPMO_CANONICAL_TRUTH_V2_END -->';
const forbidden=[/INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,/INTERNAL BLOCKERS CLOSED/i,/CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,/CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i];
const isSha=v=>/^[0-9a-f]{40}$/i.test(v||'');
function fail(m){console.error(`FAIL canonical issue truth: ${m}`);process.exit(1);}
if(!repository||!token||!isSha(expectedMainSha))fail('repository, token and exact expected main required');
if(!Number.isInteger(correctionPrNumber)||correctionPrNumber<1)fail('invalid correction PR');
const [owner,name]=repository.split('/');if(!owner||!name)fail('repository must be owner/name');
const alias=n=>`i${n}`;

async function graphql(){const nums=[...new Set([...canonicalIssues,...trackedDefects])];const selections=nums.map(n=>`${alias(n)}: issue(number:${n}){number body state}`).join('\n');const query=`query($owner:String!,$name:String!){repository(owner:$owner,name:$name){ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid}}} ${selections}}}`;const r=await fetch('https://api.github.com/graphql',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({query,variables:{owner,name}}),signal:AbortSignal.timeout(15000)});const text=await r.text();if(!r.ok)throw new Error(`GraphQL HTTP ${r.status}: ${text.slice(0,500)}`);const payload=JSON.parse(text);if(payload.errors?.length)throw new Error(JSON.stringify(payload.errors).slice(0,1000));if(!payload.data?.repository)throw new Error('repository payload unavailable');return payload.data.repository;}
async function github(path){const r=await fetch(`https://api.github.com/repos/${repository}${path}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});const text=await r.text();if(!r.ok)throw new Error(`GET ${path} HTTP ${r.status}: ${text.slice(0,500)}`);return JSON.parse(text);}
function canonicalBlock(body,number){const source=String(body||'');const s=source.lastIndexOf(truthStart),e=source.lastIndexOf(truthEnd);if(s<0||e<0||e<=s)fail(`#${number} missing canonical V2 block`);return source.slice(s,e+truthEnd.length);}
function anchor(block,number){const m=block.match(/- protected main:\s*`([0-9a-f]{40})`/i);if(!m)fail(`#${number} canonical V2 block missing protected-main anchor`);return m[1].toLowerCase();}
function staticErrors(issues,active){const errors=[];for(const issue of issues){const block=canonicalBlock(issue.body,issue.number);if(!block.includes(`#${correctionPrNumber}`))errors.push(`#${issue.number} missing canonical correction #${correctionPrNumber}`);for(const p of forbidden)if(p.test(block))errors.push(`#${issue.number} unsupported closure claim`);for(const d of active)if(!block.includes(`#${d}`))errors.push(`#${issue.number} omits active defect #${d}`);}return errors;}

const live=await graphql();const observedMain=live.ref?.target?.oid||'';if(!isSha(observedMain))fail('live main unavailable');if(observedMain!==expectedMainSha)fail(`main moved: expected ${expectedMainSha}, observed ${observedMain}`);
const map=new Map();for(const n of [...new Set([...canonicalIssues,...trackedDefects])]){const i=live[alias(n)];if(!i||i.number!==n)fail(`#${n} unavailable`);map.set(n,{number:n,body:i.body||'',state:String(i.state||'').toLowerCase()});}
const issues=canonicalIssues.map(n=>map.get(n)),active=trackedDefects.filter(n=>map.get(n).state==='open');const errors=staticErrors(issues,active);if(errors.length)fail(errors.join('; '));
const anchors=new Map();for(const issue of issues){const sha=anchor(canonicalBlock(issue.body,issue.number),issue.number);if(!anchors.has(sha))anchors.set(sha,[]);anchors.get(sha).push(issue.number);}
for(const [sha,numbers] of anchors){if(sha===observedMain)continue;let comparison;try{comparison=await github(`/compare/${sha}...${observedMain}`);}catch(error){fail(`#${numbers.join(',#')} anchor ${sha} cannot be proven ancestor of ${observedMain}: ${error.message}`);}if(!['ahead','identical'].includes(comparison.status))fail(`#${numbers.join(',#')} anchor ${sha} is not ancestor-or-equal to protected main ${observedMain} (status=${comparison.status||'UNKNOWN'})`);}

const missing=structuredClone(issues);missing[0].body=missing[0].body.replace(canonicalBlock(missing[0].body,missing[0].number),'');let missingRejected=false;try{canonicalBlock(missing[0].body,missing[0].number);}catch{missingRejected=true;}if(!missingRejected)fail('missing canonical block mutation escaped');
if(active.length){const omission=structuredClone(issues);omission[0].body=omission[0].body.replaceAll(`#${active[0]}`,'');if(!staticErrors(omission,active).length)fail('active-defect omission mutation escaped');}
const closure=structuredClone(issues);const block=canonicalBlock(closure[0].body,closure[0].number);closure[0].body=closure[0].body.replace(block,`${block}\n## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED`);if(!staticErrors(closure,active).length)fail('false-closure mutation escaped');
if(process.env.GITHUB_OUTPUT){fs.appendFileSync(process.env.GITHUB_OUTPUT,`protected_main_sha=${observedMain}\n`);fs.appendFileSync(process.env.GITHUB_OUTPUT,`canonical_anchor_count=${anchors.size}\n`);}
console.log(JSON.stringify({validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',state:'VERIFIED_PASS',validation_event:validationEvent,protected_main_sha:observedMain,canonical_anchor_policy:'MONOTONIC_ANCESTOR_OR_EQUAL',canonical_anchor_count:anchors.size,canonical_anchors:[...anchors.entries()].map(([sha,numbers])=>({sha,issues:numbers})),canonical_correction_pr:correctionPrNumber,canonical_issues:canonicalIssues,active_defects:active,github_read_mode:'SINGLE_GRAPHQL_BATCH_PLUS_UNIQUE_ANCHOR_COMPARE',missing_block_mutation_rejected:true,active_defect_omission_mutation_rejected:active.length>0,false_closure_mutation_rejected:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
