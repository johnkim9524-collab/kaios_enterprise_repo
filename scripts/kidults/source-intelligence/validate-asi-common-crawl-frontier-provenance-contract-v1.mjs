import fs from 'node:fs';

const targets = [
  '.github/workflows/kidults-asi-common-crawl-rolling-seed-frontier-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-frontier-runtime-persistence-v1.yml',
];

const required = [
  "github.event.pull_request.base.sha",
  "github.event.pull_request.base.ref",
  "PR_BASE_COMPATIBILITY_ONLY",
  "EXACT_EXECUTION_GENERATION",
  ".repository.full_name==$repo",
  ".path==\".github/workflows/kidults-asi-self-driving-control-loop-v1.yml\"",
  ".head_sha==$sha",
  ".conclusion==\"success\"",
  "ART_COUNT",
  "ART_COUNT\" -eq 1",
  "^sha256:[0-9a-f]{64}$",
  "${#DISCOVERIES[@]}\" -eq 1",
  "producer_workflow_path",
  "producer_run_id",
  "producer_sha",
  "artifact_digest",
  "empirical_promotion:false",
  "public_release:\"HOLD\"",
  "production:\"HOLD\"",
  "g5:\"HOLD\"",
];

const forbidden = [
  '.workflow_runs[0].id',
  'branch-compatible Self-Driving',
  "[.artifacts[] | select(.name==\"kidults-asi-self-driving-cycle-v1\" and .expired==false)][0].id // empty",
];

function validateText(text, target) {
  const failures = [];
  for (const marker of required) if (!text.includes(marker)) failures.push(`MISSING:${target}:${marker}`);
  for (const marker of forbidden) if (text.includes(marker)) failures.push(`FORBIDDEN:${target}:${marker}`);
  if (failures.length) throw new Error(failures.join('\n'));
}

function load() {
  return targets.map(target => ({ target, text: fs.readFileSync(target, 'utf8') }));
}

for (const { target, text } of load()) validateText(text, target);

if (process.argv.includes('--self-test')) {
  const mutations = [
    text => text.replace('github.event.pull_request.base.sha', 'github.sha'),
    text => text.replace('.head_sha==$sha', '.head_branch==$branch'),
    text => text.replace('.repository.full_name==$repo', 'true'),
    text => text.replace('.path==".github/workflows/kidults-asi-self-driving-control-loop-v1.yml"', 'true'),
    text => text.replace('ART_COUNT" -eq 1', 'ART_COUNT" -ge 1'),
    text => text.replace('^sha256:[0-9a-f]{64}$', '.+'),
    text => text.replace('${#DISCOVERIES[@]}" -eq 1', '${#DISCOVERIES[@]}" -ge 1'),
    text => text.replace('empirical_promotion:false', 'empirical_promotion:true'),
  ];
  let rejected = 0;
  const sample = load()[0];
  for (const mutate of mutations) {
    try {
      validateText(mutate(sample.text), sample.target);
    } catch {
      rejected += 1;
    }
  }
  if (rejected !== mutations.length) throw new Error(`MUTATION_REJECTION_INCOMPLETE:${rejected}/${mutations.length}`);
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', mutation_rejections: rejected, mutation_total: mutations.length }));
} else {
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: targets.length, exact_generation_contract: true }));
}
