import fs from 'node:fs';

const WORKFLOW = '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml';

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

export function validateSnapshotTerminalOutcomeProviderReceipt(source) {
  const required = [
    "const outcomeCandidates=[",
    "name:'snapshot-pair-generation-receipt-v2.json'",
    "name:'snapshot-non-generation-receipt-v2.json'",
    'if(outcomeCandidates.length!==1)process.exit(2);',
    'outcomeCandidate.generated!==generated',
    "outcome.public_release!=='HOLD'",
    "outcome.production!=='HOLD'",
    'generation_outcome_receipt_sha256:outcomeReceiptSha256',
    'outcome_content_validated:true',
    'snapshot_generated:generated',
    'pair_receipt_sha256:generated?outcomeReceiptSha256:null',
    'non_generation_receipt_sha256:generated?null:outcomeReceiptSha256',
  ];
  for (const marker of required) assert(source.includes(marker), `SNAPSHOT_PROVIDER_RECEIPT_MARKER_MISSING:${marker}`);
  assert(!source.includes("const pairReceipt='/tmp/kidults-asi-snapshot-readiness-factory-run-1/snapshot-pair-generation-receipt-v2.json'"), 'SNAPSHOT_PROVIDER_RECEIPT_PAIR_ONLY_REINTRODUCED');
  assert(!source.includes('fs.readFileSync(pairReceipt)'), 'SNAPSHOT_PROVIDER_RECEIPT_UNCONDITIONAL_PAIR_READ_REINTRODUCED');
  return { state: 'VERIFIED_PASS', contract: 'SNAPSHOT_TERMINAL_OUTCOME_PROVIDER_RECEIPT_V1' };
}

const source = fs.readFileSync(WORKFLOW, 'utf8');
validateSnapshotTerminalOutcomeProviderReceipt(source);

if (process.argv.includes('--self-test')) {
  const mutations = [
    ["name:'snapshot-non-generation-receipt-v2.json'", "name:'snapshot-non-generation-receipt-v2.json_REMOVED'"],
    ['if(outcomeCandidates.length!==1)process.exit(2);', 'if(outcomeCandidates.length<1)process.exit(2);'],
    ['outcomeCandidate.generated!==generated', 'false'],
    ['pair_receipt_sha256:generated?outcomeReceiptSha256:null', 'pair_receipt_sha256:outcomeReceiptSha256'],
    ['non_generation_receipt_sha256:generated?null:outcomeReceiptSha256', 'non_generation_receipt_sha256:null'],
  ];
  for (const [from, to] of mutations) {
    assert(source.includes(from), `SELF_TEST_FIXTURE_MISSING:${from}`);
    let rejected = false;
    try { validateSnapshotTerminalOutcomeProviderReceipt(source.replace(from, to)); } catch { rejected = true; }
    assert(rejected, `SELF_TEST_MUTATION_NOT_REJECTED:${from}`);
  }
}

process.stdout.write(JSON.stringify({ state: 'VERIFIED_PASS', self_test: process.argv.includes('--self-test') }) + '\n');
