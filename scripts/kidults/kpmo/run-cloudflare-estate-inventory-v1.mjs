#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const approvalPath = process.argv[2];
const receiptPath = process.argv[3];
if (!approvalPath || !receiptPath) throw new Error('ESTATE_INVENTORY_PATHS_REQUIRED');
fs.mkdirSync(path.dirname(receiptPath), {recursive: true});

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const POLICY_PATH = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const TARGET_PAGE_PROJECTS = ['kidults-workspace-staging', 'kidults-enterprise'];
const SHA40 = /^[0-9a-f]{40}$/;
const ACCOUNT_ID = /^[0-9a-fA-F]{32}$/;

const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const runtimeSha = String(process.env.GITHUB_SHA || '');
const maximumRequests = Number(approval.max_cloudflare_get_requests || 0);
let requestCount = 0;
let receipt = {
  id: 'kidults-cloudflare-estate-inventory-receipt-v1',
  version: '1.0.0',
  state: 'PROVIDER_READ_PENDING',
  approval: {
    approval_id: approval.approval_id || null,
    comment_id: approval.comment_id || null,
    body_sha256: approval.approval_comment_body_sha256 || null,
    approved_protected_main_sha: approval.approved_protected_main_sha || null,
    authorization_consumed: approval.authorization_consumed === true,
    expires_at: approval.expires_at || null,
  },
  repository: process.env.GITHUB_REPOSITORY || null,
  source_ref: process.env.GITHUB_REF || null,
  source_sha: runtimeSha || null,
  workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
  workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  account_id_sha256: accountId ? `sha256:${crypto.createHash('sha256').update(accountId).digest('hex')}` : null,
  maximum_cloudflare_get_requests: maximumRequests || null,
  cloudflare_get_request_count: 0,
  provider_secret_resolution_started: true,
  raw_provider_responses_persisted: false,
  raw_provider_responses_uploaded: false,
  authorization_header_persisted: false,
  secret_values_logged: false,
  secret_values_persisted: false,
  worker_mutation_count: 0,
  pages_mutation_count: 0,
  route_mutation_count: 0,
  domain_mutation_count: 0,
  deployment_mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const writeReceipt = () => {
  const temporary = `${receiptPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {mode: 0o600});
  fs.renameSync(temporary, receiptPath);
};
const fail = (code, detail = null) => {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
};
const requireValue = (condition, code, detail = null) => {
  if (!condition) fail(code, detail);
};
const safeString = (value, max = 240) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length <= max ? text : text.slice(0, max);
};
const errorCodes = payload => Array.isArray(payload?.errors)
  ? payload.errors.map(error => Number(error?.code)).filter(Number.isInteger)
  : [];

writeReceipt();

async function getV4(pathname) {
  requestCount += 1;
  requireValue(requestCount <= maximumRequests, 'CLOUDFLARE_REQUEST_CEILING_EXCEEDED');
  receipt = {
    ...receipt,
    state: 'PROVIDER_READ_IN_PROGRESS',
    cloudflare_get_request_count: requestCount,
  };
  writeReceipt();

  let response;
  try {
    response = await fetch(`${API_ROOT}${pathname}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    fail('CLOUDFLARE_NETWORK_READ_FAILED');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    fail(`CLOUDFLARE_NON_JSON_HTTP_${response.status}`);
  }
  if (!response.ok || payload?.success !== true) {
    const codes = errorCodes(payload);
    fail(`CLOUDFLARE_API_READ_FAILED_HTTP_${response.status}`, codes.join(',') || null);
  }
  return payload;
}

function query(pathname, parameters) {
  const url = new URL(`${API_ROOT}${pathname}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return `${url.pathname}${url.search}`;
}

async function getCollection(pathname, {perPage = 100, maxPages = 10} = {}) {
  const values = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    requireValue(page <= maxPages, `CLOUDFLARE_PAGINATION_BOUND_EXCEEDED:${pathname}`);
    const payload = await getV4(query(pathname, {per_page: perPage, page}));
    requireValue(Array.isArray(payload.result), `CLOUDFLARE_COLLECTION_SHAPE_INVALID:${pathname}`);
    values.push(...payload.result);
    const reported = Number(payload?.result_info?.total_pages || 1);
    requireValue(Number.isInteger(reported) && reported >= 1 && reported <= maxPages, `CLOUDFLARE_TOTAL_PAGES_INVALID:${pathname}`);
    totalPages = reported;
  }
  return values;
}

function namesOf(value) {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}
const canonicalKeep = new Set(namesOf(policy.canonical_keep));
const temporaryStagingKeep = new Set(namesOf(policy.temporary_staging_keep));
const inspectBeforeDecision = new Set(namesOf(policy.inspect_before_decision));
const migrateThenRetire = new Set(namesOf(policy.migrate_then_retire));
const quarantineRetire = new Set(namesOf(policy.quarantine_retire_candidates));
const retiredConfirmed = new Set((policy.retired_confirmed || []).map(item => String(item?.name || '')));

function classifyName(name) {
  if (canonicalKeep.has(name)) return 'CANONICAL_KEEP';
  if (temporaryStagingKeep.has(name)) return 'TEMPORARY_STAGING_KEEP';
  if (inspectBeforeDecision.has(name)) return 'INSPECT_BEFORE_DECISION';
  if (migrateThenRetire.has(name)) return 'MIGRATE_THEN_RETIRE';
  if (quarantineRetire.has(name)) return 'QUARANTINE_RETIRE_CANDIDATE';
  if (retiredConfirmed.has(name)) return 'RETIRED_CONFIRMED_SHOULD_BE_ABSENT';
  return 'UNCLASSIFIED_REMOTE_RESOURCE';
}

function sanitizeWorker(item) {
  const name = safeString(item?.id || item?.name, 160);
  return {
    name,
    classification: classifyName(name),
    created_on: safeString(item?.created_on),
    modified_on: safeString(item?.modified_on),
    compatibility_date: safeString(item?.compatibility_date),
    usage_model: safeString(item?.usage_model),
    last_deployed_from: safeString(item?.last_deployed_from),
    logpush: typeof item?.logpush === 'boolean' ? item.logpush : null,
    has_assets: Boolean(item?.assets),
    has_tail_consumers: Array.isArray(item?.tail_consumers) ? item.tail_consumers.length > 0 : null,
  };
}

function sanitizeDomain(item) {
  return {
    id: safeString(item?.id, 100),
    hostname: safeString(item?.hostname, 253),
    service: safeString(item?.service, 160),
    service_classification: classifyName(safeString(item?.service, 160)),
    environment: safeString(item?.environment, 80),
    zone_name: safeString(item?.zone_name, 253),
    zone_id: safeString(item?.zone_id, 64),
  };
}

function repositoryOf(project) {
  const owner = safeString(project?.source?.config?.owner, 160);
  const repo = safeString(project?.source?.config?.repo_name, 160);
  return owner && repo ? `${owner}/${repo}` : null;
}
function sanitizeProject(project) {
  const name = safeString(project?.name, 160);
  return {
    name,
    classification: classifyName(name),
    id: safeString(project?.id, 160),
    subdomain: safeString(project?.subdomain, 253),
    domains: Array.isArray(project?.domains) ? project.domains.map(value => safeString(value, 253)).filter(Boolean).sort() : [],
    created_on: safeString(project?.created_on),
    production_branch: safeString(project?.production_branch, 160),
    source_type: safeString(project?.source?.type, 80),
    repository: repositoryOf(project),
    deployments_enabled_legacy: typeof project?.source?.config?.deployments_enabled === 'boolean'
      ? project.source.config.deployments_enabled : null,
    production_deployments_enabled: typeof project?.source?.config?.production_deployments_enabled === 'boolean'
      ? project.source.config.production_deployments_enabled : null,
    preview_deployment_setting: safeString(project?.source?.config?.preview_deployment_setting, 80),
    preview_branch_includes: Array.isArray(project?.source?.config?.preview_branch_includes)
      ? project.source.config.preview_branch_includes.map(value => safeString(value, 160)).filter(Boolean).sort() : [],
    preview_branch_excludes: Array.isArray(project?.source?.config?.preview_branch_excludes)
      ? project.source.config.preview_branch_excludes.map(value => safeString(value, 160)).filter(Boolean).sort() : [],
  };
}
function sanitizeDeployment(item) {
  return {
    id: safeString(item?.id, 100),
    environment: safeString(item?.environment, 40),
    url: safeString(item?.url, 500),
    aliases: Array.isArray(item?.aliases) ? item.aliases.map(value => safeString(value, 500)).filter(Boolean).sort() : [],
    created_on: safeString(item?.created_on),
    latest_stage_status: safeString(item?.latest_stage?.status, 80),
    trigger_type: safeString(item?.deployment_trigger?.type, 80),
    branch: safeString(item?.deployment_trigger?.metadata?.branch, 160),
    commit_hash: safeString(item?.deployment_trigger?.metadata?.commit_hash, 64),
    is_skipped: Boolean(item?.is_skipped),
    skip_reason: safeString(item?.skip_reason, 240),
    materialized: item?.is_skipped !== true && typeof item?.url === 'string' && item.url.length > 0,
  };
}

try {
  requireValue(approval.state === 'AUTHORIZATION_CONSUMED_EXTERNAL_READ_NOT_STARTED', 'APPROVAL_STATE_INVALID');
  requireValue(approval.authorization_consumed === true, 'APPROVAL_NOT_CONSUMED');
  requireValue(approval.unique_approval_comment_verified === true, 'APPROVAL_COMMENT_NOT_VERIFIED');
  requireValue(approval.live_main_verified_before_secret_resolution === true, 'PRE_SECRET_MAIN_NOT_VERIFIED');
  requireValue(approval.approved_protected_main_sha === runtimeSha && SHA40.test(runtimeSha), 'RUNTIME_MAIN_NOT_APPROVED_MAIN');
  requireValue(process.env.GITHUB_REF === 'refs/heads/main', 'RUNTIME_REF_NOT_MAIN');
  requireValue(Number(process.env.GITHUB_RUN_ATTEMPT || 0) === 1, 'RERUN_FORBIDDEN');
  requireValue(Number.isInteger(maximumRequests) && maximumRequests === 25, 'REQUEST_CEILING_INVALID');
  requireValue(ACCOUNT_ID.test(accountId), 'ACCOUNT_ID_SHAPE_INVALID');
  requireValue(apiToken.length > 0, 'API_TOKEN_MISSING');

  const tokenPayload = await getV4('/user/tokens/verify');
  const tokenActive = tokenPayload?.result?.status === 'active';
  requireValue(tokenActive, 'API_TOKEN_NOT_ACTIVE');

  const [workersRaw, domainsRaw, projectsRaw] = await Promise.all([
    getCollection('/accounts/' + accountId + '/workers/scripts', {perPage: 100, maxPages: 10}),
    getCollection('/accounts/' + accountId + '/workers/domains', {perPage: 100, maxPages: 10}),
    getCollection('/accounts/' + accountId + '/pages/projects', {perPage: 100, maxPages: 10}),
  ]);

  const workers = workersRaw.map(sanitizeWorker).filter(item => item.name).sort((a, b) => a.name.localeCompare(b.name));
  const domains = domainsRaw.map(sanitizeDomain).filter(item => item.id || item.hostname).sort((a, b) => String(a.hostname).localeCompare(String(b.hostname)));
  const pagesProjects = projectsRaw.map(sanitizeProject).filter(item => item.name).sort((a, b) => a.name.localeCompare(b.name));
  const projectDetails = {};

  for (const name of TARGET_PAGE_PROJECTS) {
    if (!pagesProjects.some(project => project.name === name)) {
      projectDetails[name] = {present: false, project: null, deployments: []};
      continue;
    }
    const detailPayload = await getV4('/accounts/' + accountId + '/pages/projects/' + encodeURIComponent(name));
    requireValue(detailPayload?.result && typeof detailPayload.result === 'object', `PAGES_PROJECT_DETAIL_SHAPE:${name}`);
    const deploymentsRaw = await getCollection(
      '/accounts/' + accountId + '/pages/projects/' + encodeURIComponent(name) + '/deployments',
      {perPage: 25, maxPages: 10},
    );
    projectDetails[name] = {
      present: true,
      project: sanitizeProject(detailPayload.result),
      deployments: deploymentsRaw.map(sanitizeDeployment).sort((a, b) => String(b.created_on).localeCompare(String(a.created_on))),
    };
  }

  const staging = projectDetails['kidults-workspace-staging'];
  const enterprise = projectDetails['kidults-enterprise'];
  const visiblePreviewDeployments = (staging?.deployments || []).filter(item => item.environment === 'preview' && item.materialized);
  const productionDeployments = (staging?.deployments || []).filter(item => item.environment === 'production' && item.materialized);
  const stagingProject = staging?.project;
  const stagingAutoDeployContained = Boolean(
    stagingProject
      && stagingProject.production_deployments_enabled === false
      && stagingProject.preview_deployment_setting === 'none'
      && stagingProject.preview_branch_includes.length === 0,
  );

  const classificationCounts = {};
  for (const item of [...workers, ...pagesProjects]) {
    classificationCounts[item.classification] = (classificationCounts[item.classification] || 0) + 1;
  }
  const presentNames = new Set([...workers.map(item => item.name), ...pagesProjects.map(item => item.name)]);
  const retiredReappeared = [...retiredConfirmed].filter(name => presentNames.has(name)).sort();
  const unclassified = [...workers, ...pagesProjects]
    .filter(item => item.classification === 'UNCLASSIFIED_REMOTE_RESOURCE')
    .map(item => item.name)
    .sort();

  receipt = {
    ...receipt,
    state: 'VERIFIED_PASS_CLOUDFLARE_ESTATE_INVENTORY',
    cloudflare_get_request_count: requestCount,
    token_active: true,
    workers: {
      count: workers.length,
      records: workers,
    },
    worker_custom_domains: {
      count: domains.length,
      records: domains,
    },
    pages: {
      project_count: pagesProjects.length,
      projects: pagesProjects,
      inspected_projects: projectDetails,
    },
    estate_classification: {
      counts: classificationCounts,
      retired_confirmed_but_remote_present: retiredReappeared,
      unclassified_remote_resources: unclassified,
      preserve_names: [...new Set([
        ...canonicalKeep,
        ...temporaryStagingKeep,
        ...(enterprise?.present ? ['kidults-enterprise'] : []),
      ])].sort(),
      inspect_before_decision_names: workers.filter(item => item.classification === 'INSPECT_BEFORE_DECISION').map(item => item.name),
      migrate_then_retire_names: [...workers, ...pagesProjects].filter(item => item.classification === 'MIGRATE_THEN_RETIRE').map(item => item.name).sort(),
      quarantine_retire_candidate_names: workers.filter(item => item.classification === 'QUARANTINE_RETIRE_CANDIDATE').map(item => item.name),
    },
    staging_pages_boundary: {
      project_present: Boolean(staging?.present),
      automatic_deployments_contained: stagingAutoDeployContained,
      visible_preview_deployment_count: visiblePreviewDeployments.length,
      visible_preview_deployment_ids: visiblePreviewDeployments.map(item => item.id).filter(Boolean),
      production_deployment_count: productionDeployments.length,
      production_deployment_ids_preserved: productionDeployments.map(item => item.id).filter(Boolean),
      configuration_mutation_required: Boolean(staging?.present) && !stagingAutoDeployContained,
      preview_cleanup_required: visiblePreviewDeployments.length > 0,
    },
    enterprise_cutover_boundary: {
      legacy_project_present: Boolean(enterprise?.present),
      deletion_allowed_now: false,
      custom_domain_cutover_authorized: false,
      required_before_delete: ['CANONICAL_STAGING_PROOF','EXPLICIT_G5_CUTOVER_APPROVAL','24H_OBSERVATION','72H_OBSERVATION'],
    },
    cleanup_authorization_required: true,
    cleanup_authorization_issue: 1809,
    raw_provider_responses_persisted: false,
    raw_provider_responses_uploaded: false,
    authorization_header_persisted: false,
    secret_values_logged: false,
    secret_values_persisted: false,
    worker_mutation_count: 0,
    pages_mutation_count: 0,
    route_mutation_count: 0,
    domain_mutation_count: 0,
    deployment_mutation_count: 0,
  };
  writeReceipt();
  console.log(JSON.stringify({
    state: receipt.state,
    cloudflare_get_request_count: requestCount,
    worker_count: workers.length,
    worker_custom_domain_count: domains.length,
    pages_project_count: pagesProjects.length,
    staging_auto_deploy_contained: stagingAutoDeployContained,
    staging_preview_deployment_count: visiblePreviewDeployments.length,
    retired_reappeared_count: retiredReappeared.length,
    unclassified_count: unclassified.length,
    mutation_count: 0,
    public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  receipt = {
    ...receipt,
    state: 'VERIFIED_FAIL_CLOUDFLARE_ESTATE_INVENTORY',
    cloudflare_get_request_count: requestCount,
    failure_code: safeString(error?.code || error?.message || 'UNKNOWN_INVENTORY_FAILURE', 180),
    failure_detail: error?.detail ? safeString(error.detail, 180) : null,
    raw_provider_responses_persisted: false,
    raw_provider_responses_uploaded: false,
    authorization_header_persisted: false,
    secret_values_logged: false,
    secret_values_persisted: false,
    worker_mutation_count: 0,
    pages_mutation_count: 0,
    route_mutation_count: 0,
    domain_mutation_count: 0,
    deployment_mutation_count: 0,
  };
  writeReceipt();
  throw error;
}
