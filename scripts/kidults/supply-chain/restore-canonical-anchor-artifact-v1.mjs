#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.env.KIDULTS_ANCHOR_MANIFEST ||
  'coordination/kidults/product/representative-anchor-input-manifest-v1.json';
const outputPath = process.argv[2];
const receiptPath = process.argv[3] || '/tmp/kidults-canonical-anchor-restore-receipt-v1.json';
const validateOnly = process.argv.includes('--validate-manifest-only');

function fail(message) {
  console.error(`CANONICAL_ANCHOR_RESTORE_FAILED:${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
if (manifest.id !== 'representative-anchor-input-manifest-v1') fail('MANIFEST_ID');
if (manifest.status !== 'CANONICAL_ACTIVE') fail('MANIFEST_STATUS');
if (!Number.isSafeInteger(manifest.source?.workflow_run_id)) fail('WORKFLOW_RUN_ID');
if (!Number.isSafeInteger(manifest.source?.artifact_id)) fail('ARTIFACT_ID');
if (!/^sha256:[0-9a-f]{64}$/.test(manifest.source?.artifact_digest || '')) fail('ARTIFACT_DIGEST');
if (!/^[0-9a-f]{40}$/.test(manifest.source?.validated_head || '')) fail('VALIDATED_HEAD');
if (!Array.isArray(manifest.official_input_files) || manifest.official_input_files.length === 0) fail('OFFICIAL_FILES');
if (new Set(manifest.official_input_files).size !== manifest.official_input_files.length) fail('DUPLICATE_OFFICIAL_FILES');
if (manifest.governance?.artifact_may_self_qualify_collectible !== false ||
    manifest.governance?.artifact_may_self_qualify_representative !== false ||
    manifest.governance?.artifact_may_authorize_source_acquisition !== false ||
    manifest.governance?.artifact_may_authorize_index_or_publication !== false) {
  fail('AUTHORITY_BOUNDARY');
}

if (validateOnly) {
  console.log(JSON.stringify({
    state: 'VERIFIED_PASS',
    manifest: manifestPath,
    manifest_digest: sha256(manifestBytes),
    authority: 'STRUCTURAL_PREFLIGHT_ONLY',
    public_release: 'HOLD',
    production: 'HOLD'
  }, null, 2));
  process.exit(0);
}

if (!outputPath) fail('OUTPUT_PATH_REQUIRED');
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!repository) fail('GITHUB_REPOSITORY_REQUIRED');
if (!token) fail('GITHUB_TOKEN_REQUIRED');

const apiHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-canonical-anchor-restore-v1'
};
const apiBase = `https://api.github.com/repos/${repository}/actions`;

async function getJson(url) {
  const response = await fetch(url, { headers: apiHeaders });
  if (!response.ok) fail(`API_${response.status}:${new URL(url).pathname}`);
  return response.json();
}

const artifact = await getJson(`${apiBase}/artifacts/${manifest.source.artifact_id}`);
const run = await getJson(`${apiBase}/runs/${manifest.source.workflow_run_id}`);

if (artifact.id !== manifest.source.artifact_id) fail('ARTIFACT_ID_MISMATCH');
if (artifact.name !== manifest.source.artifact_name) fail('ARTIFACT_NAME_MISMATCH');
if (artifact.expired !== false) fail('ARTIFACT_EXPIRED');
if (artifact.digest !== manifest.source.artifact_digest) fail('ARTIFACT_DIGEST_METADATA_MISMATCH');
if (artifact.workflow_run?.id !== manifest.source.workflow_run_id) fail('ARTIFACT_RUN_MISMATCH');
if (artifact.workflow_run?.head_sha !== manifest.source.validated_head) fail('ARTIFACT_HEAD_MISMATCH');
if (run.id !== manifest.source.workflow_run_id) fail('RUN_ID_MISMATCH');
if (run.head_sha !== manifest.source.validated_head) fail('RUN_HEAD_MISMATCH');
if (run.head_branch !== manifest.source.source_branch) fail('RUN_BRANCH_MISMATCH');
if (run.status !== 'completed' || run.conclusion !== 'success') fail('RUN_NOT_SUCCESSFUL');

const archiveResponse = await fetch(
  `${apiBase}/artifacts/${manifest.source.artifact_id}/zip`,
  { headers: apiHeaders, redirect: 'manual' }
);
if (![301, 302, 303, 307, 308].includes(archiveResponse.status)) {
  fail(`ARCHIVE_REDIRECT_${archiveResponse.status}`);
}
const archiveLocation = archiveResponse.headers.get('location');
if (!archiveLocation) fail('ARCHIVE_LOCATION_MISSING');
const archiveUrl = new URL(archiveLocation);
if (archiveUrl.protocol !== 'https:') fail('ARCHIVE_LOCATION_NOT_HTTPS');
const archiveDownload = await fetch(archiveUrl, { redirect: 'error' });
if (!archiveDownload.ok) fail(`ARCHIVE_DOWNLOAD_${archiveDownload.status}`);
const archiveBytes = Buffer.from(await archiveDownload.arrayBuffer());
const archiveDigest = sha256(archiveBytes);
if (archiveDigest !== manifest.source.artifact_digest) fail('ARCHIVE_DIGEST_MISMATCH');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, archiveBytes, { mode: 0o600 });
const receipt = {
  id: 'kidults-canonical-anchor-restore-receipt-v1',
  state: 'VERIFIED_PASS',
  repository,
  manifest_path: manifestPath,
  manifest_digest: sha256(manifestBytes),
  workflow_run_id: run.id,
  artifact_id: artifact.id,
  artifact_name: artifact.name,
  artifact_digest: archiveDigest,
  source_sha: run.head_sha,
  source_branch: run.head_branch,
  exact_run_bound: true,
  exact_artifact_bound: true,
  exact_digest_bound: true,
  artifact_cardinality: 1,
  authority: 'STRUCTURAL_PREFLIGHT_ONLY',
  autonomous_effect: 'POSITIVE_SINGLE_CANONICAL_RESTORE_PATH',
  global_effect: 'POSITIVE_ALL_CONSUMERS_SHARE_ONE_MANIFEST',
  irreplaceable_value_effect: 'POSITIVE_REPRODUCIBLE_PRODUCT_ANCHORS',
  transparency_effect: 'POSITIVE_RUN_ARTIFACT_SHA_DIGEST_RECEIPT',
  public_release: 'HOLD',
  production: 'HOLD'
};
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
