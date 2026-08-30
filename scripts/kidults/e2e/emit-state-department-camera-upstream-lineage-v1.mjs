#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  COMMIT_SHA_PATTERN,
  CONTROL_CONTRACT_PATH,
  ensure,
  hashText,
  hashValue,
  readJson,
  stableJson,
  validateUpstreamLineage,
} from './lawful-control-chain-common-v1.mjs';

const controlContract = readJson(CONTROL_CONTRACT_PATH);
const [command, ...args] = process.argv.slice(2);

const protectedFields = {
  source_facts_included: false,
  raw_source_payload_included: false,
  canonical_candidate_created: false,
  official_track_b_started: false,
  real_product_value_proof: false,
  approved_projection: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const writeExclusiveAtomic = (outputArg, value) => {
  const outputPath = path.resolve(outputArg);
  ensure(!fs.existsSync(outputPath), 'CONTROL_UPSTREAM_LINEAGE_OUTPUT_ALREADY_EXISTS');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, stableJson(value), { flag: 'wx' });
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  return outputPath;
};

if (command === 'validation-only') {
  const [sourceSha, outputArg] = args;
  ensure(Boolean(sourceSha && outputArg), 'USAGE: emit-state-department-camera-upstream-lineage-v1.mjs validation-only <source-sha> <new-output.json>');
  ensure(COMMIT_SHA_PATTERN.test(sourceSha), 'CONTROL_UPSTREAM_LINEAGE_SOURCE_SHA_INVALID');
  const lineage = {
    id: 'kidults-state-department-camera-upstream-lineage-v1',
    version: '1.0.0',
    state: 'VALIDATION_ONLY_NO_CANONICAL_UPSTREAM_ARTIFACT',
    mode: 'PR_OR_LOCAL_VALIDATION_ONLY',
    source_sha: sourceSha,
    upstream_workflow: {
      name: null,
      path: null,
      run_id: null,
      head_sha: null,
      status: null,
      conclusion: null,
      head_branch: null,
    },
    upstream_artifact: {
      name: null,
      artifact_id: null,
      artifact_count: 0,
      archive_digest: null,
      expired: null,
      archive_digest_reverified: false,
      digest_reverification: null,
      download_action_pin: null,
      extracted_content_tree_sha256: null,
    },
    predecessor_receipts: {
      evidence_manifest_path: null,
      evidence_manifest_sha256: null,
      evidence_validation_path: null,
      evidence_validation_sha256: null,
      source_projection_sha256: null,
    },
    ...protectedFields,
  };
  validateUpstreamLineage(lineage, controlContract, { expectedSourceSha: sourceSha });
  const outputPath = writeExclusiveAtomic(outputArg, lineage);
  process.stdout.write(stableJson({ state: lineage.state, mode: lineage.mode, source_sha: sourceSha, output_file: outputPath }));
} else if (command === 'verify') {
  const [runApiArg, artifactsApiArg, downloadDirectoryArg, expectedRunIdArg, expectedSourceSha, expectedRepository, mode, outputArg] = args;
  ensure(Boolean(runApiArg && artifactsApiArg && downloadDirectoryArg && expectedRunIdArg && expectedSourceSha && expectedRepository && mode && outputArg), 'USAGE: emit-state-department-camera-upstream-lineage-v1.mjs verify <run-api.json> <artifacts-api.json> <download-directory> <expected-run-id> <expected-source-sha> <owner/repository> <CANONICAL_WORKFLOW_RUN|MANUAL_RECOVERY> <new-output.json>');
  ensure(['CANONICAL_WORKFLOW_RUN', 'MANUAL_RECOVERY'].includes(mode), 'CONTROL_UPSTREAM_LINEAGE_MODE_INVALID');
  ensure(COMMIT_SHA_PATTERN.test(expectedSourceSha), 'CONTROL_UPSTREAM_LINEAGE_EXPECTED_SOURCE_SHA_INVALID');
  const expectedRunId = Number(expectedRunIdArg);
  ensure(Number.isSafeInteger(expectedRunId) && expectedRunId > 0, 'CONTROL_UPSTREAM_LINEAGE_EXPECTED_RUN_ID_INVALID');
  ensure(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedRepository), 'CONTROL_UPSTREAM_LINEAGE_EXPECTED_REPOSITORY_INVALID');

  const run = readJson(runApiArg);
  const artifactEnvelope = readJson(artifactsApiArg);
  ensure(run.id === expectedRunId, 'CONTROL_UPSTREAM_RUN_ID_REBINDING');
  ensure(run.name === controlContract.validation.canonical_upstream_workflow_name && run.path === controlContract.validation.canonical_upstream_workflow_path, 'CONTROL_UPSTREAM_RUN_PATH_OR_NAME_REBINDING');
  ensure(run.head_sha === expectedSourceSha, 'CONTROL_UPSTREAM_RUN_HEAD_SHA_REBINDING');
  ensure(run.status === 'completed' && run.conclusion === 'success' && run.head_branch === 'main', 'CONTROL_UPSTREAM_RUN_NOT_SUCCESSFULLY_COMPLETED');
  ensure(run.repository?.full_name === expectedRepository && run.head_repository?.full_name === expectedRepository, 'CONTROL_UPSTREAM_RUN_REPOSITORY_REBINDING');
  ensure(artifactEnvelope.total_count === controlContract.validation.canonical_upstream_artifact_count, 'CONTROL_UPSTREAM_ARTIFACT_COUNT_INVALID');
  ensure(Array.isArray(artifactEnvelope.artifacts) && artifactEnvelope.artifacts.length === 1, 'CONTROL_UPSTREAM_ARTIFACT_LIST_INVALID');
  const artifact = artifactEnvelope.artifacts[0];
  ensure(artifact.name === controlContract.validation.canonical_upstream_artifact_name, 'CONTROL_UPSTREAM_ARTIFACT_NAME_INVALID');
  ensure(Number.isSafeInteger(artifact.id) && artifact.id > 0 && artifact.expired === false, 'CONTROL_UPSTREAM_ARTIFACT_ID_OR_EXPIRY_INVALID');
  ensure(/^sha256:[a-f0-9]{64}$/.test(artifact.digest || ''), 'CONTROL_UPSTREAM_ARTIFACT_ARCHIVE_DIGEST_INVALID');
  if (artifact.workflow_run?.id !== undefined) ensure(artifact.workflow_run.id === expectedRunId, 'CONTROL_UPSTREAM_ARTIFACT_RUN_REBINDING');
  ensure(process.env.KIDULTS_UPSTREAM_ARCHIVE_DIGEST_REVERIFIED === '1', 'CONTROL_UPSTREAM_ARTIFACT_ARCHIVE_DIGEST_REVERIFICATION_NOT_ATTESTED');

  const downloadDirectory = path.resolve(downloadDirectoryArg);
  ensure(fs.statSync(downloadDirectory).isDirectory(), 'CONTROL_UPSTREAM_ARTIFACT_DOWNLOAD_DIRECTORY_INVALID');
  const treeFiles = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      ensure(!entry.isSymbolicLink(), `CONTROL_UPSTREAM_ARTIFACT_SYMLINK_FORBIDDEN:${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else {
        ensure(entry.isFile(), `CONTROL_UPSTREAM_ARTIFACT_NONREGULAR_FILE_FORBIDDEN:${absolute}`);
        const relative = path.relative(downloadDirectory, absolute).split(path.sep).join('/');
        ensure(!/\.(?:html?|png|jpe?g|gif|svg|webp)$/i.test(relative), `CONTROL_UPSTREAM_ARTIFACT_RAW_OR_GRAPHIC_PAYLOAD_FORBIDDEN:${relative}`);
        const content = fs.readFileSync(absolute);
        treeFiles.push({ path: relative, sha256: hashText(content), bytes: content.byteLength });
      }
    }
  };
  walk(downloadDirectory);
  treeFiles.sort((left, right) => left.path.localeCompare(right.path));
  ensure(treeFiles.length > 0, 'CONTROL_UPSTREAM_ARTIFACT_EMPTY');

  const evidenceManifestPath = 'kidults-state-department-camera-evidence-run-1/state-department-camera-evidence-manifest-v1.json';
  const evidenceValidationPath = 'state-department-camera-evidence-final-validation-v1.json';
  ensure(treeFiles.some((entry) => entry.path === evidenceManifestPath), 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_MISSING');
  ensure(treeFiles.some((entry) => entry.path === evidenceValidationPath), 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_MISSING');
  const evidenceManifest = readJson(path.join(downloadDirectory, evidenceManifestPath));
  const evidenceValidation = readJson(path.join(downloadDirectory, evidenceValidationPath));
  ensure(evidenceManifest.id === 'kidults-state-department-camera-evidence-manifest-v1' && evidenceManifest.state === 'VERIFIED_PASS', 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_STATE_INVALID');
  ensure(evidenceManifest.source_binding?.source_projection_sha256 === controlContract.authoritative_source.source_projection_sha256, 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_SOURCE_DIGEST_REBINDING');
  ensure(evidenceManifest.results?.auction_result_reference_evidence_admitted === 1 && evidenceManifest.results?.snapshot_candidates_created === 0 && evidenceManifest.results?.track_b_input_pairs_created === 0, 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_TRUTH_INVALID');
  ensure(evidenceManifest.public_release === 'HOLD' && evidenceManifest.production === 'HOLD' && evidenceManifest.g5 === 'HOLD', 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_GATES_INVALID');
  ensure(evidenceValidation.id === 'kidults-state-department-camera-evidence-validation-v1' && evidenceValidation.state === 'VERIFIED_PASS', 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_STATE_INVALID');
  ensure(evidenceValidation.source_projection_sha256 === controlContract.authoritative_source.source_projection_sha256, 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_SOURCE_DIGEST_REBINDING');
  ensure(evidenceValidation.auction_result_reference_evidence_admitted === 1 && evidenceValidation.verified_sold_events_created === 0 && evidenceValidation.top_16_evidence_admitted === 0, 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_TRUTH_INVALID');
  ensure(evidenceValidation.public_release === 'HOLD' && evidenceValidation.production === 'HOLD' && evidenceValidation.g5 === 'HOLD', 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_GATES_INVALID');

  const lineage = {
    id: 'kidults-state-department-camera-upstream-lineage-v1',
    version: '1.0.0',
    state: 'VERIFIED_CANONICAL_UPSTREAM_ARTIFACT',
    mode,
    source_sha: expectedSourceSha,
    upstream_workflow: {
      name: run.name,
      path: run.path,
      run_id: run.id,
      head_sha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      head_branch: run.head_branch,
    },
    upstream_artifact: {
      name: artifact.name,
      artifact_id: artifact.id,
      artifact_count: artifactEnvelope.total_count,
      archive_digest: artifact.digest,
      expired: artifact.expired,
      archive_digest_reverified: true,
      digest_reverification: controlContract.validation.canonical_upstream_artifact_digest_reverification,
      download_action_pin: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
      extracted_content_tree_sha256: hashValue(treeFiles),
    },
    predecessor_receipts: {
      evidence_manifest_path: evidenceManifestPath,
      evidence_manifest_sha256: hashText(fs.readFileSync(path.join(downloadDirectory, evidenceManifestPath))),
      evidence_validation_path: evidenceValidationPath,
      evidence_validation_sha256: hashText(fs.readFileSync(path.join(downloadDirectory, evidenceValidationPath))),
      source_projection_sha256: controlContract.authoritative_source.source_projection_sha256,
    },
    ...protectedFields,
  };
  validateUpstreamLineage(lineage, controlContract, { expectedSourceSha, requireCanonical: true });
  const outputPath = writeExclusiveAtomic(outputArg, lineage);
  process.stdout.write(stableJson({
    state: lineage.state,
    mode: lineage.mode,
    source_sha: lineage.source_sha,
    upstream_run_id: lineage.upstream_workflow.run_id,
    upstream_artifact_id: lineage.upstream_artifact.artifact_id,
    upstream_artifact_digest: lineage.upstream_artifact.archive_digest,
    output_file: outputPath,
  }));
} else {
  throw new Error('USAGE: emit-state-department-camera-upstream-lineage-v1.mjs <validation-only|verify> ...');
}
