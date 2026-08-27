import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-host-expansion-v1.yml';

function fail(message) {
  throw new Error(`Common Crawl host-expansion provenance guard: ${message}`);
}

export function validateWorkflowText(text) {
  const required = [
    ['canonical producer workflow endpoint', '/actions/workflows/kidults-asi-global-open-market-discovery-v1.yml/runs?branch=main&status=success&head_sha=${EXPECTED_SHA}&per_page=30'],
    ['exact producer SHA filter', 'and .head_sha==$sha'],
    ['canonical producer path filter', 'and .path==$path'],
    ['canonical producer name filter', 'and .name==$name'],
    ['successful producer conclusion filter', 'and .conclusion=="success"'],
    ['exact producer-run readback', '/actions/runs/${PRODUCER_RUN_ID}'],
    ['repository binding', `test "$(jq -r '.repository.full_name' <<<"$RUN_JSON")" = "$GITHUB_REPOSITORY"`],
    ['run-scoped artifact listing', '/actions/runs/${PRODUCER_RUN_ID}/artifacts?per_page=100'],
    ['artifact exact-cardinality assertion', 'test "$ARTIFACT_COUNT" -eq 1'],
    ['provider digest validation', '[[ "$ART_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]'],
    ['single extracted source assertion', 'test "${#SOURCES[@]}" -eq 1'],
    ['provenance receipt', '/tmp/asi-common-crawl-host-expansion-provenance-v1.json'],
    ['no empirical promotion', 'empirical_promotion:false'],
    ['production hold', 'production:"HOLD"'],
    ['g5 hold', 'g5:"HOLD"']
  ];
  for (const [label, needle] of required) {
    if (!text.includes(needle)) fail(`missing ${label}`);
  }

  if (text.includes('/actions/artifacts?per_page=100')) {
    fail('repository-global artifact listing is forbidden');
  }

  const directDownload = text.match(/\/actions\/artifacts\/\$\{ART_ID\}\/zip/g) ?? [];
  if (directDownload.length !== 1) {
    fail(`expected exactly one artifact download after run-scoped selection, found ${directDownload.length}`);
  }

  return true;
}

const source = fs.readFileSync(workflowPath, 'utf8');
validateWorkflowText(source);

if (process.argv.includes('--self-test')) {
  const mutations = [
    ['global artifact lookup', source.replace(
      '/actions/runs/${PRODUCER_RUN_ID}/artifacts?per_page=100',
      '/actions/artifacts?per_page=100'
    )],
    ['remove exact SHA filter', source.replace('and .head_sha==$sha', 'and true')],
    ['remove canonical path filter', source.replace('and .path==$path', 'and true')],
    ['remove repository binding', source.replace(
      `test "$(jq -r '.repository.full_name' <<<"$RUN_JSON")" = "$GITHUB_REPOSITORY"`,
      'true # repository binding removed'
    )],
    ['weaken cardinality', source.replace('test "$ARTIFACT_COUNT" -eq 1', 'test "$ARTIFACT_COUNT" -ge 1')],
    ['remove digest validation', source.replace(
      '[[ "$ART_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]',
      'test -n "$ART_DIGEST"'
    )],
    ['forge empirical promotion', source.replace('empirical_promotion:false', 'empirical_promotion:true')]
  ];
  for (const [label, mutated] of mutations) {
    let rejected = false;
    try {
      validateWorkflowText(mutated);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test mutation was accepted: ${label}`);
  }
  console.log(JSON.stringify({status:'PASS', mutations_rejected:mutations.length}));
} else {
  console.log(JSON.stringify({status:'PASS'}));
}
