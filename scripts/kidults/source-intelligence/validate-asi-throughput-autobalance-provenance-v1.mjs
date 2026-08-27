#!/usr/bin/env node
import fs from 'node:fs';

const target = process.argv[2] || '.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml';

function validate(text) {
  const failures = [];
  const requireText = (needle, label) => {
    if (!text.includes(needle)) failures.push(`missing ${label}`);
  };
  const rejectText = (needle, label) => {
    if (text.includes(needle)) failures.push(`forbidden ${label}`);
  };

  rejectText('/actions/artifacts?per_page=100', 'repository-global artifact lookup');

  requireText(
    '/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml/runs',
    'canonical producer workflow-run lookup'
  );
  requireText(
    '/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100',
    'run-scoped artifact lookup'
  );
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml"', 'canonical producer path binding');
  requireText('.head_sha==$sha', 'exact producer SHA binding');
  requireText('EXPECTED_PRODUCER_SHA="$PR_BASE_SHA"', 'PR base compatibility binding');
  requireText('EXPECTED_PRODUCER_SHA="$CURRENT_SHA"', 'current-main exact-generation binding');
  requireText('test "$GITHUB_REF" = "refs/heads/main"', 'non-PR protected-main gate');

  for (const artifactName of [
    'kidults-asi-global-any-site-source-pool-v1',
    'kidults-asi-global-any-site-hourly-cycle-v1'
  ]) {
    requireText(`.name=="${artifactName}"`, `${artifactName} selection`);
  }
  const cardinalityMatches = text.match(/\]\s*\|\s*if length==1 then \.\[0\] else empty end/g) || [];
  if (cardinalityMatches.length < 2) failures.push('missing exact artifact cardinality for both producer artifacts');

  requireText('.workflow_run.id==$run', 'artifact producer run binding');
  requireText('.workflow_run.head_sha==$sha', 'artifact producer SHA binding');
  requireText('^sha256:[0-9a-f]{64}$', 'provider artifact digest validation');
  requireText("status: 'VERIFIED_EXACT_PRODUCER_BINDING'", 'exact producer provenance receipt status');
  requireText('mixed_generation_allowed: false', 'mixed-generation prohibition');
  requireText('/tmp/asi-throughput-autobalance-provenance-v1.json', 'provenance receipt artifact');
  requireText("public_release: 'HOLD'", 'public HOLD');
  requireText("production: 'HOLD'", 'production HOLD');

  return failures;
}

const text = fs.readFileSync(target, 'utf8');
const failures = validate(text);
if (failures.length) {
  console.error('ASI throughput autobalance provenance: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  [
    '/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100',
    '/actions/artifacts?per_page=100'
  ],
  [
    '.workflow_run.id==$run',
    '.workflow_run.id>0'
  ],
  [
    '.workflow_run.head_sha==$sha',
    '.workflow_run.head_branch=="main"'
  ],
  [
    'if length==1 then .[0] else empty end',
    '.[0] // empty'
  ],
  [
    '.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml"',
    '.head_branch=="main"'
  ],
  [
    'EXPECTED_PRODUCER_SHA="$CURRENT_SHA"',
    'EXPECTED_PRODUCER_SHA=""'
  ],
  [
    'mixed_generation_allowed: false',
    'mixed_generation_allowed: true'
  ]
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${from}`);
    process.exit(1);
  }
  const mutated = text.split(from).join(to);
  if (validate(mutated).length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject mutation: ${from} -> ${to}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  status: 'VERIFIED_PASS',
  control: 'ASI_THROUGHPUT_AUTOBALANCE_EXACT_PRODUCER_PROVENANCE',
  mutation_cases_rejected: mutations.length,
  production: 'HOLD',
  public_release: 'HOLD'
}, null, 2));
