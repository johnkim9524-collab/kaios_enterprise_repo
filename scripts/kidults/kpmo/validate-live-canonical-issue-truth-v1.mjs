const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedMainSha = process.env.EXPECTED_PROTECTED_MAIN_SHA;
const canonicalIssues = [344, 457, 550, 558, 559, 560];
const trackedDefects = [1412, 1416, 1419];
const forbiddenClosureClaims = [
  /INTERNAL REVERSIBLE[^\n]*CLOSED AT CURRENT MAIN/i,
  /INTERNAL BLOCKERS CLOSED/i
];

function fail(message) {
  console.error(`FAIL canonical issue truth: ${message}`);
  process.exit(1);
}

if (!repository || !token || !/^[0-9a-f]{40}$/i.test(expectedMainSha || '')) {
  fail('GITHUB_REPOSITORY, GITHUB_TOKEN, and exact EXPECTED_PROTECTED_MAIN_SHA are required');
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

function validateBodies(mainSha, issues, activeDefects) {
  const errors = [];
  for (const issue of issues) {
    const body = issue.body || '';
    if (!body.includes(mainSha)) {
      errors.push(`#${issue.number} missing exact protected-main SHA ${mainSha}`);
    }
    for (const pattern of forbiddenClosureClaims) {
      if (pattern.test(body)) {
        errors.push(`#${issue.number} contains unsupported closure claim ${pattern}`);
      }
    }
    for (const defect of activeDefects) {
      if (!body.includes(`#${defect}`)) {
        errors.push(`#${issue.number} omits active defect #${defect}`);
      }
    }
  }
  return errors;
}

const branch = await github('/branches/main');
if (branch.commit?.sha !== expectedMainSha) {
  fail(`main moved: expected ${expectedMainSha}, observed ${branch.commit?.sha || 'UNKNOWN'}`);
}

const [issues, defectIssues] = await Promise.all([
  Promise.all(canonicalIssues.map(number => github(`/issues/${number}`))),
  Promise.all(trackedDefects.map(number => github(`/issues/${number}`)))
]);

const activeDefects = defectIssues.filter(issue => issue.state === 'open').map(issue => issue.number);
const errors = validateBodies(expectedMainSha, issues, activeDefects);
if (errors.length) fail(errors.join('; '));

const staleMutation = structuredClone(issues);
staleMutation[0].body = staleMutation[0].body.replace(expectedMainSha, '0a597e04ab528ae8f36bcd335ee7b1c6df7c51f9');
if (!validateBodies(expectedMainSha, staleMutation, activeDefects).length) {
  fail('stale-main mutation was not rejected');
}

if (activeDefects.length) {
  const omissionMutation = structuredClone(issues);
  omissionMutation[0].body = omissionMutation[0].body.replaceAll(`#${activeDefects[0]}`, '');
  if (!validateBodies(expectedMainSha, omissionMutation, activeDefects).length) {
    fail('active-defect omission mutation was not rejected');
  }
}

const closureMutation = structuredClone(issues);
closureMutation[0].body += '\n## Internal reversible-control truth — CLOSED AT CURRENT MAIN\n';
if (!validateBodies(expectedMainSha, closureMutation, activeDefects).length) {
  fail('unsupported-closure mutation was not rejected');
}

console.log(JSON.stringify({
  validator: 'LIVE_CANONICAL_ISSUE_TRUTH_V1',
  state: 'VERIFIED_PASS',
  protected_main_sha: expectedMainSha,
  canonical_issues: canonicalIssues,
  active_defects: activeDefects,
  stale_main_mutation_rejected: true,
  active_defect_omission_mutation_rejected: activeDefects.length > 0,
  unsupported_closure_mutation_rejected: true,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
