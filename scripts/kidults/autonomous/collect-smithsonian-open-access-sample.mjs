import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = Object.freeze({
  apiBase: "https://api.si.edu/openaccess/api/v1.0",
  category: "art_design",
  query: "design",
  start: 0,
  rows: 50,
  sort: "id",
  limit: 12,
  minimumRecords: 8,
  timeoutMs: 15_000,
  retryAttempts: 3,
  output: "artifacts/autonomous-source-samples/smithsonian-open-access-r1"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = argv[++index];
    else if (argument === "--query") config.query = argv[++index];
    else if (argument === "--limit") config.limit = Number(argv[++index]);
    else if (argument === "--minimum-records") config.minimumRecords = Number(argv[++index]);
    else if (argument === "--rows") config.rows = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("--limit must be an integer between 1 and 25.");
  }
  if (!Number.isInteger(config.minimumRecords) || config.minimumRecords < 1 || config.minimumRecords > config.limit) {
    throw new Error("--minimum-records must be between 1 and --limit.");
  }
  if (!Number.isInteger(config.rows) || config.rows < config.limit || config.rows > 100) {
    throw new Error("--rows must be an integer between --limit and 100.");
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
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.si.edu" ||
    !parsed.pathname.startsWith("/openaccess/api/v1.0/")
  ) {
    throw new Error(`Source URL is outside the approved allowlist: ${url}`);
  }
}

function redactUrl(url) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("api_key")) parsed.searchParams.set("api_key", "REDACTED");
  return parsed.href;
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
        url: redactUrl(url),
        method: "GET",
        attempt,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        response_sha256: sha256(text)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < config.retryAttempts) await sleep(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error(`Request failed: ${redactUrl(url)}`);
}

function arrayOfText(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap(item => {
      if (item == null) return [];
      if (typeof item === "string" || typeof item === "number") return [String(item)];
      if (typeof item === "object") {
        for (const key of ["content", "label", "name", "title", "value"]) {
          if (item[key] != null) return arrayOfText(item[key]);
        }
      }
      return [];
    })
    .map(item => item.trim())
    .filter(Boolean);
}

function firstText(...values) {
  for (const value of values) {
    const texts = arrayOfText(value);
    if (texts.length) return texts[0];
  }
  return null;
}

function uniqueText(value) {
  return [...new Set(arrayOfText(value))].sort((left, right) => left.localeCompare(right));
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function allowedMetadata(record) {
  const content = record?.content ?? {};
  const descriptive = content.descriptiveNonRepeating ?? {};
  const indexed = content.indexedStructured ?? {};
  return {
    id: String(record?.id ?? ""),
    title: firstText(record?.title),
    record_id: firstText(descriptive.record_ID),
    data_source: firstText(descriptive.data_source),
    unit_code: firstText(descriptive.unit_code),
    metadata_usage_access: firstText(descriptive.metadata_usage?.access),
    object_types: uniqueText(indexed.object_type),
    dates: uniqueText(indexed.date),
    places: uniqueText(indexed.place),
    topics: uniqueText(indexed.topic),
    cultures: uniqueText(indexed.culture),
    names: uniqueText(indexed.name),
    languages: uniqueText(indexed.language)
  };
}

function sanitizeRecord(record, fetchedAt, payloadHash) {
  return {
    source_object_id: String(record?.id ?? ""),
    fetched_at: fetchedAt,
    source_payload_sha256: payloadHash,
    raw_payload_state: "STRICT_METADATA_ALLOWLIST_NO_MEDIA",
    media_downloaded: false,
    metadata: allowedMetadata(record)
  };
}

function normalizeRecord(record, fetchedAt, payloadHash) {
  const metadata = allowedMetadata(record);
  const sourceObjectId = metadata.id;
  const evidenceReference = `https://api.si.edu/openaccess/api/v1.0/content/${encodeURIComponent(sourceObjectId)}`;
  const critical = {
    source_object_id: sourceObjectId || null,
    title: metadata.title,
    data_source: metadata.data_source,
    object_type: metadata.object_types[0] ?? null,
    evidence_reference: evidenceReference
  };
  const present = Object.values(critical).filter(value => value !== null && value !== "").length;
  const designKey = [
    normalizeToken(metadata.data_source),
    normalizeToken(metadata.title),
    normalizeToken(metadata.object_types[0]),
    normalizeToken(metadata.dates[0])
  ].join("|");

  return {
    evidence_id: `smithsonian:${sourceObjectId}`,
    evidence_class: "PRIMARY_AUTHORITY",
    source_id: "smithsonian-open-access-art-design",
    source_tier: 1,
    core_domain_hint: "design-furniture",
    source_object_id: sourceObjectId,
    provider_id_is_canonical_id: false,
    canonical_candidate_key: designKey,
    identity_state: "CANDIDATE_KEY_ONLY",
    title: metadata.title,
    record_id: metadata.record_id,
    data_source: metadata.data_source,
    unit_code: metadata.unit_code,
    object_types: metadata.object_types,
    dates: metadata.dates,
    places: metadata.places,
    topics: metadata.topics,
    cultures: metadata.cultures,
    names: metadata.names,
    languages: metadata.languages,
    record_access_state: metadata.metadata_usage_access,
    metadata_rights_state: "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTION_MEDIA_NOT_INGESTED",
    media_state: "NOT_INGESTED",
    fetched_at: fetchedAt,
    freshness_state: "CURRENT_AT_FETCH",
    evidence_reference: evidenceReference,
    source_payload_sha256: payloadHash,
    critical_field_completeness: Number((present / Object.keys(critical).length).toFixed(4)),
    publication_state: "POC_INTERNAL_ONLY",
    index_eligible: false,
    production_eligible: false
  };
}

function containsSecret(value, secret) {
  if (!secret || secret === "DEMO_KEY") return false;
  return JSON.stringify(value).includes(secret);
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const config = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(config.output);
const apiKey = process.env.SMITHSONIAN_API_KEY?.trim() || "DEMO_KEY";
const credentialMode = apiKey === "DEMO_KEY" ? "DEMO_KEY_BOUNDED_POC" : "GITHUB_SECRET_API_KEY";
const requestLog = [];
const startedAt = new Date().toISOString();

const searchUrl = new URL(`${config.apiBase}/category/${config.category}/search`);
searchUrl.searchParams.set("q", config.query);
searchUrl.searchParams.set("start", String(config.start));
searchUrl.searchParams.set("rows", String(config.rows));
searchUrl.searchParams.set("sort", config.sort);
searchUrl.searchParams.set("api_key", apiKey);

const payload = await requestJson(searchUrl.href, config, requestLog);
const response = payload?.response ?? {};
const sourceRecords = Array.isArray(response.rows) ? response.rows : [];
const selected = sourceRecords
  .filter(record => record && typeof record === "object" && record.id && record.title)
  .sort((left, right) => String(left.id).localeCompare(String(right.id)))
  .slice(0, config.limit);

const fetchedAt = new Date().toISOString();
const sanitizedRawRecords = selected.map(record => {
  const payloadHash = sha256(stableJson(record));
  return sanitizeRecord(record, fetchedAt, payloadHash);
});
const normalizedRecords = selected.map(record => {
  const payloadHash = sha256(stableJson(record));
  return normalizeRecord(record, fetchedAt, payloadHash);
});

if (containsSecret({ requestLog, sanitizedRawRecords, normalizedRecords }, apiKey)) {
  throw new Error("API key leaked into a persisted output.");
}

const uniqueIds = new Set(normalizedRecords.map(record => record.source_object_id));
const averageCompleteness = normalizedRecords.length
  ? normalizedRecords.reduce((sum, record) => sum + record.critical_field_completeness, 0) / normalizedRecords.length
  : 0;
const completedAt = new Date().toISOString();
const minimumGatePassed = normalizedRecords.length >= config.minimumRecords;

const runManifest = {
  run_id: `smithsonian-open-access-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "smithsonian-open-access-r1",
  version: "1.0.0",
  status: minimumGatePassed ? "COMPLETED" : "FAILED_MINIMUM_RECORD_GATE",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "BOUNDED_LIVE_METADATA_POC",
  source_id: "smithsonian-open-access-art-design",
  source_tier: 1,
  core_domain_hint: "design-furniture",
  category: config.category,
  query: config.query,
  search_result_count: Number(response.rowCount ?? sourceRecords.length),
  search_records_returned: sourceRecords.length,
  request_budget: 1,
  requests_executed: requestLog.length,
  retry_attempts: config.retryAttempts,
  target_records: config.limit,
  minimum_records: config.minimumRecords,
  normalized_records: normalizedRecords.length,
  rights_model: {
    metadata: "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTIONS",
    media: "NOT_INGESTED; RECORD_LEVEL_MEDIA_LIMITS_PRESERVED"
  },
  credential_mode: credentialMode,
  api_key_persisted: false,
  api_key_logged: false,
  paid_access_used: false,
  media_downloaded: false,
  mutation_performed: false,
  production_eligible: false,
  candidate_publication_authorized: false,
  request_log: requestLog
};

const qualityReport = {
  run_id: runManifest.run_id,
  unique_record_count: uniqueIds.size,
  duplicate_record_count: normalizedRecords.length - uniqueIds.size,
  average_critical_field_completeness: Number(averageCompleteness.toFixed(4)),
  provenance_reference_coverage: normalizedRecords.length
    ? normalizedRecords.filter(record => Boolean(record.evidence_reference)).length / normalizedRecords.length
    : 0,
  rights_state_coverage: normalizedRecords.length
    ? normalizedRecords.filter(record => Boolean(record.metadata_rights_state)).length / normalizedRecords.length
    : 0,
  metadata_rights_state: "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTIONS",
  media_ingestion_count: 0,
  minimum_record_gate: minimumGatePassed ? "PASS" : "FAIL",
  candidate_eligible: false,
  candidate_blockers: [
    "Single-source bounded sample does not satisfy Candidate R2 source diversity.",
    "Record-level media rights remain outside this metadata-only run.",
    "No rights-cleared transaction evidence is present.",
    "Golden Dataset entity-resolution accuracy has not been validated by Track B."
  ]
};

const evidencePackage = {
  evidence_package_id: `evidence-${runManifest.run_id}`,
  version: "1.0.0",
  status: "POC_EVIDENCE_NOT_CANDIDATE",
  generated_at: completedAt,
  snapshot_id: null,
  methodology_version: "source-trust-methodology-v1",
  evidence_lineage_version: "smithsonian-open-access-lineage-r1",
  source_mode: "BOUNDED_LIVE_METADATA_POC",
  source_ids: ["smithsonian-open-access-art-design"],
  record_count: normalizedRecords.length,
  records: normalizedRecords,
  known_limitations: qualityReport.candidate_blockers,
  production_eligible: false,
  commercial_publication_authorized: false
};

writeJson(outputDirectory, "run-manifest.json", runManifest);
writeJson(outputDirectory, "sanitized-raw-records.json", sanitizedRawRecords);
writeJson(outputDirectory, "normalized-evidence-records.json", normalizedRecords);
writeJson(outputDirectory, "evidence-package.json", evidencePackage);
writeJson(outputDirectory, "quality-report.json", qualityReport);

console.log(JSON.stringify({
  status: runManifest.status,
  run_id: runManifest.run_id,
  credential_mode: credentialMode,
  search_result_count: runManifest.search_result_count,
  normalized_records: normalizedRecords.length,
  average_completeness: qualityReport.average_critical_field_completeness,
  output: config.output
}));

if (!minimumGatePassed) process.exitCode = 2;
