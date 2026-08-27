import fs from 'node:fs';

const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
const expectedMainSha=process.env.EXPECTED_PROTECTED_MAIN_SHA;
const truthPhase=process.env.CANONICAL_TRUTH_PHASE||'SYNCHRONIZED';
const validationEvent=process.env.CANONICAL_VALIDATION_EVENT||'';
const correctionPrNumber=Number(process.env.CANONICAL_CORRECTION_PR_NUMBER||'1443');
const expectedCorrectionHead=process.env.EXPECTED_CORRECTION_HEAD_SHA||'';
const requireCorrectionHead=process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES==='true';
const canonicalIssues=[235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const trackedDefects=[1330,1412,1416,1419,1420,1421,1423,1427];
const receiptMarker='<!-- KPMO_CANONICAL_TRUTH_RECEIPT_V3 -->';
const truthStart='<!-- KPMO_CANONICAL_TRUTH_V2_START -->';
const truthEnd='<!-- KPMO_CANONICAL_TRUTH_V2_END -->';
const forbidden=[/INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,/INTERNAL BLOCKERS CLOSED/i,/CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,/CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i];
const isSha=v=>/^[0-9a-f]{40}$/i.test(v||'');
function fail(m){console.error(`FAIL canonical issue truth: ${m}`);process.exit(1);}
if(!repository||!token||!isSha(expectedMainSha))fail('repository, token and exact expected main required');
if(!['PREMERGE','TRANSITION','SYNCHRONIZED'].includes(truthPhase))fail(`unsupported phase ${truthPhase}`);
if(!Number.isInteger(correctionPrNumber)||correctionPrNumber<1)fail('invalid correction PR');
if(expectedCorrectionHead&&!isSha(expectedCorrectionHead))fail('invalid correction head');
const [owner,name]=repository.split('/');if(!owner||!name)fail('repository must be owner/name');
const alias=n=>`i${n}`;

async function graphql(){
 const nums=[...new Set([...canonicalIssues,...trackedDefects])];
 const issues=nums.map(n=>`${alias(n)}: issue(number:${n}){number body state comments(last:20){nodes{body createdAt author{login}}}}`).join('\n');
 const q=`query($owner:String!,$name:String!,$correction:Int!){repository(owner:$owner,name:$name){ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid parents(first:1){nodes{oid}}}}} pullRequest(number:$correction){headRefOid baseRefName state merged} ${issues}}}`;
 const r=await fetch('https://api.github.com/graphql',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({query:q,variables:{owner,name,correction:correctionPrNumber}}),signal:AbortSignal.timeout(15000)});
 const t=await r.text();if(!r.ok)throw new Error(`GraphQL HTTP ${r.status}: ${t.slice(0,500)}`);const p=JSON.parse(t);if(p.errors?.length)throw new Error(JSON.stringify(p.errors).slice(0,1000));if(!p.data?.repository)throw new Error('repository payload unavailable');return p.data.repository;
}
function legacyBlock(body,number){const s=body.indexOf(truthStart),e=body.indexOf(truthEnd);if(s<0||e<0||e<=s)fail(`#${number} missing legacy canonical block`);return body.slice(s,e+truthEnd.length);}
function authoritative(issue){const trusted=new Set([owner,'github-actions[bot]']);const receipts=(issue.comments?.nodes||[]).filter(c=>trusted.has(c.author?.login||'')&&(c.body||'').includes(receiptMarker));if(receipts.length)return{source:'APPEND_ONLY_RECEIPT_V3',text:receipts.at(-1).body||''};return{source:'LEGACY_BODY_V2',text:legacyBlock(issue.body||'',issue.number)};}
function generation(text,number){const m=text.match(/(?:protected_main_sha:\s*`|- protected main:\s*`)([0-9a-f]{40})`/i);if(!m)fail(`#${number} authoritative truth missing exact generation SHA`);return m[1].toLowerCase();}
function validateTexts(bodyMain,correctionHead,issues,active,enforceHead){const errors=[];for(const issue of issues){const {text,source}=authoritative(issue);if(!text.includes(bodyMain))errors.push(`#${issue.number} ${source} missing ${bodyMain}`);if(!text.includes(`#${correctionPrNumber}`))errors.push(`#${issue.number} ${source} missing correction #${correctionPrNumber}`);if(enforceHead&&!text.includes(correctionHead))errors.push(`#${issue.number} ${source} missing correction head ${correctionHead}`);for(const p of forbidden)if(p.test(text))errors.push(`#${issue.number} ${source} unsupported closure`);for(const d of active)if(!text.includes(`#${d}`))errors.push(`#${issue.number} ${source} omits active defect #${d}`);}return errors;}

const live=await graphql();
const observedMain=live.ref?.target?.oid||'',parent=live.ref?.target?.parents?.nodes?.[0]?.oid||'';
if(!isSha(observedMain))fail('live main unavailable');
if(truthPhase!=='PREMERGE'&&observedMain!==expectedMainSha)fail(`main moved: expected ${expectedMainSha}, observed ${observedMain}`);
const pr=live.pullRequest,correctionHead=pr?.headRefOid||'';if(!isSha(correctionHead))fail('correction head unavailable');if(pr?.baseRefName!=='main')fail('correction PR does not target main');if(expectedCorrectionHead&&correctionHead!==expectedCorrectionHead)fail(`correction head moved: expected ${expectedCorrectionHead}, observed ${correctionHead}`);
const map=new Map();for(const n of [...new Set([...canonicalIssues,...trackedDefects])]){const i=live[alias(n)];if(!i||i.number!==n)fail(`#${n} unavailable`);map.set(n,{number:n,body:i.body||'',state:String(i.state||'').toLowerCase(),comments:i.comments||{nodes:[]}});}
const issues=canonicalIssues.map(n=>map.get(n)),active=trackedDefects.filter(n=>map.get(n).state==='open');
const gens=issues.map(i=>generation(authoritative(i).text,i.number));const set=[...new Set(gens)];if(set.length!==1)fail(`canonical generations diverged: ${set.join(',')}`);const bodyMain=set[0];
if(truthPhase==='TRANSITION'){if(!isSha(parent))fail('main parent unavailable');const allowed=new Set([observedMain,parent]);if(!allowed.has(bodyMain))fail(`TRANSITION requires current main or immediate parent ${parent}, observed ${bodyMain}`);}
if(truthPhase==='SYNCHRONIZED'&&bodyMain!==observedMain)fail(`SYNCHRONIZED requires current main ${observedMain}, observed ${bodyMain}`);
if(truthPhase==='PREMERGE'){const allowed=new Set([observedMain,parent].filter(isSha));if(!allowed.has(bodyMain))fail(`PREMERGE generation ${bodyMain} must be current main or immediate parent`);}
const errors=validateTexts(bodyMain,correctionHead,issues,active,requireCorrectionHead);if(errors.length)fail(errors.join('; '));
const stale=structuredClone(issues);const sa=authoritative(stale[0]);if(sa.source==='APPEND_ONLY_RECEIPT_V3')stale[0].comments.nodes.at(-1).body=(stale[0].comments.nodes.at(-1).body||'').replaceAll(bodyMain,'0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');else stale[0].body=stale[0].body.replaceAll(bodyMain,'0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');if(!validateTexts(bodyMain,correctionHead,stale,active,requireCorrectionHead).length)fail('stale-main mutation escaped');
if(active.length){const om=structuredClone(issues),oa=authoritative(om[0]);if(oa.source==='APPEND_ONLY_RECEIPT_V3')om[0].comments.nodes.at(-1).body=(om[0].comments.nodes.at(-1).body||'').replaceAll(`#${active[0]}`,'');else om[0].body=om[0].body.replaceAll(`#${active[0]}`,'');if(!validateTexts(bodyMain,correctionHead,om,active,requireCorrectionHead).length)fail('active-defect omission escaped');}
const cl=structuredClone(issues),ca=authoritative(cl[0]),bad='## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED';if(ca.source==='APPEND_ONLY_RECEIPT_V3')cl[0].comments.nodes.at(-1).body+=`\n${bad}`;else cl[0].body+=`\n${bad}`;if(!validateTexts(bodyMain,correctionHead,cl,active,requireCorrectionHead).length)fail('false-closure mutation escaped');
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`canonical_body_main_sha=${bodyMain}\n`);
console.log(JSON.stringify({validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',state:'VERIFIED_PASS',truth_phase:truthPhase,validation_event:validationEvent,protected_main_sha:observedMain,canonical_body_main_sha:bodyMain,live_main_parent:parent||null,canonical_correction_pr:correctionPrNumber,canonical_correction_head:correctionHead,canonical_issues:canonicalIssues,active_defects:active,truth_source_policy:'LATEST_TRUSTED_APPEND_ONLY_RECEIPT_V3_ELSE_LEGACY_BODY_V2',github_read_mode:'SINGLE_GRAPHQL_BATCH',stale_main_mutation_rejected:true,active_defect_omission_mutation_rejected:active.length>0,false_closure_mutation_rejected:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
