#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DEFAULT_ALLOWED_EVENTS = ['schedule', 'workflow_dispatch', 'push'];
const DEFAULT_MAX_PAGES = 40;
const DEFAULT_LOOKBACK_DAYS = 95;
const DEFAULT_MAX_COMPRESSED_BYTES = 67_108_864;

export class ExactArtifactRestoreError extends Error {
  constructor(code, detail = null) {
    super(detail === null ? code : `${code}:${detail}`);
    this.name = 'ExactArtifactRestoreError';
    this.code = code;
  }
}

function fail(code, detail = null) {
  throw new ExactArtifactRestoreError(code, detail);
}

function requirePositiveInteger(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(code, value);
  return parsed;
}

function requireNonNegativeInteger(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(code, value);
  return parsed;
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function stableReceiptDigest(receipt) {
  return sha256(Buffer.from(JSON.stringify(receipt), 'utf8'));
}

function encodeQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return query.toString();
}

export async function collectCompletePages({ fetchPage, rowsKey, maxPages, label }) {
  requirePositiveInteger(maxPages, `${label}_MAX_PAGES_INVALID`);
  let expectedTotal = null;
  const rows = [];
  const seenIds = new Set();
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await fetchPage(page);
    pagesFetched = page;
    const pageTotal = requireNonNegativeInteger(payload?.total_count, `${label}_TOTAL_COUNT_INVALID`);
    if (expectedTotal === null) {
      expectedTotal = pageTotal;
      if (expectedTotal > maxPages * 100) fail('PAGINATION_BOUND_EXCEEDED', `${label}:${expectedTotal}`);
    } else if (pageTotal !== expectedTotal) {
      fail(`${label}_TOTAL_COUNT_CHANGED`, `${expectedTotal}:${pageTotal}`);
    }

    const pageRows = payload?.[rowsKey];
    if (!Array.isArray(pageRows) || pageRows.length > 100) fail(`${label}_PAGE_INVALID`, page);
    for (const row of pageRows) {
      const id = requirePositiveInteger(row?.id, `${label}_ROW_ID_INVALID`);
      if (seenIds.has(id)) fail(`${label}_DUPLICATE_ROW_ID`, id);
      seenIds.add(id);
      rows.push(row);
    }

    if (rows.length === expectedTotal) {
      return {
        rows,
        totalCount: expectedTotal,
        pagesFetched,
        paginationReconciledComplete: true,
      };
    }
    if (rows.length > expectedTotal || pageRows.length === 0) {
      fail(`${label}_PAGINATION_INCOMPLETE`, `${rows.length}:${expectedTotal}`);
    }
  }
  fail('PAGINATION_BOUND_EXCEEDED', `${label}:${expectedTotal ?? 'UNKNOWN'}`);
}

function parseArguments(argv) {
  const single = new Map();
  const multiple = new Map([
    ['required-basename', []],
    ['allowed-event', []],
  ]);
  let allowNoProducerHistory = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--allow-no-producer-history') {
      allowNoProducerHistory = true;
      continue;
    }
    if (!token.startsWith('--')) fail('ARGUMENT_INVALID', token);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', name);
    index += 1;
    if (multiple.has(name)) multiple.get(name).push(value);
    else if (single.has(name)) fail('ARGUMENT_DUPLICATE', name);
    else single.set(name, value);
  }
  const required = [
    'workflow-path', 'workflow-name', 'artifact-name', 'branch',
    'archive', 'extract-dir', 'receipt',
  ];
  for (const name of required) if (!single.get(name)) fail('ARGUMENT_REQUIRED', name);
  return {
    workflowPath: single.get('workflow-path'),
    workflowName: single.get('workflow-name'),
    artifactName: single.get('artifact-name'),
    branch: single.get('branch'),
    archivePath: single.get('archive'),
    extractDir: single.get('extract-dir'),
    receiptPath: single.get('receipt'),
    requiredBasenames: multiple.get('required-basename'),
    allowedEvents: multiple.get('allowed-event').length
      ? multiple.get('allowed-event')
      : DEFAULT_ALLOWED_EVENTS,
    maxPages: single.has('max-pages')
      ? requirePositiveInteger(single.get('max-pages'), 'MAX_PAGES_INVALID')
      : DEFAULT_MAX_PAGES,
    lookbackDays: single.has('lookback-days')
      ? requirePositiveInteger(single.get('lookback-days'), 'LOOKBACK_DAYS_INVALID')
      : DEFAULT_LOOKBACK_DAYS,
    maxCompressedBytes: single.has('max-compressed-bytes')
      ? requirePositiveInteger(single.get('max-compressed-bytes'), 'MAX_COMPRESSED_BYTES_INVALID')
      : DEFAULT_MAX_COMPRESSED_BYTES,
    allowNoProducerHistory,
  };
}

function validateSpecification(specification) {
  const repository = process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('GITHUB_REPOSITORY_INVALID');
  if (!token) fail('GITHUB_TOKEN_REQUIRED');
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(specification.workflowPath)) {
    fail('WORKFLOW_PATH_INVALID', specification.workflowPath);
  }
  if (!specification.workflowName.trim()) fail('WORKFLOW_NAME_INVALID');
  if (!/^[A-Za-z0-9_.-]+$/.test(specification.artifactName)) fail('ARTIFACT_NAME_INVALID');
  if (!/^[A-Za-z0-9._\/-]+$/.test(specification.branch)) fail('BRANCH_INVALID');
  if (new Set(specification.requiredBasenames).size !== specification.requiredBasenames.length) {
    fail('REQUIRED_BASENAME_DUPLICATE');
  }
  for (const basename of specification.requiredBasenames) {
    if (!basename || basename !== path.basename(basename) || basename === '.' || basename === '..') {
      fail('REQUIRED_BASENAME_INVALID', basename);
    }
  }
  if (!specification.requiredBasenames.length) fail('REQUIRED_BASENAME_MISSING');
  if (new Set(specification.allowedEvents).size !== specification.allowedEvents.length) {
    fail('ALLOWED_EVENT_DUPLICATE');
  }
  for (const event of specification.allowedEvents) {
    if (!/^[a-z_]+$/.test(event)) fail('ALLOWED_EVENT_INVALID', event);
  }
  const safeRoots = ['/tmp', process.env.RUNNER_TEMP].filter(Boolean).map((value) => path.resolve(value));
  const outputPaths = [
    ['ARCHIVE_PATH_UNSAFE', specification.archivePath],
    ['EXTRACT_PATH_UNSAFE', specification.extractDir],
    ['RECEIPT_PATH_UNSAFE', specification.receiptPath],
  ].map(([code, value]) => {
    const resolved = path.resolve(value);
    if (!safeRoots.some((root) => resolved !== root && resolved.startsWith(`${root}${path.sep}`))) {
      fail(code, resolved);
    }
    return resolved;
  });
  const [archivePath, extractDir, receiptPath] = outputPaths;
  if (new Set(outputPaths).size !== outputPaths.length
      || archivePath.startsWith(`${extractDir}${path.sep}`)
      || receiptPath.startsWith(`${extractDir}${path.sep}`)) {
    fail('OUTPUT_PATH_OVERLAP');
  }
  return { repository, token };
}

function validateWorkflowMetadata(workflow, specification) {
  if (workflow?.path !== specification.workflowPath) fail('WORKFLOW_PATH_MISMATCH', workflow?.path);
  if (workflow?.name !== specification.workflowName) fail('WORKFLOW_NAME_MISMATCH', workflow?.name);
  if (workflow?.state !== 'active') fail('WORKFLOW_NOT_ACTIVE', workflow?.state);
}

export function validateProducerRunEnvelope(run, specification, repository) {
  requirePositiveInteger(run?.id, 'RUN_ID_INVALID');
  requirePositiveInteger(run?.run_attempt, 'RUN_ATTEMPT_INVALID');
  if (run?.repository?.full_name !== repository) fail('RUN_REPOSITORY_MISMATCH', run?.id);
  if (run?.name !== specification.workflowName) fail('RUN_WORKFLOW_NAME_MISMATCH', run?.id);
  if (run?.path !== specification.workflowPath) fail('RUN_WORKFLOW_PATH_MISMATCH', run?.id);
  if (run?.head_branch !== specification.branch) fail('RUN_BRANCH_MISMATCH', run?.id);
  if (!SHA_PATTERN.test(run?.head_sha || '')) fail('RUN_SOURCE_SHA_INVALID', run?.id);
  if (run?.status !== 'completed' || run?.conclusion !== 'success') fail('RUN_NOT_SUCCESSFUL', run?.id);
  if (typeof run?.event !== 'string' || !run.event) fail('RUN_EVENT_INVALID', run?.id);
  if (!Number.isFinite(Date.parse(run?.created_at || ''))) fail('RUN_CREATED_AT_INVALID', run?.id);
  return run;
}

export function validateProducerRun(run, specification, repository) {
  validateProducerRunEnvelope(run, specification, repository);
  if (!specification.allowedEvents.includes(run.event)) fail('RUN_EVENT_FORBIDDEN', run.event);
  return run;
}

export function partitionProducerRuns(rows, specification, repository) {
  if (!Array.isArray(rows)) fail('WORKFLOW_RUN_HISTORY_ROWS_INVALID');
  const authoritative = [];
  const excluded = [];
  for (const row of rows) {
    validateProducerRunEnvelope(row, specification, repository);
    if (specification.allowedEvents.includes(row.event)) authoritative.push(row);
    else excluded.push({
      id: row.id,
      run_attempt: row.run_attempt,
      event: row.event,
      head_sha: row.head_sha,
      created_at: row.created_at,
    });
  }
  return { authoritative, excluded };
}

export function validateArtifact(artifact, run, specification) {
  requirePositiveInteger(artifact?.id, 'ARTIFACT_ID_INVALID');
  if (artifact?.name !== specification.artifactName) fail('ARTIFACT_NAME_MISMATCH', artifact?.id);
  if (artifact?.expired !== false) fail('ARTIFACT_EXPIRED', artifact?.id);
  if (!DIGEST_PATTERN.test(artifact?.digest || '')) fail('ARTIFACT_DIGEST_INVALID', artifact?.id);
  if (artifact?.workflow_run?.id !== run.id) fail('ARTIFACT_RUN_ID_MISMATCH', artifact?.id);
  if (artifact?.workflow_run?.head_sha !== run.head_sha) fail('ARTIFACT_SOURCE_SHA_MISMATCH', artifact?.id);
  if (artifact?.workflow_run?.head_branch !== run.head_branch) fail('ARTIFACT_BRANCH_MISMATCH', artifact?.id);
  const expiresAt = Date.parse(artifact?.expires_at || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) fail('ARTIFACT_EXPIRY_INVALID', artifact?.id);
  return artifact;
}

function sameArtifactMetadata(left, right) {
  return left?.id === right?.id
    && left?.name === right?.name
    && left?.expired === right?.expired
    && left?.digest === right?.digest
    && left?.expires_at === right?.expires_at
    && left?.workflow_run?.id === right?.workflow_run?.id
    && left?.workflow_run?.head_sha === right?.workflow_run?.head_sha
    && left?.workflow_run?.head_branch === right?.workflow_run?.head_branch;
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body) fail('ARCHIVE_BODY_MISSING');
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && requireNonNegativeInteger(declaredLength, 'ARCHIVE_CONTENT_LENGTH_INVALID') > maxBytes) {
    fail('ARCHIVE_COMPRESSED_SIZE_LIMIT', declaredLength);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      fail('ARCHIVE_COMPRESSED_SIZE_LIMIT', total);
    }
    chunks.push(Buffer.from(value));
  }
  if (total <= 0) fail('ARCHIVE_EMPTY');
  return Buffer.concat(chunks, total);
}

function findRequiredFiles(root, requiredBasenames) {
  const matches = new Map(requiredBasenames.map((basename) => [basename, []]));
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && matches.has(entry.name)) matches.get(entry.name).push(entryPath);
      else if (entry.isSymbolicLink()) fail('EXTRACTED_SYMLINK_FORBIDDEN', entryPath);
    }
  };
  visit(root);
  const result = [];
  for (const basename of requiredBasenames) {
    const paths = matches.get(basename);
    if (paths.length !== 1) fail('EXTRACTED_REQUIRED_BASENAME_CARDINALITY', `${basename}:${paths.length}`);
    const relativePath = path.relative(root, paths[0]).split(path.sep).join('/');
    result.push({ basename, relative_path: relativePath, digest: sha256(fs.readFileSync(paths[0])) });
  }
  return result;
}

function writeReceipt(receiptPath, receipt) {
  const sealed = { ...receipt, receipt_digest: stableReceiptDigest(receipt) };
  fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(sealed, null, 2)}\n`, { mode: 0o600 });
  return sealed;
}

export async function restoreExactArtifact(specification, dependencies = {}) {
  const { repository, token } = validateSpecification(specification);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE');
  const apiHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-exact-github-artifact-restore-v1',
  };
  const apiBase = `https://api.github.com/repos/${repository}/actions`;

  const request = async (url, options = {}, attempt = 0) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        const cooldownMilliseconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? Math.min(5_000, Math.max(500, retryAfterSeconds * 1_000))
          : 500 * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, cooldownMilliseconds));
        return request(url, options, attempt + 1);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };
  const getJson = async (url) => {
    const response = await request(url, { headers: apiHeaders });
    if (!response.ok) fail('GITHUB_API_ERROR', `${response.status}:${new URL(url).pathname}`);
    return response.json();
  };

  const workflowFile = path.basename(specification.workflowPath);
  const workflowMetadata = await getJson(`${apiBase}/workflows/${encodeURIComponent(workflowFile)}`);
  validateWorkflowMetadata(workflowMetadata, specification);

  const lookbackStart = new Date(Date.now() - specification.lookbackDays * 86_400_000).toISOString();
  const runQuery = (page) => encodeQuery({
    branch: specification.branch,
    status: 'success',
    created: `>=${lookbackStart}`,
    per_page: 100,
    page,
  });
  const runReadback = await collectCompletePages({
    label: 'WORKFLOW_RUN_HISTORY',
    rowsKey: 'workflow_runs',
    maxPages: specification.maxPages,
    fetchPage: (page) => getJson(`${apiBase}/workflows/${encodeURIComponent(workflowFile)}/runs?${runQuery(page)}`),
  });
  const runPartition = partitionProducerRuns(runReadback.rows, specification, repository);
  const runs = runPartition.authoritative.sort((left, right) => {
    const byCreated = Date.parse(right.created_at) - Date.parse(left.created_at);
    return byCreated || right.id - left.id;
  });

  if (!runs.length) {
    if (!specification.allowNoProducerHistory) fail('NO_PRODUCER_HISTORY');
    const allowedHistoryCounts = {};
    for (const event of specification.allowedEvents) {
      const allowedHistoryProbe = await getJson(
        `${apiBase}/workflows/${encodeURIComponent(workflowFile)}/runs?${encodeQuery({
          branch: specification.branch,
          status: 'success',
          event,
          per_page: 1,
          page: 1,
        })}`,
      );
      const allowedHistoryTotal = requireNonNegativeInteger(
        allowedHistoryProbe?.total_count,
        'ALLOWED_HISTORY_TOTAL_COUNT_INVALID',
      );
      if (!Array.isArray(allowedHistoryProbe?.workflow_runs)
          || allowedHistoryProbe.workflow_runs.length > 1) {
        fail('ALLOWED_HISTORY_PROBE_INVALID', event);
      }
      allowedHistoryCounts[event] = allowedHistoryTotal;
    }
    const allHistoryTotal = Object.values(allowedHistoryCounts)
      .reduce((total, count) => total + count, 0);
    if (allHistoryTotal !== 0) fail('PRODUCER_HISTORY_OUTSIDE_LOOKBACK', allHistoryTotal);
    const baselineArchivePath = path.resolve(specification.archivePath);
    const baselineExtractDir = path.resolve(specification.extractDir);
    fs.rmSync(baselineArchivePath, { force: true });
    fs.rmSync(`${baselineArchivePath}.safe-zip-receipt.json`, { force: true });
    fs.rmSync(baselineExtractDir, { recursive: true, force: true });
    fs.mkdirSync(baselineExtractDir, { recursive: true });
    const receipt = writeReceipt(specification.receiptPath, {
      id: 'kidults-exact-github-artifact-restore-receipt-v1',
      version: '1.0.0',
      state: 'NO_PRODUCER_HISTORY_BASELINE_ONLY',
      repository,
      producer_workflow_name: specification.workflowName,
      producer_workflow_path: specification.workflowPath,
      producer_branch: specification.branch,
      artifact_name: specification.artifactName,
      lookback_start: lookbackStart,
      run_total_count: runReadback.totalCount,
      authoritative_run_count: 0,
      disallowed_event_run_count: runPartition.excluded.length,
      run_pages_fetched: runReadback.pagesFetched,
      allowed_history_counts: allowedHistoryCounts,
      all_history_total_count: 0,
      pagination_reconciled_complete: true,
      baseline_reset_after_producer_history_forbidden: true,
      public_release: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD',
    });
    return receipt;
  }

  let selectedRun = null;
  let selectedArtifact = null;
  let selectedArtifactReadback = null;
  for (const run of runs) {
    const artifactReadback = await collectCompletePages({
      label: `RUN_${run.id}_ARTIFACTS`,
      rowsKey: 'artifacts',
      maxPages: specification.maxPages,
      fetchPage: (page) => getJson(`${apiBase}/runs/${run.id}/artifacts?${encodeQuery({ per_page: 100, page })}`),
    });
    const matches = artifactReadback.rows.filter((artifact) => artifact?.name === specification.artifactName);
    if (matches.length > 1) fail('ARTIFACT_CARDINALITY_INVALID', `${run.id}:${matches.length}`);
    if (matches.length === 0) continue;
    selectedRun = run;
    selectedArtifact = validateArtifact(matches[0], run, specification);
    selectedArtifactReadback = artifactReadback;
    break;
  }
  if (!selectedArtifact) fail('PRODUCER_HISTORY_WITHOUT_EXACT_ARTIFACT', runs.length);

  const exactRun = await getJson(`${apiBase}/runs/${selectedRun.id}`);
  validateProducerRun(exactRun, specification, repository);
  if (JSON.stringify({
    id: exactRun.id, attempt: exactRun.run_attempt, sha: exactRun.head_sha,
    path: exactRun.path, event: exactRun.event,
  }) !== JSON.stringify({
    id: selectedRun.id, attempt: selectedRun.run_attempt, sha: selectedRun.head_sha,
    path: selectedRun.path, event: selectedRun.event,
  })) fail('RUN_READBACK_MISMATCH', selectedRun.id);

  const exactArtifact = await getJson(`${apiBase}/artifacts/${selectedArtifact.id}`);
  validateArtifact(exactArtifact, exactRun, specification);
  if (!sameArtifactMetadata(selectedArtifact, exactArtifact)) fail('ARTIFACT_READBACK_MISMATCH', selectedArtifact.id);

  const archiveResponse = await request(`${apiBase}/artifacts/${selectedArtifact.id}/zip`, {
    headers: apiHeaders,
    redirect: 'manual',
  });
  if (![301, 302, 303, 307, 308].includes(archiveResponse.status)) {
    fail('ARCHIVE_REDIRECT_INVALID', archiveResponse.status);
  }
  const archiveLocation = archiveResponse.headers.get('location');
  if (!archiveLocation) fail('ARCHIVE_LOCATION_MISSING');
  const archiveUrl = new URL(archiveLocation);
  if (archiveUrl.protocol !== 'https:' || archiveUrl.username || archiveUrl.password) {
    fail('ARCHIVE_LOCATION_UNSAFE', archiveUrl.origin);
  }
  const archiveDownload = await request(archiveUrl, { redirect: 'error' });
  if (!archiveDownload.ok) fail('ARCHIVE_DOWNLOAD_ERROR', archiveDownload.status);
  const archiveBytes = await readBoundedBody(archiveDownload, specification.maxCompressedBytes);
  const archiveDigest = sha256(archiveBytes);
  if (archiveDigest !== selectedArtifact.digest) fail('ARCHIVE_DIGEST_MISMATCH', archiveDigest);

  const archivePath = path.resolve(specification.archivePath);
  const extractDir = path.resolve(specification.extractDir);
  const validationReceiptPath = `${archivePath}.safe-zip-receipt.json`;
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, archiveBytes, { mode: 0o600 });
  const safeZipArguments = [
    'scripts/kidults/kpmo/validate-safe-zip-archive-v1.py',
    '--archive', archivePath,
    '--expected-digest', selectedArtifact.digest,
    '--receipt', validationReceiptPath,
    '--max-compressed-bytes', String(specification.maxCompressedBytes),
    '--max-entries', '2048',
    '--max-entry-uncompressed-bytes', '67108864',
    '--max-total-uncompressed-bytes', '268435456',
    '--max-compression-ratio', '100',
  ];
  for (const basename of specification.requiredBasenames) {
    safeZipArguments.push('--required-basename', basename);
  }
  execFileSync('python3', safeZipArguments, { stdio: 'pipe' });
  const safeZipReceiptBytes = fs.readFileSync(validationReceiptPath);
  const safeZipReceipt = JSON.parse(safeZipReceiptBytes);
  if (safeZipReceipt.state !== 'VERIFIED_PASS_PRE_EXTRACTION'
      || safeZipReceipt.archive_digest !== selectedArtifact.digest
      || safeZipReceipt.required_basename_cardinality_verified !== true) {
    fail('SAFE_ZIP_RECEIPT_INVALID');
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('unzip', ['-q', '-o', archivePath, '-d', extractDir], { stdio: 'pipe' });
  const requiredFiles = findRequiredFiles(extractDir, specification.requiredBasenames);

  const receipt = writeReceipt(specification.receiptPath, {
    id: 'kidults-exact-github-artifact-restore-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS_EXACT_ARTIFACT_SAFE_EXTRACTION',
    repository,
    producer_workflow_name: specification.workflowName,
    producer_workflow_path: specification.workflowPath,
    producer_branch: specification.branch,
    producer_event: exactRun.event,
    producer_run_id: exactRun.id,
    producer_run_attempt: exactRun.run_attempt,
    producer_source_sha: exactRun.head_sha,
    producer_status: exactRun.status,
    producer_conclusion: exactRun.conclusion,
    artifact_name: exactArtifact.name,
    artifact_id: exactArtifact.id,
    artifact_digest: exactArtifact.digest,
    artifact_expires_at: exactArtifact.expires_at,
    artifact_cardinality: 1,
    downloaded_archive_digest: archiveDigest,
    downloaded_archive_bytes: archiveBytes.length,
    safe_zip_receipt_path: validationReceiptPath,
    safe_zip_receipt_digest: sha256(safeZipReceiptBytes),
    safe_zip_state: safeZipReceipt.state,
    required_files: requiredFiles,
    run_total_count: runReadback.totalCount,
    authoritative_run_count: runs.length,
    disallowed_event_run_count: runPartition.excluded.length,
    run_pages_fetched: runReadback.pagesFetched,
    artifact_total_count_for_selected_run: selectedArtifactReadback.totalCount,
    artifact_pages_fetched_for_selected_run: selectedArtifactReadback.pagesFetched,
    pagination_reconciled_complete: true,
    exact_producer_bound: true,
    exact_run_bound: true,
    exact_source_sha_bound: true,
    exact_artifact_bound: true,
    exact_digest_bound: true,
    exact_required_file_cardinality_bound: true,
    safe_zip_validated_before_extraction: true,
    baseline_reset_after_producer_history_forbidden: true,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
  return receipt;
}

async function main() {
  try {
    const specification = parseArguments(process.argv.slice(2));
    const receipt = await restoreExactArtifact(specification);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    const code = error instanceof ExactArtifactRestoreError ? error.message : `UNEXPECTED:${error?.message || error}`;
    console.error(`EXACT_GITHUB_ARTIFACT_RESTORE_FAILED:${code}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
