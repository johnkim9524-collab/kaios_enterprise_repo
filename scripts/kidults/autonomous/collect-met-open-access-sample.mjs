import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CONTRACT_PATH = "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json";

const DEFAULTS = Object.freeze({
  apiBase: "https://collectionapi.metmuseum.org/public/collection/v1",
  departmentId: 8,
  query: "dress",
  limit: 12,
  minimumRecords: 8,
  maximumObjectRequests: 50,
  requestIntervalMs: 250,
  timeoutMs: 15_000,
  retryAttempts: 3,
  maximumObservationAgeHours: 168,
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
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("--limit must be an integer between 1 and 25.");
  }
  if (!Number.isInteger(config.minimumRecords) || config.minimumRecords < 1 || config.minimumRecords > config.limit) {
    throw new Error("--minimum-records must be between 1 and --limit.");
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

function strictUtc(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 3_600_000).toISOString();
}

function runtimeLineage() {
  return {
    git_sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null,
    github_run_id: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? Number(process.env.GITHUB_RUN_ID) : null,
    github_run_attempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? Number(process.env.GITHUB_RUN_ATTEMPT) : null
  };
}

function readContract() {
  const file = path.resolve(CONTRACT_PATH);
  const raw = fs.readFileSync(file, "utf8");
  const contract = JSON.parse(raw);
  if (contract.contract_id !== "met-costume-open-access-r1" ||
      contract.status !== "APPROVED_FOR_GOVERNED_SCHEDULED_REFERENCE_DISCOVERY" ||
      contract.admission_class !== "REFERENCE_DISCOVERY_ONLY" ||
      contract.current_sold_eligible !== false) {
    throw new Error("Met governed source contract is not activation-ready.");
  }
  return { contract, contractDigest: `sha256:${sha256(raw)}` };
}

export function buildLicenseProvenance(contract, contractDigest) {
  const provenance = contract.rights_provenance;
  if (!strictUtc(new Date(provenance?.reviewed_at ?? "").toISOString()) ||
      !Array.isArray(provenance?.official_policy_urls) ||
      provenance.official_policy_urls.length < 1 ||
      !provenance.official_policy_urls.every(value => /^https:\/\//.test(value))) {
    throw new Error("Met license provenance is incomplete.");
  }
  return {
    rights_state: "CC0_COLLECTION_METADATA",
    reviewed_at: new Date(provenance.reviewed_at).toISOString(),
    official_policy_urls: [...provenance.official_policy_urls],
    repository_contract_path: CONTRACT_PATH,
    repository_contract_sha256: contractDigest,
    allowed_scope: provenance.allowed_scope,
    excluded_scope: [...provenance.excluded_scope],
    unknown_rights_fail_closed: true
  };
}

function retryAfterMs(value, nowMs = Date.now()) {
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1_000;
  const dateMs = new Date(value).getTime();
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : 0;
}

export function retryDelayMs(response, attempt) {
  const exponential = 250 * (2 ** (attempt - 1));
  const serverDelay = retryAfterMs(response?.headers?.get?.("retry-after"));
  return Math.min(5_000, Math.max(exponential, serverDelay));
}

function ensureAllowedUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "collectionapi.metmuseum.org") {
    throw new Error(`Source URL is outside the approved allowlist: ${url}`);
  }
}

function requestErrorClass(error) {
  if (error?.name === "AbortError") return "TIMEOUT";
  if (/^HTTP \d{3}$/.test(error?.message ?? "")) return error.message.replace(" ", "_");
  if (error?.message === "REDIRECT_REJECTED") return "REDIRECT_REJECTED";
  if (/outside the approved allowlist/.test(error?.message ?? "")) return "REDIRECT_OR_URL_ALLOWLIST_REJECTED";
  if (error?.message === "MET_OBJECT_ID_MISMATCH") return "OBJECT_ID_MISMATCH";
  if (error?.message === "MET_OBJECT_DEPARTMENT_NOT_ALLOWED") return "OBJECT_DEPARTMENT_NOT_ALLOWED";
  if (error?.message === "MET_OBJECT_RESPONSE_SCHEMA_INVALID") return "OBJECT_RESPONSE_SCHEMA_INVALID";
  if (/_SCHEMA_INVALID$/.test(error?.message ?? "")) return "RESPONSE_SCHEMA_INVALID";
  if (error instanceof SyntaxError) return "RESPONSE_JSON_INVALID";
  return "NETWORK_OR_TRANSPORT_ERROR";
}

export async function requestJson(url, config, requestLog) {
  ensureAllowedUrl(url);
  let lastError = null;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();
    const requestStartedAt = new Date(startedAt).toISOString();
    const logEntry = {
      url,
      method: "GET",
      attempt,
      provider_call_attempted: true,
      status: null,
      requested_at: requestStartedAt,
      completed_at: null,
      duration_ms: null,
      response_sha256: null,
      response_headers: {
        date: null,
        etag: null,
        last_modified: null,
        content_type: null
      },
      error_class: null,
      response_accepted: null,
      retry_backoff_ms: null
    };
    requestLog.push(logEntry);
    try {
      const response = await (config.fetchImpl ?? fetch)(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "KIDULTS-Autonomous-Source-PoC/1.0 (+https://kidults.com)"
        },
        redirect: "error",
        signal: controller.signal
      });
      try {
        ensureAllowedUrl(response.url || url);
        if (response.redirected === true) throw new Error("REDIRECT_REJECTED");
      } catch (error) {
        error.retryable = false;
        throw error;
      }
      const text = await response.text();
      logEntry.status = response.status;
      logEntry.completed_at = new Date().toISOString();
      logEntry.duration_ms = Date.now() - startedAt;
      logEntry.response_sha256 = sha256(text);
      logEntry.response_headers = {
        date: response.headers.get("date"),
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
        content_type: response.headers.get("content-type")
      };
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        error.retryDelayMs = retryDelayMs(response, attempt);
        throw error;
      }
      try {
        return { payload: JSON.parse(text), rawText: text };
      } catch (error) {
        error.retryable = false;
        throw error;
      }
    } catch (error) {
      lastError = error;
      logEntry.completed_at ??= new Date().toISOString();
      logEntry.duration_ms ??= Date.now() - startedAt;
      logEntry.error_class = requestErrorClass(error);
      logEntry.response_accepted = false;
      const retryable = error?.retryable !== false;
      if (!retryable || attempt >= config.retryAttempts) break;
      const delayMs = Number.isFinite(error?.retryDelayMs)
        ? error.retryDelayMs
        : Math.min(5_000, 250 * (2 ** (attempt - 1)));
      logEntry.retry_backoff_ms = delayMs;
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Request failed: ${url}`);
}

function sanitizeRawRecord(record) {
  return {
    raw_payload_state: "SANITIZED_METADATA_ONLY",
    image_downloaded: false,
    metadata: {
      objectID: record.objectID ?? null,
      accessionNumber: record.accessionNumber ?? null,
      accessionYear: record.accessionYear ?? null,
      title: record.title ?? null,
      objectName: record.objectName ?? null,
      department: record.department ?? null,
      objectURL: record.objectURL ?? null,
      classification: record.classification ?? null,
      culture: record.culture ?? null,
      period: record.period ?? null,
      dynasty: record.dynasty ?? null,
      reign: record.reign ?? null,
      objectDate: record.objectDate ?? null,
      objectBeginDate: Number.isFinite(record.objectBeginDate) ? record.objectBeginDate : null,
      objectEndDate: Number.isFinite(record.objectEndDate) ? record.objectEndDate : null,
      artistDisplayName: record.artistDisplayName ?? null,
      artistRole: record.artistRole ?? null,
      medium: record.medium ?? null,
      dimensions: record.dimensions ?? null,
      country: record.country ?? null,
      region: record.region ?? null,
      city: record.city ?? null,
      creditLine: record.creditLine ?? null,
      isPublicDomain: record.isPublicDomain === true
    }
  };
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeRecord(record, fetchedAt, fullPayloadHash, licenseProvenance, maximumObservationAgeHours = 168) {
  const sourceObjectId = String(record.objectID ?? "");
  const evidenceReference = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${encodeURIComponent(sourceObjectId)}`;
  const criticalFields = {
    object_id: sourceObjectId,
    accession_number: record.accessionNumber || null,
    title: record.title || null,
    object_name: record.objectName || null,
    department: record.department || null,
    object_url: record.objectURL || null
  };
  const present = Object.values(criticalFields).filter(value => value !== null && value !== "").length;
  const isPublicDomain = record.isPublicDomain === true;
  const canonicalCandidateKey = [
    normalizeToken(record.artistDisplayName),
    normalizeToken(record.title || record.objectName),
    String(Math.floor((Number(record.objectBeginDate) || yearFromText(record.objectDate) || 0) / 10) * 10 || "unknown")
  ].join("|");

  return {
    evidence_id: `met:${sourceObjectId}`,
    evidence_class: "PRIMARY_AUTHORITY",
    vertical_id: "fashion-accessories",
    source_id: "met-costume-institute-open-access",
    source_tier: 1,
    source_layer: "OPEN_AUTHORITY",
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    candidate_r2_input_role: "REFERENCE_DISCOVERY_PREFLIGHT_ONLY",
    source_object_id: sourceObjectId,
    canonical_id_candidate: `met-object-${sourceObjectId}`,
    provider_id_is_canonical_id: false,
    canonical_candidate_key: canonicalCandidateKey,
    accession_number: record.accessionNumber || null,
    accession_year: record.accessionYear || null,
    title: record.title || null,
    object_name: record.objectName || null,
    classification: record.classification || null,
    culture: record.culture || null,
    period: record.period || null,
    dynasty: record.dynasty || null,
    reign: record.reign || null,
    object_date: record.objectDate || null,
    object_begin_date: Number.isFinite(record.objectBeginDate) ? record.objectBeginDate : null,
    object_end_date: Number.isFinite(record.objectEndDate) ? record.objectEndDate : null,
    maker_or_artist: record.artistDisplayName || null,
    maker_role: record.artistRole || null,
    medium: record.medium || null,
    dimensions: record.dimensions || null,
    department: record.department || null,
    country: record.country || null,
    region: record.region || null,
    city: record.city || null,
    credit_line: record.creditLine || null,
    is_public_domain: isPublicDomain,
    object_url: record.objectURL || null,
    metadata_rights_state: "CC0_COLLECTION_METADATA",
    image_rights_state: isPublicDomain ? "PUBLIC_DOMAIN_FLAG_TRUE_NOT_INGESTED" : "NOT_PUBLIC_DOMAIN_OR_UNAVAILABLE_NOT_INGESTED",
    image_state: "NOT_INGESTED",
    fetched_at: fetchedAt,
    observed_at: fetchedAt,
    observation_valid_until: addHours(fetchedAt, maximumObservationAgeHours),
    evidence_reference: evidenceReference,
    source_url: evidenceReference,
    source_payload_sha256: fullPayloadHash,
    license_provenance: structuredClone(licenseProvenance),
    critical_field_completeness: Number((present / Object.keys(criticalFields).length).toFixed(4)),
    publication_state: "POC_INTERNAL_ONLY"
  };
}

function yearFromText(value) {
  const match = String(value ?? "").match(/\b(1\d{3}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeProviderReadFailure(outputDirectory, config, contractDigest, licenseProvenance, startedAt, requestLog, error) {
  const completedAt = new Date().toISOString();
  const errorClass = requestErrorClass(error);
  const runManifest = {
    run_id: `met-costume-open-access-provider-failure-${completedAt.replace(/[:.]/g, "-")}`,
    contract_id: "met-costume-open-access-r1",
    version: "1.4.0",
    status: "FAILED_PROVIDER_READ",
    outcome_class: "FAIL_CLOSED_PROVIDER_READ_FAILURE",
    started_at: startedAt,
    completed_at: completedAt,
    mode: "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY",
    source_id: "met-costume-institute-open-access",
    source_tier: 1,
    source_layer: "OPEN_AUTHORITY",
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    vertical_id: "fashion-accessories",
    query: config.query,
    department_id: config.departmentId,
    request_budget: config.maximumObjectRequests + 1,
    request_budget_basis: "LOGICAL_REQUESTS",
    logical_request_budget: config.maximumObjectRequests + 1,
    maximum_http_attempts_per_logical_request: config.retryAttempts,
    http_attempt_budget: (config.maximumObjectRequests + 1) * config.retryAttempts,
    requests_executed: requestLog.length,
    provider_call_count: requestLog.length,
    normalized_records: 0,
    failed_object_requests: 0,
    failure_stage: "SEARCH",
    failure_class: errorClass,
    runtime_lineage: runtimeLineage(),
    license_provenance: licenseProvenance,
    rights_model: { metadata: "CC0_COLLECTION_METADATA", images: "NOT_INGESTED" },
    credential_used: false,
    paid_access_used: false,
    image_downloaded: false,
    mutation_performed: false,
    data_admission_performed: false,
    current_sold_transaction_count: 0,
    immutable_candidate_evidence_pair_created: false,
    track_b_submission_count: 0,
    track_b_assessment_count: 0,
    production_eligible: false,
    candidate_publication_authorized: false,
    request_log: requestLog,
    failures: [{ stage: "SEARCH", error_class: errorClass }]
  };
  const blockers = [
    `MET_PROVIDER_READ_${errorClass}`,
    "NO_REFERENCE_DISCOVERY_RECORDS_ACCEPTED",
    "CANDIDATE_R2_NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED"
  ];
  const evidencePackage = {
    evidence_package_id: null,
    version: "1.4.0",
    status: "PROVIDER_READ_FAILED_NOT_EVIDENCE_NOT_CANDIDATE",
    generated_at: completedAt,
    snapshot_id: null,
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    license_provenance: licenseProvenance,
    source_ids: ["met-costume-institute-open-access"],
    record_count: 0,
    records: [],
    known_limitations: blockers,
    production_eligible: false
  };
  const qualityReport = {
    run_id: runManifest.run_id,
    unique_record_count: 0,
    duplicate_record_count: 0,
    public_domain_record_count: 0,
    non_public_domain_or_unavailable_count: 0,
    average_critical_field_completeness: 0,
    provenance_reference_coverage: 0,
    metadata_rights_state: "CC0_COLLECTION_METADATA",
    image_ingestion_count: 0,
    minimum_record_gate: "FAIL_PROVIDER_READ",
    candidate_eligible: false,
    zero_candidate_terminal: false,
    current_sold_transaction_count: 0,
    candidate_blockers: blockers
  };
  writeJson(outputDirectory, "run-manifest.json", runManifest);
  writeJson(outputDirectory, "sanitized-raw-records.json", []);
  writeJson(outputDirectory, "normalized-evidence-records.json", []);
  writeJson(outputDirectory, "evidence-package.json", evidencePackage);
  writeJson(outputDirectory, "quality-report.json", qualityReport);
  return runManifest;
}

export function validateMetSearchPayload(payload) {
  const documentedEmpty = payload?.total === 0 && (payload?.objectIDs === null ||
    (Array.isArray(payload?.objectIDs) && payload.objectIDs.length === 0));
  const populated = Number.isInteger(payload?.total) && payload.total > 0 &&
    Array.isArray(payload?.objectIDs) && payload.objectIDs.every(Number.isInteger) &&
    payload.total === payload.objectIDs.length;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || (!documentedEmpty && !populated)) {
    throw new Error("MET_SEARCH_RESPONSE_SCHEMA_INVALID");
  }
  return true;
}

export function validateMetObjectPayload(payload, requestedObjectId) {
  const requiredStrings = [payload?.accessionNumber, payload?.title, payload?.objectName, payload?.objectURL];
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !Number.isInteger(requestedObjectId) || requestedObjectId <= 0 ||
      !Number.isInteger(payload.objectID) || payload.objectID <= 0 ||
      typeof payload.isPublicDomain !== "boolean" ||
      !requiredStrings.every(value => typeof value === "string" && value.trim().length > 0)) {
    throw new Error("MET_OBJECT_RESPONSE_SCHEMA_INVALID");
  }
  if (payload.objectID !== requestedObjectId) throw new Error("MET_OBJECT_ID_MISMATCH");
  if (payload.department !== "The Costume Institute") throw new Error("MET_OBJECT_DEPARTMENT_NOT_ALLOWED");
  let objectUrl;
  try {
    objectUrl = new URL(payload.objectURL);
  } catch {
    throw new Error("MET_OBJECT_RESPONSE_SCHEMA_INVALID");
  }
  if (objectUrl.protocol !== "https:" || objectUrl.hostname !== "www.metmuseum.org") {
    throw new Error("MET_OBJECT_RESPONSE_SCHEMA_INVALID");
  }
  return true;
}

export async function runMetCollection(config = parseArgs(process.argv.slice(2))) {
const outputDirectory = path.resolve(config.output);
const requestLog = [];
const failures = [];
const startedAt = new Date().toISOString();
const { contract, contractDigest } = readContract();
config.maximumObservationAgeHours = Number(contract.bounded_limits.maximum_observation_age_hours);
const licenseProvenance = buildLicenseProvenance(contract, contractDigest);

const searchUrl = new URL(`${config.apiBase}/search`);
searchUrl.searchParams.set("departmentId", String(config.departmentId));
searchUrl.searchParams.set("q", config.query);

let searchResponse;
try {
  searchResponse = await requestJson(searchUrl.href, config, requestLog);
  validateMetSearchPayload(searchResponse.payload);
  requestLog.at(-1).response_accepted = true;
} catch (error) {
  const searchLog = requestLog.at(-1);
  if (searchLog && searchLog.response_accepted === null) {
    searchLog.response_accepted = false;
    searchLog.error_class = requestErrorClass(error);
  }
  const runManifest = writeProviderReadFailure(
    outputDirectory,
    config,
    contractDigest,
    licenseProvenance,
    startedAt,
    requestLog,
    error
  );
  console.log(JSON.stringify({
    status: runManifest.status,
    provider_call_count: runManifest.provider_call_count,
    failure_class: runManifest.failure_class,
    output: config.output
  }));
  return { runManifest, exitCode: 2 };
}
const objectIds = [...new Set(searchResponse.payload.objectIDs ?? [])]
  .filter(Number.isInteger)
  .sort((left, right) => left - right)
  .slice(0, config.maximumObjectRequests);

const sanitizedRawRecords = [];
const normalizedRecords = [];

for (const objectId of objectIds) {
  if (normalizedRecords.length >= config.limit) break;
  await sleep(config.requestIntervalMs);
  const objectUrl = `${config.apiBase}/objects/${objectId}`;
  try {
    const response = await requestJson(objectUrl, config, requestLog);
    const record = response.payload;
    validateMetObjectPayload(record, objectId);
    requestLog.at(-1).response_accepted = true;
    const departmentLabel = record.department;

    const fetchedAt = new Date().toISOString();
    const payloadHash = sha256(stableJson(record));
    sanitizedRawRecords.push({
      source_object_id: String(objectId),
      fetched_at: fetchedAt,
      source_payload_sha256: payloadHash,
      source_url: objectUrl,
      license_contract_sha256: contractDigest,
      search_department_id: config.departmentId,
      source_department_label: departmentLabel || null,
      ...sanitizeRawRecord(record)
    });
    normalizedRecords.push(normalizeRecord(record, fetchedAt, payloadHash, licenseProvenance, config.maximumObservationAgeHours));
  } catch (error) {
    const objectLog = requestLog.at(-1);
    if (objectLog?.url === objectUrl && objectLog.response_accepted === null) {
      objectLog.response_accepted = false;
      objectLog.error_class = requestErrorClass(error);
    }
    failures.push({ requested_object_id: objectId, error_class: requestErrorClass(error) });
  }
}

const uniqueIds = new Set(normalizedRecords.map(record => record.source_object_id));
const averageCompleteness = normalizedRecords.length
  ? normalizedRecords.reduce((sum, record) => sum + record.critical_field_completeness, 0) / normalizedRecords.length
  : 0;
const completedAt = new Date().toISOString();
const minimumGatePassed = normalizedRecords.length >= config.minimumRecords;
const zeroCandidateTerminal = normalizedRecords.length === 0 && failures.length === 0 &&
  requestLog.length > 0 && requestLog.every(item => item.status >= 200 && item.status < 300);

const runManifest = {
  run_id: `met-costume-open-access-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "met-costume-open-access-r1",
  version: "1.3.0",
  status: minimumGatePassed ? "COMPLETED" : zeroCandidateTerminal ? "TERMINAL_ZERO_CANDIDATE" : "FAILED_MINIMUM_RECORD_GATE",
  outcome_class: minimumGatePassed ? "REFERENCE_DISCOVERY_SUCCESS" : zeroCandidateTerminal ? "ZERO_CANDIDATE_TERMINAL" : "FAIL_CLOSED_INSUFFICIENT_RECORDS",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY",
  source_id: "met-costume-institute-open-access",
  source_tier: 1,
  source_layer: "OPEN_AUTHORITY",
  evidence_role: "REFERENCE_DISCOVERY",
  market_observation_type: "NONE",
  current_sold_eligible: false,
  vertical_id: "fashion-accessories",
  query: config.query,
  department_id: config.departmentId,
  search_result_count: Number(searchResponse.payload?.total ?? objectIds.length),
  request_budget: config.maximumObjectRequests + 1,
  request_budget_basis: "LOGICAL_REQUESTS",
  logical_request_budget: config.maximumObjectRequests + 1,
  maximum_http_attempts_per_logical_request: config.retryAttempts,
  http_attempt_budget: (config.maximumObjectRequests + 1) * config.retryAttempts,
  requests_executed: requestLog.length,
  provider_call_count: requestLog.length,
  retry_attempts: config.retryAttempts,
  target_records: config.limit,
  minimum_records: config.minimumRecords,
  normalized_records: normalizedRecords.length,
  failed_object_requests: failures.length,
  source_observation_window: {
    observed_from: normalizedRecords.at(0)?.observed_at ?? startedAt,
    observed_through: normalizedRecords.at(-1)?.observed_at ?? completedAt,
    maximum_age_hours: config.maximumObservationAgeHours
  },
  runtime_lineage: runtimeLineage(),
  license_provenance: licenseProvenance,
  rights_model: {
    metadata: "CC0_COLLECTION_METADATA",
    images: "NOT_INGESTED; OBJECT_PUBLIC_DOMAIN_FLAG_RETAINED_AS_METADATA_ONLY"
  },
  credential_used: false,
  paid_access_used: false,
  image_downloaded: false,
  mutation_performed: false,
  data_admission_performed: false,
  current_sold_transaction_count: 0,
  immutable_candidate_evidence_pair_created: false,
  track_b_submission_count: 0,
  track_b_assessment_count: 0,
  production_eligible: false,
  candidate_publication_authorized: false,
  request_log: requestLog,
  failures
};

const qualityReport = {
  run_id: runManifest.run_id,
  unique_record_count: uniqueIds.size,
  duplicate_record_count: normalizedRecords.length - uniqueIds.size,
  public_domain_record_count: normalizedRecords.filter(record => record.is_public_domain).length,
  non_public_domain_or_unavailable_count: normalizedRecords.filter(record => !record.is_public_domain).length,
  average_critical_field_completeness: Number(averageCompleteness.toFixed(4)),
  provenance_reference_coverage: normalizedRecords.length
    ? normalizedRecords.filter(record => Boolean(record.evidence_reference)).length / normalizedRecords.length
    : 0,
  metadata_rights_state: "CC0_COLLECTION_METADATA",
  image_ingestion_count: 0,
  minimum_record_gate: minimumGatePassed ? "PASS" : zeroCandidateTerminal ? "TERMINAL_ZERO_CANDIDATE" : "FAIL",
  candidate_eligible: false,
  zero_candidate_terminal: zeroCandidateTerminal,
  current_sold_transaction_count: 0,
  candidate_blockers: [
    "Public catalog metadata is REFERENCE/DISCOVERY and not Current-SOLD evidence.",
    "Single-source sample does not satisfy independent source-family diversity.",
    "Source Trust and Evidence Density methodologies remain pending Track B validation.",
    "No immutable Track A Evidence Package or Candidate Snapshot has been registered."
  ]
};

const evidencePackage = {
  evidence_package_id: `evidence-${runManifest.run_id}`,
  version: "1.3.0",
  status: minimumGatePassed || zeroCandidateTerminal
    ? "POC_EVIDENCE_NOT_CANDIDATE"
    : "INSUFFICIENT_RECORDS_NOT_EVIDENCE_NOT_CANDIDATE",
  generated_at: completedAt,
  snapshot_id: null,
  methodology_version: "source-trust-methodology-v1",
  evidence_lineage_version: "met-costume-open-access-lineage-r1",
  source_mode: "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY",
  evidence_role: "REFERENCE_DISCOVERY",
  market_observation_type: "NONE",
  current_sold_eligible: false,
  license_provenance: licenseProvenance,
  source_ids: ["met-costume-institute-open-access"],
  record_count: normalizedRecords.length,
  records: normalizedRecords,
  known_limitations: qualityReport.candidate_blockers,
  production_eligible: false
};

writeJson(outputDirectory, "run-manifest.json", runManifest);
writeJson(outputDirectory, "sanitized-raw-records.json", sanitizedRawRecords);
writeJson(outputDirectory, "normalized-evidence-records.json", normalizedRecords);
writeJson(outputDirectory, "evidence-package.json", evidencePackage);
writeJson(outputDirectory, "quality-report.json", qualityReport);

console.log(JSON.stringify({
  status: runManifest.status,
  run_id: runManifest.run_id,
  normalized_records: normalizedRecords.length,
  public_domain_records: qualityReport.public_domain_record_count,
  average_completeness: qualityReport.average_critical_field_completeness,
  output: config.output
}));

return { runManifest, exitCode: minimumGatePassed || zeroCandidateTerminal ? 0 : 2 };
}

async function main() {
  const result = await runMetCollection(parseArgs(process.argv.slice(2)));
  if (result.exitCode) process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
