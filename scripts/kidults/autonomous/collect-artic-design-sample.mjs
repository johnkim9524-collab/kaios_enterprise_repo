import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FIELD_ALLOWLIST = Object.freeze([
  "id",
  "title",
  "main_reference_number",
  "date_display",
  "date_start",
  "date_end",
  "artist_display",
  "place_of_origin",
  "medium_display",
  "dimensions",
  "classification_titles",
  "style_titles",
  "subject_titles",
  "department_title",
  "api_link",
  "timestamp"
]);

const DEFAULTS = Object.freeze({
  apiBase: "https://api.artic.edu/api/v1",
  query: "design",
  searchLimit: 50,
  limit: 12,
  minimumRecords: 8,
  timeoutMs: 15_000,
  retryAttempts: 3,
  output: "artifacts/autonomous-source-samples/artic-design-open-access-r1"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = argv[++index];
    else if (argument === "--query") config.query = argv[++index];
    else if (argument === "--limit") config.limit = Number(argv[++index]);
    else if (argument === "--minimum-records") config.minimumRecords = Number(argv[++index]);
    else if (argument === "--search-limit") config.searchLimit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("--limit must be an integer between 1 and 25.");
  }
  if (!Number.isInteger(config.minimumRecords) || config.minimumRecords < 1 || config.minimumRecords > config.limit) {
    throw new Error("--minimum-records must be between 1 and --limit.");
  }
  if (!Number.isInteger(config.searchLimit) || config.searchLimit < config.limit || config.searchLimit > 100) {
    throw new Error("--search-limit must be an integer between --limit and 100.");
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
    parsed.hostname !== "api.artic.edu" ||
    !parsed.pathname.startsWith("/api/v1/")
  ) {
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
          "AIC-User-Agent": "KIDULTS-AGCI-OS (contact@kidults.com)",
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

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function cleanTextArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function allowedMetadata(record) {
  return {
    id: Number.isInteger(record?.id) ? record.id : null,
    title: cleanText(record?.title),
    main_reference_number: cleanText(record?.main_reference_number),
    date_display: cleanText(record?.date_display),
    date_start: Number.isFinite(record?.date_start) ? record.date_start : null,
    date_end: Number.isFinite(record?.date_end) ? record.date_end : null,
    artist_display: cleanText(record?.artist_display),
    place_of_origin: cleanText(record?.place_of_origin),
    medium_display: cleanText(record?.medium_display),
    dimensions: cleanText(record?.dimensions),
    classification_titles: cleanTextArray(record?.classification_titles),
    style_titles: cleanTextArray(record?.style_titles),
    subject_titles: cleanTextArray(record?.subject_titles),
    department_title: cleanText(record?.department_title),
    api_link: cleanText(record?.api_link),
    timestamp: cleanText(record?.timestamp)
  };
}

function sanitizeRecord(record, fetchedAt, payloadHash) {
  return {
    source_object_id: String(record.id),
    fetched_at: fetchedAt,
    source_payload_sha256: payloadHash,
    raw_payload_state: "CC0_FIELD_ALLOWLIST_NO_DESCRIPTION_NO_MEDIA",
    image_downloaded: false,
    metadata: allowedMetadata(record)
  };
}

function normalizeRecord(record, fetchedAt, payloadHash) {
  const metadata = allowedMetadata(record);
  const sourceObjectId = String(metadata.id ?? "");
  const evidenceReference = metadata.api_link?.startsWith("https://api.artic.edu/")
    ? metadata.api_link
    : `https://api.artic.edu/api/v1/artworks/${encodeURIComponent(sourceObjectId)}`;
  const critical = {
    source_object_id: sourceObjectId || null,
    title: metadata.title,
    accession_number: metadata.main_reference_number,
    artist_or_maker: metadata.artist_display,
    evidence_reference: evidenceReference
  };
  const present = Object.values(critical).filter(value => value !== null && value !== "").length;
  const designKey = [
    normalizeToken(metadata.artist_display),
    normalizeToken(metadata.title),
    normalizeToken(metadata.date_display),
    normalizeToken(metadata.classification_titles[0])
  ].join("|");

  return {
    evidence_id: `artic:${sourceObjectId}`,
    evidence_class: "PRIMARY_AUTHORITY",
    source_id: "art-institute-chicago-design-api",
    source_tier: 1,
    core_domain_hint: "design-furniture",
    source_object_id: sourceObjectId,
    provider_id_is_canonical_id: false,
    canonical_candidate_key: designKey,
    identity_state: "CANDIDATE_KEY_ONLY",
    title: metadata.title,
    accession_number: metadata.main_reference_number,
    date_display: metadata.date_display,
    date_start: metadata.date_start,
    date_end: metadata.date_end,
    artist_or_maker: metadata.artist_display,
    place_of_origin: metadata.place_of_origin,
    medium: metadata.medium_display,
    dimensions: metadata.dimensions,
    classification_titles: metadata.classification_titles,
    style_titles: metadata.style_titles,
    subject_titles: metadata.subject_titles,
    department_title: metadata.department_title,
    source_timestamp: metadata.timestamp,
    metadata_rights_state: "AIC_ARTWORK_FIELDS_CC0_DESCRIPTION_EXCLUDED_MEDIA_NOT_INGESTED",
    description_state: "EXCLUDED_CC_BY_4_0_FIELD",
    image_state: "NOT_INGESTED",
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

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const config = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(config.output);
const requestLog = [];
const startedAt = new Date().toISOString();
const searchUrl = new URL(`${config.apiBase}/artworks/search`);
searchUrl.searchParams.set("q", config.query);
searchUrl.searchParams.set("limit", String(config.searchLimit));
searchUrl.searchParams.set("fields", FIELD_ALLOWLIST.join(","));

const payload = await requestJson(searchUrl.href, config, requestLog);
const sourceRecords = Array.isArray(payload?.data) ? payload.data : [];
const selected = sourceRecords
  .filter(record => record && typeof record === "object" && Number.isInteger(record.id) && record.title)
  .sort((left, right) => left.id - right.id)
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

const uniqueIds = new Set(normalizedRecords.map(record => record.source_object_id));
const averageCompleteness = normalizedRecords.length
  ? normalizedRecords.reduce((sum, record) => sum + record.critical_field_completeness, 0) / normalizedRecords.length
  : 0;
const completedAt = new Date().toISOString();
const minimumGatePassed = normalizedRecords.length >= config.minimumRecords;
const licenseText = cleanText(payload?.info?.license_text);
const licenseLinks = Array.isArray(payload?.info?.license_links) ? payload.info.license_links.filter(Boolean) : [];
const licenseGatePassed = Boolean(licenseText && /description/i.test(licenseText) && /CC0/i.test(licenseText));

const runManifest = {
  run_id: `artic-design-open-access-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "artic-design-open-access-r1",
  version: "1.0.0",
  status: minimumGatePassed && licenseGatePassed ? "COMPLETED" : "FAILED_GATE",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "BOUNDED_LIVE_METADATA_POC",
  source_id: "art-institute-chicago-design-api",
  source_tier: 1,
  core_domain_hint: "design-furniture",
  query: config.query,
  search_result_count: Number(payload?.pagination?.total ?? sourceRecords.length),
  search_records_returned: sourceRecords.length,
  request_budget: 1,
  requests_executed: requestLog.length,
  retry_attempts: config.retryAttempts,
  target_records: config.limit,
  minimum_records: config.minimumRecords,
  normalized_records: normalizedRecords.length,
  requested_fields: FIELD_ALLOWLIST,
  rights_model: {
    metadata: "CC0_FOR_ARTWORK_FIELDS_EXCEPT_DESCRIPTION",
    description: "EXCLUDED_CC_BY_4_0",
    images: "NOT_INGESTED"
  },
  source_license_text: licenseText,
  source_license_links: licenseLinks,
  source_api_version: cleanText(payload?.info?.version),
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
  rights_state_coverage: normalizedRecords.length
    ? normalizedRecords.filter(record => Boolean(record.metadata_rights_state)).length / normalizedRecords.length
    : 0,
  metadata_rights_state: "AIC_ARTWORK_FIELDS_CC0_DESCRIPTION_EXCLUDED",
  description_ingestion_count: 0,
  image_ingestion_count: 0,
  license_gate: licenseGatePassed ? "PASS" : "FAIL",
  minimum_record_gate: minimumGatePassed ? "PASS" : "FAIL",
  candidate_eligible: false,
  candidate_blockers: [
    "Single-source bounded sample does not satisfy Candidate R2 source diversity.",
    "The CC BY 4.0 description field is intentionally excluded from this run.",
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
  evidence_lineage_version: "artic-design-open-access-lineage-r1",
  source_mode: "BOUNDED_LIVE_METADATA_POC",
  source_ids: ["art-institute-chicago-design-api"],
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
  license_gate: qualityReport.license_gate,
  average_completeness: qualityReport.average_critical_field_completeness,
  output: config.output
}));

if (runManifest.status !== "COMPLETED") process.exitCode = 2;
