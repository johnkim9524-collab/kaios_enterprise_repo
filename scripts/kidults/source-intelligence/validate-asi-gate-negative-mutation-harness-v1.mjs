#!/usr/bin/env node
import fs from 'node:fs';

const specs = [
  {
    path: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml',
    scenarios: [
      ['GATE1_RIGHTS_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate1-right.json', 'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs', 'Gate1 created downstream right'],
      ['GATE1_REVIEW_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate1-pool.json', 'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs', 'safe pool without Gate1 PASS'],
      ['GATE2_REUSE_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate2-reuse.json', 'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs', 'Gate1 decision reused as evidence'],
      ['GATE2_COLLECT_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate2-collect.json', 'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs', 'unproven purpose promoted: collect'],
      ['GATE3_CONTENT_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate3-content.json', 'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs', 'content acquisition authorized'],
      ['GATE3_SCOPE_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate3-scope.json', 'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs', 'admission state too broad'],
      ['REVOKED_ALIAS_MUTATION_SUBJECT_MISSING', '/tmp/bad-revoked-reentry.json', 'scripts/kidults/source-intelligence/validate-asi-admitted-metadata-pool-v1.mjs', 'active candidate stale or revoked']
    ]
  },
  {
    path: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
    scenarios: [
      ['COMMON_CRAWL_RIGHTS_MUTATION_SUBJECT_MISSING', '/tmp/bad-common-crawl-rights-v2.json', 'scripts/kidults/source-intelligence/validate-asi-common-crawl-any-site-gate-binding-v1.mjs', 'CANDIDATE_PROMOTION'],
      ['GATE1_RIGHTS_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate1-right-v2.json', 'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs', 'Gate1 created downstream right'],
      ['GATE1_REVIEW_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate1-pool-v2.json', 'scripts/kidults/source-intelligence/validate-asi-gate1-safe-candidate-pool-v1.mjs', 'safe pool without Gate1 PASS'],
      ['GATE2_REUSE_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate2-reuse-v2.json', 'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs', 'Gate1 decision reused as evidence'],
      ['GATE2_COLLECT_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate2-collect-v2.json', 'scripts/kidults/source-intelligence/validate-asi-gate2-independent-reverification-v1.mjs', 'unproven purpose promoted: collect'],
      ['GATE3_CONTENT_MUTATION_SUBJECT_MISSING', '/tmp/bad-gate3-content-v2.json', 'scripts/kidults/source-intelligence/validate-asi-gate3-admission-runtime-v1.mjs', 'content acquisition authorized'],
      ['REVOKED_ALIAS_MUTATION_SUBJECT_MISSING', '/tmp/bad-revoked-reentry-v2.json', 'scripts/kidults/source-intelligence/validate-asi-admitted-metadata-pool-v1.mjs', 'active candidate stale or revoked']
    ]
  }
];

const count = (source, needle) => source.split(needle).length - 1;
const fail = message => { throw new Error(message); };

function validateWorkflow(source, spec) {
  for (const [subject, badPath, validator, reason] of spec.scenarios) {
    const anchor = source.indexOf(badPath);
    if (anchor < 0) fail(spec.path + ': missing mutation artifact ' + badPath);
    const start = source.lastIndexOf('\n      - name:', anchor);
    const next = source.indexOf('\n      - name:', anchor + 1);
    const block = source.slice(start < 0 ? 0 : start, next < 0 ? source.length : next);
    const marker = "throw new Error('" + subject + "')";
    const capture = 'OUTPUT=$(node ' + validator + ' ' + badPath + ' 2>&1)';
    const reasonCheck = "grep -F '" + reason + "' <<<\"$OUTPUT\"";
    if (count(block, marker) !== 1) fail(spec.path + ': missing or duplicate subject marker ' + subject);
    if (block.includes('process.exit(0)') || block.includes('process.exit(2)')) fail(spec.path + ': vacuous subject exit ' + subject);
    if (block.includes('[ -f ' + badPath + ' ]')) fail(spec.path + ': optional mutation artifact guard ' + subject);
    if (count(block, badPath) !== 2) fail(spec.path + ': mutation artifact cardinality ' + subject);
    if (count(block, capture) !== 1) fail(spec.path + ': validator capture missing ' + subject);
    if (count(block, 'STATUS=$?') !== 1) fail(spec.path + ': validator status capture missing ' + subject);
    if (count(block, 'test "$STATUS" -ne 0') !== 1) fail(spec.path + ': validator rejection assertion missing ' + subject);
    if (count(block, reasonCheck) !== 1) fail(spec.path + ': exact rejection reason missing ' + subject);
  }
}

function validateAll(sources) {
  for (const spec of specs) validateWorkflow(sources.get(spec.path), spec);
}

const pristine = new Map(specs.map(spec => [spec.path, fs.readFileSync(spec.path, 'utf8')]));
validateAll(pristine);

if (process.argv.includes('--self-test')) {
  const first = specs[0];
  const [subject, badPath, validator, reason] = first.scenarios[0];
  const path = first.path;
  const marker = "throw new Error('" + subject + "')";
  const capture = 'OUTPUT=$(node ' + validator + ' ' + badPath + ' 2>&1)';
  const reasonCheck = "grep -F '" + reason + "' <<<\"$OUTPUT\"";
  const cases = [
    ['zero-subject pass', source => source.replace(marker, 'process.exit(0)')],
    ['optional artifact guard', source => source.replace(capture, '[ -f ' + badPath + ' ] && ' + capture)],
    ['missing validator status assertion', source => source.replace('test "$STATUS" -ne 0', 'true # status assertion removed')],
    ['missing exact rejection reason', source => source.replace(reasonCheck, 'true # rejection reason removed')],
    ['duplicate subject marker', source => source.replace(marker, marker + ';' + marker)]
  ];
  for (const [name, mutate] of cases) {
    const altered = new Map(pristine);
    altered.set(path, mutate(pristine.get(path)));
    let rejected = false;
    try { validateAll(altered); } catch { rejected = true; }
    if (!rejected) fail('self-test mutation survived: ' + name);
  }
}

console.log(JSON.stringify({status:'VERIFIED_PASS',workflows:specs.length,mutation_scenarios:specs.reduce((n,s)=>n+s.scenarios.length,0),self_test:process.argv.includes('--self-test')}));
