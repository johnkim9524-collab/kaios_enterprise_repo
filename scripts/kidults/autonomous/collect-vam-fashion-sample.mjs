import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = Object.freeze({
  apiBase: "https://api.vam.ac.uk/v2",
  query: "dress",
  pageSize: 100,
  limit: 12,
  minimumRecords: 8,
  timeoutMs: 15_000,
  retryAttempts: 3,
  output: "artifacts/autonomous-source-samples/vam-fashion-collections-r1"
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
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.vam.ac.uk") {
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
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < config.retryAttempts) await sleep(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

function relevanceText(record) {
  return [record.objectType, record._primaryTitle, record._primaryMaker?.name]
    .filter(Boolean)
    .join(" ");
}

function isFashionRelevant(record) {
  return /dress|gown|costume|garment|jacket|coat|cape|hat|shoe|boot|bag|handbag|jewel|brooch|earring|necklace|bracelet|accessor|textile|fashion/i
    .test(relevanceText(record));
}

function sanitizeRecord(record) {
  const {
    _images: _images,
    _imagesMeta: _imagesMeta,
    _primaryImageId: _primaryImageId,
    ...metadataOnly
  } = record;
  return {
    raw_payload_state: "SANITIZED_SUMMARY_METADATA_ONLY",
    image_downloaded: false,
    metadata: metadataOnly
  };
}

function normalizeRecord(record, fetchedAt, payloadHash) {
  const sourceObjectId = String(record.systemNumber ?? "");
  const critical = {
    system_number: sourceObjectId || null,
    accession_number: record.accessionNumber || null,
    object_type: record.objectType || null,
    title: record._primaryTitle || null,
    maker: record._primaryMaker?.name || null,
    production_date: record._primaryDate || null
  };
  const present = Object.values(critical).filter(value => value !== null && value !== "").length;
  return {
    evidence_id: `vam:${sourceObjectId}`,
    evidence_class: "PRIMARY_AUTHORITY",
    vertical_id: "fashion-accessories",
    source_id: "vam-collections-api-fashion",
    source_tier: 1,
    source_object_id: sourceObjectId,
    canonical_id_candidate: `vam-object-${sourceObjectId}`,
    accession_number: record.accessionNumber || null,
    object_type: record.objectType || null,
    title: record._primaryTitle || null,
    maker_or_artist: record._primaryMaker?.name || null,
    maker_association: record._primaryMaker?.association || null,
    production_date: record._primaryDate || null,
    primary_place: record._primaryPlace || null,
    current_location: record._currentLocation?.displayName || null,
    on_display: record._currentLocation?.onDisplay === true,
    warning_types: Array.isArray(record._warningTypes) ? record._warningTypes : [],
    metadata_rights_state: "V_AND_A_API_TERMS_INTERNAL_NONCOMMERCIAL_POC_ONLY",
    image_state: "NOT_INGESTED",
    fetched_at: fetchedAt,
    evidence_reference: `https://collections.vam.ac.uk/item/${encodeURIComponent(sourceObjectId)}/`,
    source_payload_sha256: payloadHash,
    critical_field_completeness: Number((present / Object.keys(critical).length).toFixed(4)),
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
const startedAt = new Date().toISOString();
const searchUrl = new URL(`${config.apiBase}/objects/search`);
searchUrl.searchParams.set("q", config.query);
searchUrl.searchParams.set("page_size", String(config.pageSize));
searchUrl.searchParams.set("response_format", "json");

const payload = await requestJson(searchUrl.href, config, requestLog);
const sourceRecords = Array.isArray(payload?.records) ? payload.records : [];
const selected = sourceRecords
  .filter(record => record && typeof record === "object")
  .filter(isFashionRelevant)
  .filter(record => record.systemNumber && record.accessionNumber && record.objectType)
  .sort((left, right) => String(left.systemNumber).localeCompare(String(right.systemNumber)))
  .slice(0, config.limit);

const fetchedAt = new Date().toISOString();
const sanitizedRawRecords = selected.map(record => ({
  source_object_id: String(record.systemNumber),
  fetched_at: fetchedAt,
  source_payload_sha256: sha256(stableJson(record)),
  source_url: searchUrl.href,
  ...sanitizeRecord(record)
}));
const normalizedRecords = selected.map(record => normalizeRecord(record, fetchedAt, sha256(stableJson(record))));
const uniqueIds = new Set(normalizedRecords.map(record => record.source_object_id));
const averageCompleteness = normalizedRecords.length
  ? normalizedRecords.reduce((sum, record) => sum + record.critical_field_completeness, 0) / normalizedRecords.length
  : 0;
const completedAt = new Date().toISOString();
const minimumGatePassed = normalizedRecords.length >= config.minimumRecords;

const runManifest = {
  run_id: `vam-fashion-collections-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "vam-fashion-collections-r1",
  version: "1.0.0",
  status: minimumGatePassed ? "COMPLETED" : "FAILED_MINIMUM_RECORD_GATE",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "BOUNDED_LIVE_METADATA_POC",
  source_id: "vam-collections-api-fashion",
  source_tier: 1,
  vertical_id: "fashion-accessories",
  query: config.query,
  search_result_count: Number(payload?.info?.record_count ?? sourceRecords.length),
  search_records_returned: sourceRecords.length,
  requests_executed: requestLog.length,
  target_records: config.limit,
  minimum_records: config.minimumRecords,
  normalized_records: normalizedRecords.length,
  rights_model: {
    metadata: "V_AND_A_API_TERMS_SECTION_9_3_INTERNAL_NONCOMMERCIAL_POC_ONLY",
    images: "NOT_INGESTED"
  },
  credential_used: false,
  paid_access_used: false,
  image_downloaded: false,
  mutation_performed: false,
  production_eligible: false,
  commercial_publication_authorized: false,
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
  metadata_rights_state: "INTERNAL_NONCOMMERCIAL_POC_ONLY",
  image_ingestion_count: 0,
  minimum_record_gate: minimumGatePassed ? "PASS" : "FAIL",
  candidate_eligible: false,
  candidate_blockers: [
    "V&A terms do not provide commercial-publication clearance for this PoC.",
    "Cross-source entity resolution against The Met has not yet been completed.",
    "No rights-cleared transaction evidence is present.",
    "Source Trust and Evidence Density methodologies remain pending Track B validation."
  ]
};

const evidencePackage = {
  evidence_package_id: `evidence-${runManifest.run_id}`,
  version: "1.0.0",
  status: "POC_EVIDENCE_NOT_CANDIDATE",
  generated_at: completedAt,
  snapshot_id: null,
  methodology_version: "source-trust-methodology-v1",
  evidence_lineage_version: "vam-fashion-collections-lineage-r1",
  source_mode: "BOUNDED_LIVE_METADATA_POC",
  source_ids: ["vam-collections-api-fashion"],
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
  search_result_count: runManifest.search_result_count,
  normalized_records: normalizedRecords.length,
  average_completeness: qualityReport.average_critical_field_completeness,
  output: config.output
}));

if (!minimumGatePassed) process.exitCode = 2;
