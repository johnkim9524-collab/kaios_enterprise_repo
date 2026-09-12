#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSources, scanEstate } from './validate-estate-artifact-consumption-boundary-v1.mjs';

const fixturePath = '.github/workflows/synthetic-exact-artifact-consumer.yml';
const safeWorkflow = String.raw`name: Synthetic exact artifact consumer
on: workflow_dispatch
jobs:
  consume:
    runs-on: ubuntu-24.04
    steps:
      - name: Consume exact artifact
        shell: bash
        run: |
          RUN_ID="$UPSTREAM_RUN_ID"
          gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID" > /tmp/run.json
          ARTIFACTS=$(gh api --paginate "/repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID/artifacts?per_page=100" --slurp)
          node - <<'NODE'
          const fs=require('fs');
          const run=JSON.parse(fs.readFileSync('/tmp/run.json'));
          if(run.id!==Number(process.env.UPSTREAM_RUN_ID)||run.path!==process.env.EXPECTED_WORKFLOW_PATH||run.head_sha!==process.env.EXPECTED_SOURCE_SHA||run.event!=='workflow_run'||run.status!=='completed'||run.conclusion!=='success')throw new Error('PRODUCER_PROVENANCE');
          const artifacts=JSON.parse(process.env.ARTIFACTS).flatMap(page=>page.artifacts||[]).filter(artifact=>artifact.name===process.env.EXPECTED_ARTIFACT_NAME&&artifact.expired===false&&artifact.workflow_run?.id===run.id&&artifact.workflow_run?.head_sha===run.head_sha);
          if(artifacts.length!==1)throw new Error('ARTIFACT_CARDINALITY');
          if(!/^sha256:[a-f0-9]{64}$/.test(artifacts[0].digest||''))throw new Error('ARTIFACT_DIGEST');
          fs.writeFileSync('/tmp/artifact.json',JSON.stringify(artifacts[0]));
          NODE
          ARTIFACT_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/artifact.json')).id")
          ARTIFACT_DIGEST=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/artifact.json')).digest")
          ARCHIVE=/tmp/exact.zip
          gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$ARTIFACT_ID/zip" > "$ARCHIVE"
          python3 scripts/kidults/kpmo/validate-safe-zip-archive-v1.py \
            --archive "$ARCHIVE" \
            --expected-digest "$ARTIFACT_DIGEST" \
            --receipt /tmp/archive-validation.json \
            --max-compressed-bytes 4194304 \
            --max-entries 64 \
            --max-entry-uncompressed-bytes 8388608 \
            --max-total-uncompressed-bytes 33554432 \
            --max-compression-ratio 100
          unzip -q -o "$ARCHIVE" -d /tmp/exact
`;

const analyzeFixture = workflow => analyzeSources({ workflows: { [fixturePath]: workflow }, helpers: {} });
const codes = report => new Set(report.findings.map(item => item.code));

const positive = analyzeFixture(safeWorkflow);
assert.equal(positive.state, 'VERIFIED_PASS', JSON.stringify(positive.findings, null, 2));
assert.equal(positive.counts.raw_zip_extraction_occurrences, 1);
assert.equal(positive.counts.safe_zip_prevalidated_extraction_occurrences, 1);
assert.equal(positive.counts.artifact_lookup_occurrences, 1);

const mutations = [
  {
    id: 'repository_global_first100_first_result',
    mutate: source => source
      .replace('gh api --paginate', 'gh api')
      .replace('/actions/runs/$RUN_ID/artifacts?per_page=100', '/actions/artifacts?per_page=100')
      .replace('const artifacts=JSON.parse(process.env.ARTIFACTS).flatMap(page=>page.artifacts||[]).filter', 'const artifacts=[JSON.parse(process.env.ARTIFACTS).artifacts[0]].filter'),
    expected: ['EXACT_RUN_SCOPED_ARTIFACT_LOOKUP_MISSING', 'REPOSITORY_GLOBAL_FIRST_PAGE_ONLY', 'BROAD_FIRST_RESULT_SELECTION'],
  },
  {
    id: 'target_only_on_second_page_incomplete_pagination',
    mutate: source => source.replace('gh api --paginate', 'gh api'),
    expected: ['INCOMPLETE_ARTIFACT_PAGINATION'],
  },
  {
    id: 'artifact_digest_binding_removed',
    mutate: source => source
      .replace("if(!/^sha256:[a-f0-9]{64}$/.test(artifacts[0].digest||''))throw new Error('ARTIFACT_DIGEST');", '')
      .replace('ARTIFACT_DIGEST=$(node -p "JSON.parse(require(\'fs\').readFileSync(\'/tmp/artifact.json\')).digest")', 'EXPECTED_HASH=unknown')
      .replace('--expected-digest "$ARTIFACT_DIGEST"', '--expected-hash "$EXPECTED_HASH"'),
    expected: ['ARTIFACT_DIGEST_BINDING_MISSING', 'RAW_ZIP_EXTRACTION_WITHOUT_PREVALIDATION', 'SAFE_ZIP_PREVALIDATION_ARGUMENTS_MISSING'],
  },
  {
    id: 'artifact_cardinality_binding_removed',
    mutate: source => source.replace("if(artifacts.length!==1)throw new Error('ARTIFACT_CARDINALITY');", ''),
    expected: ['ARTIFACT_CARDINALITY_BINDING_MISSING'],
  },
  {
    id: 'producer_provenance_binding_removed',
    mutate: source => source.replace("if(run.id!==Number(process.env.UPSTREAM_RUN_ID)||run.path!==process.env.EXPECTED_WORKFLOW_PATH||run.head_sha!==process.env.EXPECTED_SOURCE_SHA||run.event!=='workflow_run'||run.status!=='completed'||run.conclusion!=='success')throw new Error('PRODUCER_PROVENANCE');", ''),
    expected: ['ARTIFACT_PRODUCER_PROVENANCE_MISSING'],
  },
  {
    id: 'safe_zip_moved_after_extraction',
    mutate: source => {
      const validatorStart = source.indexOf('          python3 scripts/kidults/kpmo/validate-safe-zip-archive-v1.py');
      const extraction = '          unzip -q -o "$ARCHIVE" -d /tmp/exact\n';
      const extractionIndex = source.indexOf(extraction);
      assert.ok(validatorStart >= 0 && extractionIndex > validatorStart, 'fixture command bounds');
      const validator = source.slice(validatorStart, extractionIndex);
      return `${source.slice(0, validatorStart)}${extraction}${validator}${source.slice(extractionIndex + extraction.length)}`;
    },
    expected: ['RAW_ZIP_EXTRACTION_WITHOUT_PREVALIDATION', 'SAFE_ZIP_VALIDATION_AFTER_EXTRACTION'],
  },
];

for (const mutation of mutations) {
  const report = analyzeFixture(mutation.mutate(safeWorkflow));
  const observed = codes(report);
  for (const expected of mutation.expected) {
    assert.ok(observed.has(expected), `${mutation.id} escaped ${expected}: ${JSON.stringify(report.findings, null, 2)}`);
  }
  assert.equal(report.state, 'HOLD', `${mutation.id} must fail closed`);
  assert.equal(report.exit_code, 2, `${mutation.id} must expose nonzero CLI semantics`);
}

const governedRestorePath = 'scripts/kidults/supply-chain/restore-exact-github-artifact-v1.mjs';
const governedRestoreSource = fs.readFileSync(governedRestorePath, 'utf8');
const governedRestoreWorkflow = `name: Governed restore wrapper fixture
on: workflow_dispatch
jobs:
  restore:
    runs-on: ubuntu-24.04
    steps:
      - run: node ${governedRestorePath} --workflow-path fixture.yml
`;
const analyzeGovernedRestore = helper => analyzeSources({
  workflows: { '.github/workflows/governed-restore-wrapper-fixture.yml': governedRestoreWorkflow },
  helpers: { [governedRestorePath]: helper },
});
const governedPositive = analyzeGovernedRestore(governedRestoreSource);
assert.equal(governedPositive.state, 'VERIFIED_PASS', JSON.stringify(governedPositive.findings, null, 2));
assert.equal(governedPositive.counts.raw_zip_extraction_occurrences, 1);
assert.equal(governedPositive.counts.safe_zip_prevalidated_extraction_occurrences, 1);
assert.equal(governedPositive.counts.exact_run_artifact_lookup_occurrences, 1);

const governedRestoreMutations = [
  {
    id: 'governed_restore_pagination_reconciliation_removed',
    mutate: source => source.replaceAll('pagination_reconciled_complete: true', 'pagination_reconciled_complete: false'),
    expected: ['GOVERNED_RESTORE_PAGINATION_RECONCILIATION_MISSING', 'INCOMPLETE_ARTIFACT_PAGINATION'],
  },
  {
    id: 'governed_restore_exact_producer_path_removed',
    mutate: source => source.replace("if (run?.path !== specification.workflowPath) fail('RUN_WORKFLOW_PATH_MISMATCH', run?.id);", ''),
    expected: ['GOVERNED_RESTORE_EXACT_PRODUCER_BINDING_MISSING', 'ARTIFACT_PRODUCER_PROVENANCE_MISSING'],
  },
  {
    id: 'governed_restore_artifact_cardinality_removed',
    mutate: source => source.replace("if (matches.length > 1) fail('ARTIFACT_CARDINALITY_INVALID', `${run.id}:${matches.length}`);", ''),
    expected: ['GOVERNED_RESTORE_ARTIFACT_CARDINALITY_MISSING', 'ARTIFACT_CARDINALITY_BINDING_MISSING'],
  },
  {
    id: 'governed_restore_download_digest_equality_removed',
    mutate: source => source.replace("if (archiveDigest !== selectedArtifact.digest) fail('ARCHIVE_DIGEST_MISMATCH', archiveDigest);", ''),
    expected: ['GOVERNED_RESTORE_DIGEST_BINDING_MISSING', 'ARTIFACT_DIGEST_BINDING_MISSING'],
  },
  {
    id: 'governed_restore_required_file_cardinality_removed',
    mutate: source => source.replace("if (paths.length !== 1) fail('EXTRACTED_REQUIRED_BASENAME_CARDINALITY', `${basename}:${paths.length}`);", ''),
    expected: ['GOVERNED_RESTORE_REQUIRED_FILE_CARDINALITY_MISSING'],
  },
  {
    id: 'governed_restore_safe_zip_moved_after_extraction',
    mutate: source => {
      const validation = "  execFileSync('python3', safeZipArguments, { stdio: 'pipe' });\n";
      const extraction = "  execFileSync('unzip', ['-q', '-o', archivePath, '-d', extractDir], { stdio: 'pipe' });\n";
      const validationIndex = source.indexOf(validation);
      const extractionIndex = source.indexOf(extraction);
      assert.ok(validationIndex >= 0 && extractionIndex > validationIndex, 'governed restore command bounds');
      const withoutExtraction = `${source.slice(0, extractionIndex)}${source.slice(extractionIndex + extraction.length)}`;
      return `${withoutExtraction.slice(0, validationIndex)}${extraction}${withoutExtraction.slice(validationIndex)}`;
    },
    expected: ['GOVERNED_RESTORE_SAFE_ZIP_PREVALIDATION_MISSING', 'RAW_ZIP_EXTRACTION_WITHOUT_PREVALIDATION', 'SAFE_ZIP_VALIDATION_AFTER_EXTRACTION'],
  },
];

for (const mutation of governedRestoreMutations) {
  const report = analyzeGovernedRestore(mutation.mutate(governedRestoreSource));
  const observed = codes(report);
  for (const expected of mutation.expected) {
    assert.ok(observed.has(expected), `${mutation.id} escaped ${expected}: ${JSON.stringify(report.findings, null, 2)}`);
  }
  assert.equal(report.state, 'HOLD', `${mutation.id} must fail closed`);
  assert.equal(report.exit_code, 2, `${mutation.id} must expose nonzero CLI semantics`);
}

const live = scanEstate(path.resolve('.'));
assert.ok(live.counts.workflow_files_scanned >= 300, 'estate workflow discovery unexpectedly narrow');
assert.equal(live.counts.raw_zip_extraction_occurrences,
  live.counts.safe_zip_prevalidated_extraction_occurrences + live.counts.unsafe_raw_zip_extraction_occurrences,
  'raw extraction accounting must be exact');
assert.equal(live.counts.artifact_lookup_occurrences,
  live.counts.repository_global_artifact_lookup_occurrences + live.counts.exact_run_artifact_lookup_occurrences,
  'artifact lookup accounting must be exact');
for (const [criticalPath, state] of Object.entries(live.critical)) {
  assert.equal(state.present, true, `critical path missing: ${criticalPath}`);
  assert.equal(state.reachable, true, `critical helper not reachable: ${criticalPath}`);
}
assert.equal(live.state, live.findings.length ? 'HOLD' : 'VERIFIED_PASS');
assert.equal(live.exit_code, live.findings.length ? 2 : 0);

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'ESTATE_ARTIFACT_CONSUMPTION_BOUNDARY_V1_MUTATION_SUITE',
  mutation_cases_rejected: mutations.length + governedRestoreMutations.length,
  live_estate_state: live.state,
  live_estate_counts: live.counts,
  production: 'HOLD',
  public_release: 'HOLD',
}, null, 2));
