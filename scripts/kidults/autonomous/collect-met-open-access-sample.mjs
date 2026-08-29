import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const CONTRACT_PATH = "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json";
const SOURCE_ID = "met-costume-institute-open-access";
const ALLOWED_API_HOST = "collectionapi.metmuseum.org";
const ALLOWED_OBJECT_HOST = "www.metmuseum.org";

const DEFAULTS = Object.freeze({
  apiBase: "https://collectionapi.metmuseum.org/public/collection/v1",
  departmentId: 8,
  query: "dress",
  limit: 12,
  minimumRecords: 8,
  maximumObjectRequests: 50,
  maximumLogicalRequests: 51,
  maximumHttpAttempts: 153,
  requestIntervalMs: 250,
  timeoutMs: 15_000,
  retryAttempts: 3,
  maximumRetryAfterMs: 5_000,
  maximumObservationAgeHours: 168,
  preflightFailureReason: null,
  output: "artifacts/autonomous-source-samples/met-costume-open-access-r1"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = argv[++index];
    else if (argument === "--query") config.query = argv[++index];
    else if (argument === "--limit") config.limit = Number(argv[++index]);
    else if (argument === "--minimum-records") config.minimumRecords = Number(argv[++index]);
    else if (argument === "--preflight-failure") config.preflightFailureReason = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("--limit must be an integer between 1 and 25.");
  }
  if (!Number.isInteger(config.minimumRecords) || config.minimumRecords < 1 || config.minimumRecords > config.limit) {
    throw new Error("--minimum-records must be between 1 and --limit.");
  }
  if (config.preflightFailureReason !== null && !/^[A-Z0-9_]{1,80}$/.test(config.preflightFailureReason)) {
    throw new Error("--preflight-failure must be an uppercase bounded reason code.");
  }
  return config;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 3_600_000).toISOString();
}

export function runtimeLineage() {
  return {
    git_sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null,
    github_run_id: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? Number(process.env.GITHUB_RUN_ID) : null,
    github_run_attempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? Number(process.env.GITHUB_RUN_ATTEMPT) : null
  };
}

export function readContract() {
  const raw = fs.readFileSync(path.resolve(CONTRACT_PATH), "utf8");
  const contract = JSON.parse(raw);
  const limits = contract.bounded_limits ?? {};
  if (contract.contract_id !== "met-costume-open-access-r1" ||
      contract.status !== "APPROVED_FOR_GOVERNED_SCHEDULED_REFERENCE_DISCOVERY" ||
      contract.admission_class !== "REFERENCE_DISCOVERY_ONLY" ||
      contract.market_evidence_class !== "NONE" ||
      contract.current_sold_eligible !== false ||
      contract.credential_required !== false ||
      contract.cost_exposure_usd !== 0 ||
      limits.maximum_logical_requests_per_run !== 51 ||
      limits.maximum_http_attempts_per_run !== 153) {
    throw new Error("MET_GOVERNED_REFERENCE_CONTRACT_INVALID");
  }
  return { contract, digest: `sha256:${sha256(raw)}` };
}

function ensureAllowedApiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_API_HOST) {
    throw new Error("MET_API_URL_NOT_ALLOWLISTED");
  }
  return url;
}

function retryAfterMs(value, nowMs = Date.now()) {
  if (!value) return 0;
  if (/^\d+$/.test(String(value).trim())) return Number(value) * 1_000;
  const dateMs = new Date(value).getTime();
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : 0;
}

export function retryDelayMs(response, attempt, maximum = 5_000) {
  const exponential = 250 * (2 ** (attempt - 1));
  const server = retryAfterMs(response?.headers?.get?.("retry-after"));
  return Math.min(maximum, Math.max(exponential, server));
}

function errorClass(error) {
  if (error?.name === "AbortError") return "TIMEOUT";
  if (/^HTTP_\d{3}$/.test(error?.message ?? "")) return error.message;
  return String(error?.message ?? "NETWORK_OR_TRANSPORT_ERROR").replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
}

export function validateSearchPayload(payload) {
  const ids = payload?.objectIDs;
  const total = payload?.total;
  if (!Number.isInteger(total) || total < 0 ||
      !(ids === null || Array.isArray(ids)) ||
      (total > 0 && !Array.isArray(ids)) ||
      (Array.isArray(ids) && !ids.every(id => Number.isInteger(id) && id > 0))) {
    throw new Error("MET_SEARCH_RESPONSE_SCHEMA_INVALID");
  }
  return true;
}

export function validateObjectPayload(payload, requestedObjectId) {
  if (!payload || typeof payload !== "object" || !Number.isInteger(payload.objectID) ||
      typeof payload.objectURL !== "string" || typeof payload.isPublicDomain !== "boolean") {
    throw new Error("MET_OBJECT_RESPONSE_SCHEMA_INVALID");
  }
  if (payload.objectID !== requestedObjectId) throw new Error("MET_OBJECT_ID_MISMATCH");
  if (payload.department !== "The Costume Institute") throw new Error("MET_OBJECT_DEPARTMENT_NOT_ALLOWED");
  const objectUrl = new URL(payload.objectURL);
  if (objectUrl.protocol !== "https:" || objectUrl.hostname !== ALLOWED_OBJECT_HOST) {
    throw new Error("MET_OBJECT_URL_NOT_ALLOWLISTED");
  }
  return true;
}

export async function requestJson(url, config, ledger, validatePayload) {
  ensureAllowedApiUrl(url);
  ledger.logical_requests += 1;
  if (ledger.logical_requests > config.maximumLogicalRequests) throw new Error("MET_LOGICAL_REQUEST_BUDGET_EXCEEDED");
  let lastError = null;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    ledger.http_attempts += 1;
    if (ledger.http_attempts > config.maximumHttpAttempts) throw new Error("MET_HTTP_ATTEMPT_BUDGET_EXCEEDED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const started = Date.now();
    const entry = {
      url,
      final_url: null,
      method: "GET",
      attempt,
      provider_call_attempted: true,
      requested_at: new Date(started).toISOString(),
      completed_at: null,
      status: null,
      duration_ms: null,
      response_sha256: null,
      response_accepted: false,
      error_class: null,
      retry_backoff_ms: null
    };
    ledger.request_log.push(entry);

    try {
      const response = await (config.fetchImpl ?? fetch)(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "KIDULTS-Met-Reference-Discovery/1.0" },
        redirect: "error",
        signal: controller.signal
      });
      entry.final_url = response.url || url;
      ensureAllowedApiUrl(entry.final_url);
      if (response.redirected === true) throw new Error("MET_REDIRECT_REJECTED");
      const body = await response.text();
      entry.status = response.status;
      entry.response_sha256 = sha256(body);
      if (!response.ok) {
        const error = new Error(`HTTP_${response.status}`);
        error.retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        error.delay = retryDelayMs(response, attempt, config.maximumRetryAfterMs);
        throw error;
      }
      const payload = JSON.parse(body);
      validatePayload(payload);
      entry.response_accepted = true;
      return { payload, rawText: body };
    } catch (error) {
      lastError = error;
      entry.error_class = errorClass(error);
      const retryable = error?.retryable !== false &&
        !["MET_API_URL_NOT_ALLOWLISTED", "MET_REDIRECT_REJECTED", "MET_SEARCH_RESPONSE_SCHEMA_INVALID",
          "MET_OBJECT_RESPONSE_SCHEMA_INVALID", "MET_OBJECT_ID_MISMATCH", "MET_OBJECT_DEPARTMENT_NOT_ALLOWED",
          "MET_OBJECT_URL_NOT_ALLOWLISTED"].includes(error?.message);
      if (!retryable || attempt >= config.retryAttempts) break;
      entry.retry_backoff_ms = Number.isFinite(error?.delay)
        ? error.delay
        : Math.min(config.maximumRetryAfterMs, 250 * (2 ** (attempt - 1)));
      await sleep(entry.retry_backoff_ms);
    } finally {
      clearTimeout(timeout);
      entry.completed_at = new Date().toISOString();
      entry.duration_ms = Date.now() - started;
    }
  }
  throw lastError ?? new Error("MET_PROVIDER_READ_FAILED");
}

function sanitizeRawRecord(record) {
  const allowed = ["objectID", "accessionNumber", "accessionYear", "title", "objectName", "department",
    "objectURL", "classification", "culture", "period", "dynasty", "reign", "objectDate", "objectBeginDate",
    "objectEndDate", "artistDisplayName", "artistRole", "medium", "dimensions", "country", "region", "city",
    "creditLine", "isPublicDomain"];
  return {
    raw_payload_state: "SANITIZED_METADATA_ONLY",
    image_downloaded: false,
    metadata: Object.fromEntries(allowed.map(key => [key, record[key] ?? null]))
  };
}

export function normalizeRecord(record, observedAt, payloadHash, contractDigest, maximumAgeHours) {
  const sourceObjectId = String(record.objectID);
  return {
    reference_record_id: `met:${sourceObjectId}`,
    source_id: SOURCE_ID,
    source_family: "THE_MET",
    source_object_id: sourceObjectId,
    reference_role: "REFERENCE_DISCOVERY",
    admission_state: "REFERENCE_ONLY_NOT_CANONICAL_EVIDENCE",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    title: record.title || null,
    object_name: record.objectName || null,
    accession_number: record.accessionNumber || null,
    department: record.department,
    object_url: record.objectURL,
    is_public_domain: record.isPublicDomain,
    metadata_rights_state: "CC0_COLLECTION_METADATA",
    image_state: "NOT_INGESTED",
    observed_at: observedAt,
    observation_valid_until: addHours(observedAt, maximumAgeHours),
    provenance_reference: `https://${ALLOWED_API_HOST}/public/collection/v1/objects/${sourceObjectId}`,
    source_payload_sha256: payloadHash,
    rights_contract_sha256: contractDigest,
    publication_state: "INTERNAL_REFERENCE_ONLY"
  };
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runMetCollection(overrides = {}) {
  const config = { ...DEFAULTS, ...overrides };
  const output = path.resolve(config.output);
  const startedAt = new Date().toISOString();
  const lineage = runtimeLineage();
  const ledger = { logical_requests: 0, http_attempts: 0, request_log: [] };
  const failures = [];
  const rawRecords = [];
  const records = [];
  let contractDigest = null;
  let searchResultCount = 0;
  let terminalState = "FAILED_REFERENCE_DISCOVERY";
  let terminalReason = "UNINITIALIZED";

  try {
    const { contract, digest } = readContract();
    contractDigest = digest;
    const limits = contract.bounded_limits;
    config.maximumObjectRequests = limits.maximum_object_requests;
    config.maximumLogicalRequests = limits.maximum_logical_requests_per_run;
    config.maximumHttpAttempts = limits.maximum_http_attempts_per_run;
    config.retryAttempts = limits.maximum_http_attempts_per_logical_request;
    config.requestIntervalMs = limits.minimum_request_interval_ms;
    config.timeoutMs = limits.request_timeout_ms;
    config.maximumRetryAfterMs = limits.maximum_retry_after_ms;
    config.maximumObservationAgeHours = limits.maximum_observation_age_hours;

    if (config.preflightFailureReason) throw new Error(config.preflightFailureReason);

    const searchUrl = new URL(`${config.apiBase}/search`);
    searchUrl.searchParams.set("departmentId", String(config.departmentId));
    searchUrl.searchParams.set("q", config.query);
    const search = await requestJson(searchUrl.href, config, ledger, validateSearchPayload);
    searchResultCount = search.payload.total;
    const objectIds = [...new Set(search.payload.objectIDs ?? [])]
      .sort((left, right) => left - right)
      .slice(0, config.maximumObjectRequests);

    if (objectIds.length === 0) {
      terminalState = "TERMINAL_ZERO_REFERENCE_DISCOVERY";
      terminalReason = "SOURCE_RETURNED_ZERO_OBJECT_IDS";
    } else {
      for (const objectId of objectIds) {
        if (records.length >= config.limit) break;
        await sleep(config.requestIntervalMs);
        const objectUrl = `${config.apiBase}/objects/${objectId}`;
        try {
          const response = await requestJson(objectUrl, config, ledger, payload => validateObjectPayload(payload, objectId));
          const observedAt = new Date().toISOString();
          const payloadHash = sha256(stableJson(response.payload));
          rawRecords.push({
            source_object_id: String(objectId),
            observed_at: observedAt,
            source_payload_sha256: payloadHash,
            source_url: objectUrl,
            ...sanitizeRawRecord(response.payload)
          });
          records.push(normalizeRecord(response.payload, observedAt, payloadHash, contractDigest,
            config.maximumObservationAgeHours));
        } catch (error) {
          failures.push({ requested_object_id: objectId, error_class: errorClass(error) });
        }
      }
      if (records.length >= config.minimumRecords) {
        terminalState = "COMPLETED_REFERENCE_DISCOVERY";
        terminalReason = "BOUNDED_REFERENCE_RECORD_FLOOR_MET";
      } else {
        terminalReason = "MINIMUM_REFERENCE_RECORD_GATE_NOT_MET";
      }
    }
  } catch (error) {
    terminalReason = errorClass(error);
  }

  const completedAt = new Date().toISOString();
  const runId = lineage.github_run_id
    ? `met-reference-${lineage.github_run_id}-${lineage.github_run_attempt}`
    : `met-reference-${completedAt.replace(/[:.]/g, "-")}`;
  const claimCeiling = {
    reference_discovery_only: true,
    current_sold_observations: 0,
    canonical_candidate: "NONE",
    canonical_evidence: "NONE",
    immutable_candidate_evidence_pair_created: false,
    track_b: "NOT_STARTED",
    approved_projection: "NONE",
    public: "HOLD",
    production: "HOLD",
    g5: "HOLD"
  };
  const manifest = {
    run_id: runId,
    contract_id: "met-costume-open-access-r1",
    contract_sha256: contractDigest,
    status: terminalState,
    terminal_reason: terminalReason,
    started_at: startedAt,
    completed_at: completedAt,
    mode: "GOVERNED_LIVE_REFERENCE_DISCOVERY",
    source_id: SOURCE_ID,
    query: config.query,
    department_id: config.departmentId,
    runtime_lineage: lineage,
    search_result_count: searchResultCount,
    target_records: config.limit,
    minimum_records: config.minimumRecords,
    normalized_records: records.length,
    failed_object_requests: failures.length,
    provider_call_count: ledger.logical_requests,
    http_attempt_count: ledger.http_attempts,
    maximum_logical_requests: config.maximumLogicalRequests,
    maximum_http_attempts: config.maximumHttpAttempts,
    credential_used: false,
    cost_exposure_usd: 0,
    image_download_count: 0,
    provider_mutation_count: 0,
    request_log: ledger.request_log,
    failures,
    claim_ceiling: claimCeiling
  };
  const quality = {
    run_id: runId,
    dynamic_record_count: records.length,
    duplicate_record_count: records.length - new Set(records.map(record => record.source_object_id)).size,
    rights_contract_sha256: contractDigest,
    image_ingestion_count: 0,
    current_sold_observation_count: 0,
    candidate_eligible: false
  };
  const outputEnvelope = {
    output_id: `reference-${runId}`,
    status: "REFERENCE_DISCOVERY_OUTPUT_NOT_CANONICAL_EVIDENCE",
    snapshot_id: null,
    canonical_evidence_state: "NONE",
    record_count: records.length,
    records,
    claim_ceiling: claimCeiling
  };
  const terminalReceipt = {
    receipt_id: `met-reference-terminal-${runId}`,
    terminal_receipt_count: 1,
    status: terminalState,
    terminal_reason: terminalReason,
    completed_at: completedAt,
    source_id: SOURCE_ID,
    runtime_lineage: lineage,
    contract_sha256: contractDigest,
    provider_call_count: ledger.logical_requests,
    http_attempt_count: ledger.http_attempts,
    normalized_record_count: records.length,
    claim_ceiling: claimCeiling
  };

  writeJson(output, "run-manifest.json", manifest);
  writeJson(output, "sanitized-raw-records.json", rawRecords);
  writeJson(output, "normalized-evidence-records.json", records);
  writeJson(output, "evidence-package.json", outputEnvelope);
  writeJson(output, "quality-report.json", quality);
  writeJson(output, "terminal-receipt.json", terminalReceipt);

  return { runManifest: manifest, exitCode: terminalState === "FAILED_REFERENCE_DISCOVERY" ? 2 : 0 };
}

async function main() {
  const result = await runMetCollection(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    status: result.runManifest.status,
    normalized_records: result.runManifest.normalized_records,
    provider_call_count: result.runManifest.provider_call_count,
    current_sold_observations: 0,
    candidate: "NONE",
    evidence: "NONE",
    track_b: "NOT_STARTED"
  }));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
