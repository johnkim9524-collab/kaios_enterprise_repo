import fs from 'node:fs';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const truthPhase = process.env.CANONICAL_TRUTH_PHASE || 'SYNCHRONIZED';
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1431');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
const maxLagCommits = Number(process.env.MAX_CANONICAL_GENERATION_LAG_COMMITS || '8');
const canonicalIssues = [
  235, 236, 237, 238, 240, 256, 344, 457, 479, 480, 489, 521, 550,
  558, 559, 560, 609, 742, 769, 881, 921, 951, 1066, 1166, 1296
];
const trackedDefects = [1330, 1412, 1416, 1419, 1420, 1421, 1423, 1427];
const forbiddenClosureClaims = [
  /INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,
  /INTERNAL BLOCKERS CLOSED/i,
  /CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED/i,
  /CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED/i
];
const truthStart = '<!-- KPMO_CANONICAL_TRUTH_V2_START -->';
const truthEnd = '<!-- KPMO_CANONICAL_TRUTH_V2_END -->';

function fail(message) {
  console.error(`FAIL canonical issue truth: ${message}`);
  process.exit(1);
}
const isSha = value => /^[0-9a-f]{40}$/i.test(value || '');

if (!repository || !token || !isSha(expectedMainSha)) fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
if (!['PREMERGE', 'TRANSITION', 'SYNCHRONIZED'].includes(truthPhase)) fail(`unsupported CANONICAL_TRUTH_PHASE ${truthPhase}`);
if (!Number.isInteger(correctionPrNumber) || correctionPrNumber < 1) fail('CANONICAL_CORRECTION_PR_NUMBER must be a positive integer');
if (expectedCorrectionHead && !isSha(expectedCorrectionHead)) fail('EXPECTED_CORRECTION_HEAD_SHA must be empty or an exact SHA');
if (!Number.isInteger(maxLagCommits) || maxLagCommits < 1 || maxLagCommits > 32) fail('MAX_CANONICAL_GENERATION_LAG_COMMITS must be 1..32');

const [owner, name] = repository.split('/');
if (!owner || !name) fail('GITHUB_REPOSITORY must be owner/name');
const issueAlias = number => `i${number}`;

async function githubGraphql() {
  const requested = [...new Set([...canonicalIssues, ...trackedDefects])];
  const issueSelections = requested.map(number => `${issueAlias(number)}: issue(number: ${number}) { number body state }`).join('\n');
  const query = `query($owner:String!,$name:String!,$correction:Int!,$history:Int!){\n  repository(owner:$owner,name:$name){\n    ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid history(first:$history){nodes{oid}}}}}\n    pullRequest(number:$correction){headRefOid baseRefName state merged}\n    ${issueSelections}\n  }\n}`;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ query, variables: { owner, name, correction: correctionPrNumber, history: maxLagCommits + 1 } }),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0, 500)}`);
  const payload = JSON.parse(text);
  if (payload.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors).slice(0, 1000)}`);
  if (!payload.data?.repository) throw new Error('GraphQL repository payload unavailable');
  return payload.data.repository;
}

function truthBlock(body, issueNumber) {
  const start = body.indexOf(truthStart);
  const end = body.indexOf(truthEnd);
  if (start < 0 || end < 0 || end <= start) fail(`#${issueNumber} missing canonical V2 truth block`);
  return body.slice(start, end + truthEnd.length);
}

function extractGeneration(block, issueNumber) {
  const match = block.match(/- protected main:\s*`([0-9a-f]{40})`/i);
  if (!match) fail(`#${issueNumber} canonical V2 block missing exact protected-main SHA`);
  return match[1].toLowerCase();
}

function validateBodies(bodyMainSha, correctionHead, issues, activeDefects, enforceCorrectionHead) {
  const errors = [];
  for (const issue of issues) {
    const body = issue.body || '';
    let block;
    try { block = truthBlock(body, issue.number); } catch { block = ''; }
    if (!block.includes(`- protected main: \`${bodyMainSha}\``)) errors.push(`#${issue.number} canonical V2 block missing protected-main SHA ${bodyMainSha}`);
    if (!block.includes(`#${correctionPrNumber}`)) errors.push(`#${issue.number} canonical V2 block missing canonical correction PR #${correctionPrNumber}`);
    if (enforceCorrectionHead && !block.includes(correctionHead)) errors.push(`#${issue.number} canonical V2 block missing live correction head ${correctionHead}`);
    for (const pattern of forbiddenClosureClaims) if (pattern.test(body)) errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
    for (const defect of activeDefects) if (!block.includes(`#${defect}`)) errors.push(`#${issue.number} canonical V2 block omits active defect #${defect}`);
  }
  return errors;
}

const live = await githubGraphql();
const observedMainSha = live.ref?.target?.oid || '';
if (!isSha(observedMainSha)) fail('live protected-main SHA is unavailable');
if (observedMainSha !== expectedMainSha) fail(`main moved: expected ${expectedMainSha}, observed ${observedMainSha}`);
const mainHistory = (live.ref?.target?.history?.nodes || []).map(node => node.oid).filter(isSha);
if (!mainHistory.includes(observedMainSha)) mainHistory.unshift(observedMainSha);

const correctionPr = live.pullRequest;
const correctionHead = correctionPr?.headRefOid || '';
if (!isSha(correctionHead)) fail('canonical correction PR head is unavailable');
if (correctionPr?.baseRefName !== 'main') fail(`canonical correction PR targets ${correctionPr?.baseRefName || 'UNKNOWN'}, not main`);
if (expectedCorrectionHead && correctionHead !== expectedCorrectionHead) fail(`correction head moved: expected event head ${expectedCorrectionHead}, observed ${correctionHead}`);

const issueByNumber = new Map();
for (const number of [...new Set([...canonicalIssues, ...trackedDefects])]) {
  const issue = live[issueAlias(number)];
  if (!issue || issue.number !== number) fail(`issue #${number} unavailable from batch truth read`);
  issueByNumber.set(number, { number: issue.number, body: issue.body || '', state: String(issue.state || '').toLowerCase() });
}
const issues = canonicalIssues.map(number => issueByNumber.get(number));
const defectIssues = trackedDefects.map(number => issueByNumber.get(number));
const activeDefects = defectIssues.filter(issue => issue.state === 'open').map(issue => issue.number);

const generations = issues.map(issue => extractGeneration(truthBlock(issue.body || '', issue.number), issue.number));
const generationSet = [...new Set(generations)];
if (generationSet.length !== 1) fail(`canonical board generations diverged: ${generationSet.join(',')}`);
const bodyMainSha = generationSet[0];
const lagIndex = mainHistory.indexOf(bodyMainSha);
if (truthPhase === 'SYNCHRONIZED') {
  if (bodyMainSha !== observedMainSha) fail(`SYNCHRONIZED truth stale: canonical ${bodyMainSha}, current main ${observedMainSha}`);
} else {
  if (lagIndex < 0 || lagIndex > maxLagCommits) fail(`${truthPhase} canonical generation ${bodyMainSha} is not a bounded recent main ancestor`);
}

const errors = validateBodies(bodyMainSha, correctionHead, issues, activeDefects, requireLiveCorrectionHead);
if (errors.length) fail(errors.join('; '));

const divergentMutation = structuredClone(issues);
const divergentBlock = truthBlock(divergentMutation[0].body, divergentMutation[0].number);
divergentMutation[0].body = divergentMutation[0].body.replace(divergentBlock, divergentBlock.replace(bodyMainSha, '0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9'));
const divergentGenerations = divergentMutation.map(issue => extractGeneration(truthBlock(issue.body || '', issue.number), issue.number));
if (new Set(divergentGenerations).size === 1) fail('divergent-generation mutation was not rejected');

const staleMainMutation = structuredClone(issues);
const staleBlock = truthBlock(staleMainMutation[0].body, staleMainMutation[0].number);
staleMainMutation[0].body = staleMainMutation[0].body.replace(staleBlock, staleBlock.replace(bodyMainSha, '0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9'));
if (!validateBodies(bodyMainSha, correctionHead, staleMainMutation, activeDefects, requireLiveCorrectionHead).length) fail('stale-main mutation was not rejected');

const correctionMutation = structuredClone(issues);
const correctionBlock = truthBlock(correctionMutation[0].body, correctionMutation[0].number);
correctionMutation[0].body = correctionMutation[0].body.replace(correctionBlock, correctionBlock.replace(`#${correctionPrNumber}`, '#999999'));
if (!validateBodies(bodyMainSha, correctionHead, correctionMutation, activeDefects, requireLiveCorrectionHead).length) fail('stale-correction mutation was not rejected');

if (activeDefects.length) {
  const omissionMutation = structuredClone(issues);
  const omissionBlock = truthBlock(omissionMutation[0].body, omissionMutation[0].number);
  omissionMutation[0].body = omissionMutation[0].body.replace(omissionBlock, omissionBlock.replaceAll(`#${activeDefects[0]}`, ''));
  if (!validateBodies(bodyMainSha, correctionHead, omissionMutation, activeDefects, requireLiveCorrectionHead).length) fail('active-defect omission mutation was not rejected');
}

const closureMutationTexts = [
  '## Internal reversible-control truth — CLOSED AT CURRENT MAIN',
  '## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED',
  '## CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED'
];
for (const mutationText of closureMutationTexts) {
  const closureMutation = structuredClone(issues);
  closureMutation[0].body += `\n${mutationText}\n`;
  if (!validateBodies(bodyMainSha, correctionHead, closureMutation, activeDefects, requireLiveCorrectionHead).length) fail(`unsupported-closure mutation was not rejected: ${mutationText}`);
}

if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `canonical_body_main_sha=${bodyMainSha}\n`);

console.log(JSON.stringify({
  validator: 'LIVE_CANONICAL_ISSUE_TRUTH_V1',
  state: 'VERIFIED_PASS',
  truth_phase: truthPhase,
  protected_main_sha: observedMainSha,
  canonical_body_main_sha: bodyMainSha,
  canonical_generation_lag_commits: lagIndex,
  max_generation_lag_commits: maxLagCommits,
  canonical_correction_pr: correctionPrNumber,
  canonical_correction_head: correctionHead,
  live_correction_head_enforced_in_issues: requireLiveCorrectionHead,
  canonical_issues: canonicalIssues,
  active_defects: activeDefects,
  github_read_mode: 'SINGLE_GRAPHQL_BATCH',
  coherent_generation_verified: true,
  stale_main_mutation_rejected: true,
  divergent_generation_mutation_rejected: true,
  stale_correction_mutation_rejected: true,
  active_defect_omission_mutation_rejected: activeDefects.length > 0,
  unsupported_closure_mutations_rejected: closureMutationTexts.length,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
