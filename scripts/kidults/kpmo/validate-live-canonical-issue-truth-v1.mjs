const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const eventName = process.env.CANONICAL_VALIDATION_EVENT || '';
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const expectedBodyMainSha = process.env.EXPECTED_CANONICAL_BODY_MAIN_SHA || expectedMainSha;
const truthPhase = process.env.CANONICAL_TRUTH_PHASE || 'SYNCHRONIZED';
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1434');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
const canonicalIssues = [235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const trackedDefects = [1330,1412,1416,1419,1420,1421,1423,1427];
const receiptMarker = '<!-- KPMO_CANONICAL_TRUTH_RECEIPT_V3 -->';
const forbiddenClosureClaims = [
  /INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,
  /INTERNAL BLOCKERS CLOSED/i,
  /CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,
  /CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i
];

function fail(message) { console.error(`FAIL canonical issue truth: ${message}`); process.exit(1); }
if (!repository || !token || !/^[0-9a-f]{40}$/i.test(expectedMainSha || '')) fail('repository, token and exact expected main are required');
if (!/^[0-9a-f]{40}$/i.test(expectedBodyMainSha || '')) fail('expected canonical generation must be an exact SHA');
if (!['TRANSITION','SYNCHRONIZED'].includes(truthPhase)) fail('invalid canonical truth phase');
if (!Number.isInteger(correctionPrNumber) || correctionPrNumber < 1) fail('invalid correction PR');
if (expectedCorrectionHead && !/^[0-9a-f]{40}$/i.test(expectedCorrectionHead)) fail('invalid expected correction head');
const [owner,name] = repository.split('/');
if (!owner || !name) fail('repository must be owner/name');
const issueAlias = number => `i${number}`;

async function githubGraphql() {
  const requested = [...new Set([...canonicalIssues,...trackedDefects])];
  const issueSelections = requested.map(number => `${issueAlias(number)}: issue(number:${number}) { number body state comments(last:20) { nodes { body createdAt author { login } } } }`).join('\n');
  const query = `query($owner:String!,$name:String!,$correction:Int!){repository(owner:$owner,name:$name){ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid parents(first:1){nodes{oid}}}}} pullRequest(number:$correction){headRefOid baseRefName} ${issueSelections}}}`;
  const response = await fetch('https://api.github.com/graphql',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({query,variables:{owner,name,correction:correctionPrNumber}}),signal:AbortSignal.timeout(15000)});
  const text = await response.text();
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0,500)}`);
  const payload = JSON.parse(text);
  if (payload.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors).slice(0,1000)}`);
  if (!payload.data?.repository) throw new Error('GraphQL repository payload unavailable');
  return payload.data.repository;
}

function authoritativeText(issue) {
  const trustedAuthors = new Set([owner,'github-actions[bot]']);
  const receipts = (issue.comments?.nodes || []).filter(c => trustedAuthors.has(c.author?.login || '') && (c.body || '').includes(receiptMarker));
  if (receipts.length) return {text:receipts.at(-1).body || '', source:'APPEND_ONLY_RECEIPT'};
  return {text:issue.body || '', source:'LEGACY_BODY_FALLBACK'};
}

function validateTruth(mainSha, correctionHead, issues, activeDefects, enforceCorrectionHead) {
  const errors=[];
  for (const issue of issues) {
    const {text,source}=authoritativeText(issue);
    if (!text.includes(mainSha)) errors.push(`#${issue.number} ${source} missing canonical protected-main SHA ${mainSha}`);
    if (!text.includes(`#${correctionPrNumber}`)) errors.push(`#${issue.number} ${source} missing canonical correction PR #${correctionPrNumber}`);
    if (enforceCorrectionHead && !text.includes(correctionHead)) errors.push(`#${issue.number} ${source} missing live correction head ${correctionHead}`);
    for (const pattern of forbiddenClosureClaims) if (pattern.test(text)) errors.push(`#${issue.number} ${source} contains unsupported closure claim ${pattern}`);
    for (const defect of activeDefects) if (!text.includes(`#${defect}`)) errors.push(`#${issue.number} ${source} omits active defect #${defect}`);
  }
  return errors;
}

const live = await githubGraphql();
const observedMainSha = live.ref?.target?.oid || '';
const observedParentSha = live.ref?.target?.parents?.nodes?.[0]?.oid || '';
if (!/^[0-9a-f]{40}$/i.test(observedMainSha)) fail('live protected-main SHA unavailable');
const prValidation = eventName === 'pull_request';
const effectiveMainSha = prValidation ? observedMainSha : expectedMainSha;
if (!prValidation && observedMainSha !== expectedMainSha) fail(`main moved: expected ${expectedMainSha}, observed ${observedMainSha}`);
const effectiveBodyMainSha = prValidation ? observedMainSha : expectedBodyMainSha;
if (truthPhase === 'TRANSITION') {
  if (!/^[0-9a-f]{40}$/i.test(observedParentSha)) fail('live main parent unavailable for transition');
  if (effectiveBodyMainSha !== observedParentSha) fail(`transition generation must equal immediate parent ${observedParentSha}, received ${effectiveBodyMainSha}`);
  if (effectiveBodyMainSha === effectiveMainSha) fail('transition generation cannot equal new protected main');
} else if (effectiveBodyMainSha !== effectiveMainSha) fail(`synchronized generation must equal live main ${effectiveMainSha}`);

const correctionPr = live.pullRequest;
const correctionHead = correctionPr?.headRefOid || '';
if (!/^[0-9a-f]{40}$/i.test(correctionHead)) fail('canonical correction PR head unavailable');
if (correctionPr?.baseRefName !== 'main') fail('canonical correction PR does not target main');
if (expectedCorrectionHead && correctionHead !== expectedCorrectionHead) fail(`correction head moved: expected ${expectedCorrectionHead}, observed ${correctionHead}`);

const issueByNumber=new Map();
for (const number of [...new Set([...canonicalIssues,...trackedDefects])]) {
  const issue=live[issueAlias(number)];
  if (!issue || issue.number!==number) fail(`issue #${number} unavailable from batch truth read`);
  issueByNumber.set(number,{number:issue.number,body:issue.body||'',state:String(issue.state||'').toLowerCase(),comments:issue.comments||{nodes:[]}});
}
const issues=canonicalIssues.map(n=>issueByNumber.get(n));
const defectIssues=trackedDefects.map(n=>issueByNumber.get(n));
const activeDefects=defectIssues.filter(i=>i.state==='open').map(i=>i.number);
const errors=validateTruth(effectiveBodyMainSha,correctionHead,issues,activeDefects,requireLiveCorrectionHead);
if (errors.length) fail(errors.join('; '));

const stale=structuredClone(issues); const a=authoritativeText(stale[0]);
if (a.source==='APPEND_ONLY_RECEIPT') stale[0].comments.nodes.at(-1).body=(stale[0].comments.nodes.at(-1).body||'').replaceAll(effectiveBodyMainSha,'0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');
else stale[0].body=stale[0].body.replaceAll(effectiveBodyMainSha,'0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');
if (!validateTruth(effectiveBodyMainSha,correctionHead,stale,activeDefects,requireLiveCorrectionHead).length) fail('stale-main mutation escaped');

const omission=structuredClone(issues); const b=authoritativeText(omission[0]);
if (activeDefects.length) {
  if (b.source==='APPEND_ONLY_RECEIPT') omission[0].comments.nodes.at(-1).body=(omission[0].comments.nodes.at(-1).body||'').replaceAll(`#${activeDefects[0]}`,'');
  else omission[0].body=omission[0].body.replaceAll(`#${activeDefects[0]}`,'');
  if (!validateTruth(effectiveBodyMainSha,correctionHead,omission,activeDefects,requireLiveCorrectionHead).length) fail('active-defect omission escaped');
}
const closure=structuredClone(issues); const c=authoritativeText(closure[0]);
const bad='## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED';
if (c.source==='APPEND_ONLY_RECEIPT') closure[0].comments.nodes.at(-1).body += `\n${bad}`; else closure[0].body += `\n${bad}`;
if (!validateTruth(effectiveBodyMainSha,correctionHead,closure,activeDefects,requireLiveCorrectionHead).length) fail('false-closure mutation escaped');

console.log(JSON.stringify({validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',state:'VERIFIED_PASS',truth_phase:truthPhase,protected_main_sha:effectiveMainSha,canonical_generation_sha:effectiveBodyMainSha,live_main_parent_observed:observedParentSha||null,validation_event:eventName,canonical_correction_pr:correctionPrNumber,canonical_correction_head:correctionHead,canonical_issues:canonicalIssues,active_defects:activeDefects,truth_source_policy:'LATEST_TRUSTED_APPEND_ONLY_RECEIPT_ELSE_LEGACY_BODY',github_read_mode:'SINGLE_GRAPHQL_BATCH',stale_main_mutation_rejected:true,active_defect_omission_mutation_rejected:activeDefects.length>0,false_closure_mutation_rejected:true,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
