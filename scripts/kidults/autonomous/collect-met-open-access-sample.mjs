import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

function sha256(value) {
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

function ensureAllowedUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "collectionapi.metmuseum.org") {
    throw new Error(`Source URL is outside the approved allowlist: ${url}`);
  }
}

async function requestJson(url, config, requestLog) {
  ensureAllowedUrl(url);
  let lastError = null;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "KIDULTS-Autonomous-Source-PoC/1.0 (+https://kidults.com)"
        },
        signal: controller.signal
      });
      const text = await response.text();
      requestLog.push({
        url,
        method: "GET",
        attempt,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        response_sha256: sha256(text)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { payload: JSON.parse(text), rawText: text };
    } catch (error) {
      lastError = error;
      if (attempt < config.retryAttempts) await sleep(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Request failed: ${url}`);
}

function sanitizeRawRecord(record) {
  const {
    primaryImage: _primaryImage,
    primaryImageSmall: _primaryImageSmall,
    additionalImages: _additionalImages,
    ...metadataOnly
  } = record;
  return {
    raw_payload_state: "SANITIZED_METADATA_ONLY",
    image_downloaded: false,
    metadata: metadataOnly
  };
}

function normalizeRecord(record, fetchedAt, fullPayloadHash) {
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

  return {
    evidence_id: `met:${sourceObjectId}`,
    evidence_class: "PRIMARY_AUTHORITY",
    vertical_id: "fashion-accessories",
    source_id: "met-costume-institute-open-access",
    source_tier: 1,
    source_object_id: sourceObjectId,
    canonical_id_candidate: `met-object-${sourceObjectId}`,
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
    is_public_domain: record.isPublicDomain === true,
    object_url: record.objectURL || null,
    rights_state: "CC0_COLLECTION_METADATA",
    image_state: "NOT_INGESTED",
    fetched_at: fetchedAt,
    evidence_reference: evidenceReference,
    source_payload_sha256: fullPayloadHash,
    critical_field_completeness: Number((present / Object.keys(criticalFields).length).toFixed(4)),
    publication_state: "POC_INTERNAL_ONLY"
  };
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const config = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(config.output);
const requestLog = [];
const failures = [];
const startedAt = new Date().toISOString();

const searchUrl = new URL(`${config.apiBase}/search`);
searchUrl.searchParams.set("departmentId", String(config.departmentId));
searchUrl.searchParams.set("q", config.query);

const searchResponse = await requestJson(searchUrl.href, config, requestLog);
const objectIds = [...new Set(Array.isArray(searchResponse.payload?.objectIDs) ? searchResponse.payload.objectIDs : [])]
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
    if (record?.department !== "The Costume Institute") continue;
    if (record?.isPublicDomain !== true) continue;

    const fetchedAt = new Date().toISOString();
    const payloadHash = sha256(stableJson(record));
    sanitizedRawRecords.push({
      source_object_id: String(objectId),
      fetched_at: fetchedAt,
      source_payload_sha256: payloadHash,
      source_url: objectUrl,
      ...sanitizeRawRecord(record)
    });
    normalizedRecords.push(normalizeRecord(record, fetchedAt, payloadHash));
  } catch (error) {
    failures.push({ source_object_id: String(objectId), error: error instanceof Error ? error.message : String(error) });
  }
}

const uniqueIds = new Set(normalizedRecords.map(record => record.source_object_id));
const averageCompleteness = normalizedRecords.length
  ? normalizedRecords.reduce((sum, record) => sum + record.critical_field_completeness, 0) / normalizedRecords.length
  : 0;
const completedAt = new Date().toISOString();
const minimumGatePassed = normalizedRecords.length >= config.minimumRecords;

const runManifest = {
  run_id: `met-costume-open-access-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "met-costume-open-access-r1",
  version: "1.0.0",
  status: minimumGatePassed ? "COMPLETED" : "FAILED_MINIMUM_RECORD_GATE",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "BOUNDED_LIVE_METADATA_POC",
  source_id: "met-costume-institute-open-access",
  source_tier: 1,
  vertical_id: "fashion-accessories",
  query: config.query,
  department_id: config.departmentId,
  search_result_count: Number(searchResponse.payload?.total ?? objectIds.length),
  request_budget: config.maximumObjectRequests + 1,
  requests_executed: requestLog.length,
  retry_attempts: config.retryAttempts,
  target_records: config.limit,
  minimum_records: config.minimumRecords,
  normalized_records: normalizedRecords.length,
  failed_object_requests: failures.length,
  credential_used: false,
  paid_access_used: false,
  image_downloaded: false,
  mutation_performed: false,
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
  average_critical_field_completeness: Number(averageCompleteness.toFixed(4)),
  provenance_reference_coverage: normalizedRecords.length
    ? normalizedRecords.filter(record => Boolean(record.evidence_reference)).length / normalizedRecords.length
    : 0,
  image_ingestion_count: 0,
  minimum_record_gate: minimumGatePassed ? "PASS" : "FAIL",
  candidate_eligible: false,
  candidate_blockers: [
    "Single-source sample does not satisfy independent source-family diversity.",
    "Source Trust and Evidence Density methodologies remain pending Track B validation.",
    "No immutable Track A Evidence Package or Candidate Snapshot has been registered."
  ]
};

const evidencePackage = {
  evidence_package_id: `evidence-${runManifest.run_id}`,
  version: "1.0.0",
  status: "POC_EVIDENCE_NOT_CANDIDATE",
  generated_at: completedAt,
  snapshot_id: null,
  methodology_version: "source-trust-methodology-v1",
  evidence_lineage_version: "met-costume-open-access-lineage-r1",
  source_mode: "BOUNDED_LIVE_METADATA_POC",
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
  average_completeness: qualityReport.average_critical_field_completeness,
  output: config.output
}));

if (!minimumGatePassed) process.exitCode = 2;
