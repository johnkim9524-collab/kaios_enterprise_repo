const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const expectedCanonicalBodyMainSha = process.env.EXPECTED_CANONICAL_BODY_MAIN_SHA || '';
const truthPhase = process.env.CANONICAL_TRUTH_PHASE || 'SYNCHRONIZED';
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1431');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
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

function fail(message) {
  console.error(`FAIL canonical issue truth: ${message}`);
  process.exit(1);
}
const isSha = value => /^[0-9a-f]{40}$/i.test(value || '');

if (!repository || !token || !isSha(expectedMainSha)) fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
if (!['TRANSITION', 'SYNCHRONIZED'].includes(truthPhase)) fail(`unsupported CANONICAL_TRUTH_PHASE ${truthPhase}`);
if (expectedCanonicalBodyMainSha && !isSha(expectedCanonicalBodyMainSha)) fail('EXPECTED_CANONICAL_BODY_MAIN_SHA must be empty or exact SHA');
if (truthPhase === 'TRANSITION' && !isSha(expectedCanonicalBodyMainSha)) fail('TRANSITION requires previous exact canonical-body main SHA');
if (!Number.isInteger(correctionPrNumber) || correctionPrNumber < 1) fail('CANONICAL_CORRECTION_PR_NUMBER must be a positive integer');
if (expectedCorrectionHead && !isSha(expectedCorrectionHead)) fail('EXPECTED_CORRECTION_HEAD_SHA must be empty or an exact SHA');

const [owner, name] = repository.split('/');
if (!owner || !name) fail('GITHUB_REPOSITORY must be owner/name');
const issueAlias = number => `i${number}`;

async function githubGraphql() {
  const requested = [...new Set([...canonicalIssues, ...trackedDefects])];
  const issueSelections = requested.map(number => `${issueAlias(number)}: issue(number: ${number}) { number body state }`).join('\n');
  const query = `query($owner:String!,$name:String!,$correction:Int!){\n  repository(owner:$owner,name:$name){\n    ref(qualifiedName:\"refs/heads/main\"){target{... on Commit{oid}}}\n    pullRequest(number:$correction){headRefOid baseRefName}\n    ${issueSelections}\n  }\n}`;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ query, variables: { owner, name, correction: correctionPrNumber } }),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0, 500)}`);
  const payload = JSON.parse(text);
  if (payload.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors).slice(0, 1000)}`);
  if (!payload.data?.repository) throw new Error('GraphQL repository payload unavailable');
  return payload.data.repository;
}

function validateBodies(bodyMainSha, correctionHead, issues, activeDefects, enforceCorrectionHead) {
  const errors = [];
  for (const issue of issues) {
    const body = issue.body || '';
    if (!body.includes(bodyMainSha)) errors.push(`#${issue.number} missing canonical protected-main SHA ${bodyMainSha}`);
    if (!body.includes(`#${correctionPrNumber}`)) errors.push(`#${issue.number} missing canonical correction PR #${correctionPrNumber}`);
    if (enforceCorrectionHead && !body.includes(correctionHead)) errors.push(`#${issue.number} missing live correction head ${correctionHead}`);
    for (const pattern of forbiddenClosureClaims) if (pattern.test(body)) errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
    for (const defect of activeDefects) if (!body.includes(`#${defect}`)) errors.push(`#${issue.number} omits active defect #${defect}`);
  }
  return errors;
}

const live = await githubGraphql();
const observedMainSha = live.ref?.target?.oid || '';
if (!isSha(observedMainSha)) fail('live protected-main SHA is unavailable');
const correctionPrValidation = Boolean(expectedCorrectionHead);
if (!correctionPrValidation && observedMainSha !== expectedMainSha) fail(`main moved: expected ${expectedMainSha}, observed ${observedMainSha}`);
const targetMainSha = correctionPrValidation ? observedMainSha : expectedMainSha;
const bodyMainSha = truthPhase === 'TRANSITION' ? expectedCanonicalBodyMainSha : targetMainSha;
if (!isSha(bodyMainSha)) fail('canonical body generation SHA is unavailable');
if (truthPhase === 'TRANSITION' && bodyMainSha === targetMainSha) fail('TRANSITION must bind the prior truth generation, not the newly created main SHA');

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
const errors = validateBodies(bodyMainSha, correctionHead, issues, activeDefects, requireLiveCorrectionHead);
if (errors.length) fail(errors.join('; '));

const staleMainMutation = structuredClone(issues);
staleMainMutation[0].body = staleMainMutation[0].body.replaceAll(bodyMainSha, '0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');
if (!validateBodies(bodyMainSha, correctionHead, staleMainMutation, activeDefects, requireLiveCorrectionHead).length) fail('stale-main mutation was not rejected');

if (truthPhase === 'TRANSITION') {
  const futureShaMutation = structuredClone(issues);
  futureShaMutation[0].body = futureShaMutation[0].body.replaceAll(bodyMainSha, targetMainSha);
  if (!validateBodies(bodyMainSha, correctionHead, futureShaMutation, activeDefects, requireLiveCorrectionHead).length) fail('future-SHA transition mutation was not rejected');
}

const correctionMutation = structuredClone(issues);
correctionMutation[0].body = `${correctionMutation[0].body}\n#${correctionPrNumber} exact head ${correctionHead}\n`.replaceAll(correctionHead, '1111111111111111111111111111111111111111');
if (!validateBodies(bodyMainSha, correctionHead, correctionMutation, activeDefects, true).length) fail('stale-correction-head mutation was not rejected');

if (activeDefects.length) {
  const omissionMutation = structuredClone(issues);
  omissionMutation[0].body = omissionMutation[0].body.replaceAll(`#${activeDefects[0]}`, '');
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

console.log(JSON.stringify({
  validator: 'LIVE_CANONICAL_ISSUE_TRUTH_V1',
  state: 'VERIFIED_PASS',
  truth_phase: truthPhase,
  target_protected_main_sha: targetMainSha,
  canonical_body_main_sha: bodyMainSha,
  event_expected_main_sha: expectedMainSha,
  live_main_observed: observedMainSha,
  correction_pr_validation: correctionPrValidation,
  canonical_correction_pr: correctionPrNumber,
  canonical_correction_head: correctionHead,
  live_correction_head_enforced_in_issues: requireLiveCorrectionHead,
  canonical_issues: canonicalIssues,
  active_defects: activeDefects,
  github_read_mode: 'SINGLE_GRAPHQL_BATCH',
  stale_main_mutation_rejected: true,
  future_sha_transition_mutation_rejected: truthPhase === 'TRANSITION',
  stale_correction_head_mutation_rejected: true,
  active_defect_omission_mutation_rejected: activeDefects.length > 0,
  unsupported_closure_mutations_rejected: closureMutationTexts.length,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
