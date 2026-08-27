const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const correctionPrNumber = Number(process.env.CANONICAL_CORRECTION_PR_NUMBER || '1418');
const expectedCorrectionHead = process.env.EXPECTED_CORRECTION_HEAD_SHA || '';
const requireLiveCorrectionHead = process.env.REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES === 'true';
const canonicalIssues = [
  235, 236, 237, 238, 240, 256, 344, 457, 479, 480, 489, 521, 550,
  558, 559, 560, 609, 742, 769, 881, 921, 951, 1066, 1166, 1296
];
const trackedDefects = [1330, 1412, 1416, 1419, 1420, 1421];
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

if (!repository || !token || !/^[0-9a-f]{40}$/i.test(expectedMainSha || '')) {
  fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
}
if (!Number.isInteger(correctionPrNumber) || correctionPrNumber < 1) {
  fail('CANONICAL_CORRECTION_PR_NUMBER must be a positive integer');
}
if (expectedCorrectionHead && !/^[0-9a-f]{40}$/i.test(expectedCorrectionHead)) {
  fail('EXPECTED_CORRECTION_HEAD_SHA must be empty or an exact SHA');
}

async function github(path) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

function validateBodies(mainSha, correctionHead, issues, activeDefects, enforceCorrectionHead) {
  const errors = [];
  for (const issue of issues) {
    const body = issue.body || '';
    if (!body.includes(mainSha)) {
      errors.push(`#${issue.number} missing exact protected-main SHA ${mainSha}`);
    }
    if (!body.includes(`#${correctionPrNumber}`)) {
      errors.push(`#${issue.number} missing canonical correction PR #${correctionPrNumber}`);
    }
    if (enforceCorrectionHead && !body.includes(correctionHead)) {
      errors.push(`#${issue.number} missing live correction head ${correctionHead}`);
    }
    for (const pattern of forbiddenClosureClaims) {
      if (pattern.test(body)) errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
    }
    for (const defect of activeDefects) {
      if (!body.includes(`#${defect}`)) errors.push(`#${issue.number} omits active defect #${defect}`);
    }
  }
  return errors;
}

const [branch, correctionPr, issues, defectIssues] = await Promise.all([
  github('/branches/main'),
  github(`/pulls/${correctionPrNumber}`),
  Promise.all(canonicalIssues.map(number => github(`/issues/${number}`))),
  Promise.all(trackedDefects.map(number => github(`/issues/${number}`)))
]);

if (branch.commit?.sha !== expectedMainSha) {
  fail(`main moved: expected ${expectedMainSha}, observed ${branch.commit?.sha || 'UNKNOWN'}`);
}
const correctionHead = correctionPr.head?.sha || '';
if (!/^[0-9a-f]{40}$/i.test(correctionHead)) fail('canonical correction PR head is unavailable');
if (correctionPr.base?.ref !== 'main') fail(`canonical correction PR targets ${correctionPr.base?.ref || 'UNKNOWN'}, not main`);
if (expectedCorrectionHead && correctionHead !== expectedCorrectionHead) {
  fail(`correction head moved: expected event head ${expectedCorrectionHead}, observed ${correctionHead}`);
}

const activeDefects = defectIssues.filter(issue => issue.state === 'open').map(issue => issue.number);
const errors = validateBodies(expectedMainSha, correctionHead, issues, activeDefects, requireLiveCorrectionHead);
if (errors.length) fail(errors.join('; '));

const staleMainMutation = structuredClone(issues);
staleMainMutation[0].body = staleMainMutation[0].body.replace(expectedMainSha, '0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');
if (!validateBodies(expectedMainSha, correctionHead, staleMainMutation, activeDefects, requireLiveCorrectionHead).length) {
  fail('stale-main mutation was not rejected');
}

const correctionMutation = structuredClone(issues);
correctionMutation[0].body = `${correctionMutation[0].body}\n#${correctionPrNumber} exact head ${correctionHead}\n`
  .replace(correctionHead, '1111111111111111111111111111111111111111');
if (!validateBodies(expectedMainSha, correctionHead, correctionMutation, activeDefects, true).length) {
  fail('stale-correction-head mutation was not rejected');
}

if (activeDefects.length) {
  const omissionMutation = structuredClone(issues);
  omissionMutation[0].body = omissionMutation[0].body.replaceAll(`#${activeDefects[0]}`, '');
  if (!validateBodies(expectedMainSha, correctionHead, omissionMutation, activeDefects, requireLiveCorrectionHead).length) {
    fail('active-defect omission mutation was not rejected');
  }
}

const closureMutationTexts = [
  '## Internal reversible-control truth — CLOSED AT CURRENT MAIN',
  '## CURRENT-MAIN INTERNAL HANDLING CONTROLS CLOSED',
  '## CURRENT-MAIN INTERNAL RUNTIME P0 CLOSED'
];
for (const mutationText of closureMutationTexts) {
  const closureMutation = structuredClone(issues);
  closureMutation[0].body += `\n${mutationText}\n`;
  if (!validateBodies(expectedMainSha, correctionHead, closureMutation, activeDefects, requireLiveCorrectionHead).length) {
    fail(`unsupported-closure mutation was not rejected: ${mutationText}`);
  }
}

console.log(JSON.stringify({
  validator: 'LIVE_CANONICAL_ISSUE_TRUTH_V1',
  state: 'VERIFIED_PASS',
  protected_main_sha: expectedMainSha,
  canonical_correction_pr: correctionPrNumber,
  canonical_correction_head: correctionHead,
  live_correction_head_enforced_in_issues: requireLiveCorrectionHead,
  canonical_issues: canonicalIssues,
  active_defects: activeDefects,
  stale_main_mutation_rejected: true,
  stale_correction_head_mutation_rejected: true,
  active_defect_omission_mutation_rejected: activeDefects.length > 0,
  unsupported_closure_mutations_rejected: closureMutationTexts.length,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
